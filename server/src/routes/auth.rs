use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use chrono::{Duration, NaiveDateTime, Utc};
use serde::Deserialize;
use sqlx::MySqlPool;
use uuid::Uuid;

use crate::auth::invite::{generate_invite_code, normalize_invite_code};
use crate::auth::password::{hash_password, obscure_missing_user, password_matches, validate_password};
use crate::auth::token::{issue_tokens, refresh_expiry, sha256_hex};
use crate::dto::AuthResponse;
use crate::error::{duplicate_kind, AppError, DuplicateKind};
use crate::profile::load_me;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RegisterBody {
    role: String,
    email: String,
    password: String,
    #[serde(default)]
    class_name: Option<String>,
    #[serde(default)]
    invite_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LoginBody {
    email: String,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RefreshBody {
    refresh_token: String,
}

#[derive(sqlx::FromRow)]
struct UserSecret {
    id: String,
    password_hash: String,
    role: String,
}

#[derive(sqlx::FromRow)]
struct AttemptRow {
    failed_count: i32,
    locked_until: Option<NaiveDateTime>,
}

#[derive(sqlx::FromRow)]
struct RefreshRow {
    id: String,
    user_id: String,
    expires_at: NaiveDateTime,
    revoked_at: Option<NaiveDateTime>,
    role: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterBody>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    let role = parse_role(&body.role)?;
    let email = normalize_email(&body.email)?;
    validate_password(&body.password)?;
    let class_name = match role {
        "teacher" => Some(normalize_class_name(
            body.class_name.as_deref().unwrap_or(""),
        )?),
        _ => None,
    };
    let invite_code = match role {
        "student" => match body.invite_code.as_deref() {
            Some(raw) => normalize_invite_code(raw).map_err(|_| {
                AppError::validation("邀请码格式不正确")
            })?,
            None => None,
        },
        _ => None,
    };

    let password_hash = hash_password(&body.password, state.config.fast_hash)?;
    let user_id = Uuid::now_v7().to_string();

    let mut tx = state.pool.begin().await?;
    if let Some(code) = invite_code.as_deref() {
        let class_id = find_class_id(&mut tx, code).await?;
        insert_user(&mut tx, &user_id, &email, &password_hash, role).await?;
        sqlx::query("INSERT INTO class_members (class_id, user_id) VALUES (?, ?)")
            .bind(class_id)
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;
    } else if let Some(name) = class_name.as_deref() {
        insert_user(&mut tx, &user_id, &email, &password_hash, role).await?;
        insert_class(&mut tx, &user_id, name).await?;
    } else {
        insert_user(&mut tx, &user_id, &email, &password_hash, role).await?;
    }
    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(auth_response(&state, &user_id, role).await?)))
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> Result<Json<AuthResponse>, AppError> {
    let email = normalize_email(&body.email)?;
    ensure_not_locked(&state.pool, &email).await?;
    if body.password.is_empty() || body.password.len() > 72 {
        return Err(record_failure(&state.pool, &email).await?);
    }

    let user = sqlx::query_as::<_, UserSecret>(
        "SELECT id, password_hash, role FROM users WHERE email = ?",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;

    let Some(user) = user else {
        obscure_missing_user(&body.password, state.config.fast_hash);
        return Err(record_failure(&state.pool, &email).await?);
    };

    if !password_matches(&body.password, &user.password_hash, state.config.fast_hash) {
        return Err(record_failure(&state.pool, &email).await?);
    }

    sqlx::query("DELETE FROM login_attempts WHERE email = ?")
        .bind(&email)
        .execute(&state.pool)
        .await?;

    Ok(Json(auth_response(&state, &user.id, &user.role).await?))
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(body): Json<RefreshBody>,
) -> Result<Json<AuthResponse>, AppError> {
    let row = load_refresh(&state.pool, &body.refresh_token).await?;
    let now = Utc::now().naive_utc();
    if row.revoked_at.is_some() || row.expires_at <= now {
        return Err(AppError::unauthorized());
    }

    let mut tx = state.pool.begin().await?;
    let updated = sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
    )
    .bind(now)
    .bind(&row.id)
    .execute(&mut *tx)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(AppError::unauthorized());
    }

    let (access, refresh_token) = {
        let (refresh_token, hash) = crate::auth::token::new_refresh_token();
        sqlx::query(
            "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&row.user_id)
        .bind(hash)
        .bind(refresh_expiry(&state.config))
        .execute(&mut *tx)
        .await?;
        let access = crate::auth::token::encode_access(&row.user_id, &row.role, &state.config)?;
        (access, refresh_token)
    };
    tx.commit().await?;

    let user = load_me(&state.pool, &row.user_id).await?;
    Ok(Json(AuthResponse {
        access_token: access,
        refresh_token,
        user,
    }))
}

pub async fn logout(
    State(state): State<AppState>,
    Json(body): Json<RefreshBody>,
) -> Result<StatusCode, AppError> {
    let hash = sha256_hex(body.refresh_token.trim());
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    )
    .bind(Utc::now().naive_utc())
    .bind(hash)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn auth_response(state: &AppState, user_id: &str, role: &str) -> Result<AuthResponse, AppError> {
    let (access_token, refresh_token) =
        issue_tokens(&state.pool, &state.config, user_id, role).await?;
    let user = load_me(&state.pool, user_id).await?;
    Ok(AuthResponse {
        access_token,
        refresh_token,
        user,
    })
}

async fn insert_user(
    tx: &mut sqlx::MySqlTransaction<'_>,
    id: &str,
    email: &str,
    password_hash: &str,
    role: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, NULL)",
    )
    .bind(id)
    .bind(email)
    .bind(password_hash)
    .bind(role)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_class(
    tx: &mut sqlx::MySqlTransaction<'_>,
    teacher_id: &str,
    name: &str,
) -> Result<(), AppError> {
    for _ in 0..5 {
        let code = generate_invite_code();
        let result = sqlx::query(
            "INSERT INTO classes (id, teacher_id, name, invite_code) VALUES (?, ?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(teacher_id)
        .bind(name)
        .bind(&code)
        .execute(&mut **tx)
        .await;
        match result {
            Ok(_) => return Ok(()),
            Err(err) if duplicate_kind(&err) == Some(DuplicateKind::Invite) => continue,
            Err(err) => return Err(err.into()),
        }
    }
    tracing::error!("invite code collision retries exhausted");
    Err(AppError::internal())
}

async fn find_class_id(tx: &mut sqlx::MySqlTransaction<'_>, code: &str) -> Result<String, AppError> {
    let class_id = sqlx::query_scalar::<_, String>("SELECT id FROM classes WHERE invite_code = ?")
        .bind(code)
        .fetch_optional(&mut **tx)
        .await?;
    class_id.ok_or_else(AppError::invalid_invite)
}

async fn load_refresh(pool: &MySqlPool, token: &str) -> Result<RefreshRow, AppError> {
    let hash = sha256_hex(token.trim());
    sqlx::query_as::<_, RefreshRow>(
        "SELECT t.id, t.user_id, t.expires_at, t.revoked_at, u.role
         FROM refresh_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ?",
    )
    .bind(hash)
    .fetch_optional(pool)
    .await?
    .ok_or_else(AppError::unauthorized)
}

async fn ensure_not_locked(pool: &MySqlPool, email: &str) -> Result<(), AppError> {
    let row = attempt_row(pool, email).await?;
    if let Some(row) = row {
        if let Some(until) = row.locked_until {
            if until > Utc::now().naive_utc() {
                return Err(AppError::locked());
            }
        }
    }
    Ok(())
}

async fn record_failure(pool: &MySqlPool, email: &str) -> Result<AppError, AppError> {
    let now = Utc::now().naive_utc();
    let row = attempt_row(pool, email).await?;
    let lock_expired = row
        .as_ref()
        .and_then(|row| row.locked_until)
        .map(|until| until <= now)
        .unwrap_or(false);
    let count = if lock_expired {
        1
    } else {
        row.map(|row| row.failed_count).unwrap_or(0) + 1
    };
    let locked_until = if count >= 8 {
        Some(now + Duration::minutes(15))
    } else {
        None
    };
    sqlx::query(
        "INSERT INTO login_attempts (email, failed_count, locked_until) VALUES (?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE failed_count = new.failed_count, locked_until = new.locked_until",
    )
    .bind(email)
    .bind(count)
    .bind(locked_until)
    .execute(pool)
    .await?;
    if locked_until.is_some() {
        Ok(AppError::locked())
    } else {
        Ok(AppError::invalid_credentials())
    }
}

async fn attempt_row(pool: &MySqlPool, email: &str) -> Result<Option<AttemptRow>, AppError> {
    Ok(sqlx::query_as::<_, AttemptRow>(
        "SELECT failed_count, locked_until FROM login_attempts WHERE email = ?",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?)
}

fn parse_role(role: &str) -> Result<&'static str, AppError> {
    match role {
        "teacher" => Ok("teacher"),
        "student" => Ok("student"),
        _ => Err(AppError::validation("请选择老师或学生")),
    }
}

pub fn normalize_email(raw: &str) -> Result<String, AppError> {
    let email = raw.trim().to_lowercase();
    let Some((local, domain)) = email.split_once('@') else {
        return Err(AppError::validation("请输入有效邮箱"));
    };
    if email.len() > 255
        || local.is_empty()
        || domain.len() < 3
        || !domain.contains('.')
        || domain.starts_with('.')
        || domain.ends_with('.')
        || email.chars().any(|ch| ch.is_whitespace())
    {
        return Err(AppError::validation("请输入有效邮箱"));
    }
    Ok(email)
}

pub fn normalize_class_name(raw: &str) -> Result<String, AppError> {
    let name = raw.trim();
    let length = name.chars().count();
    if !(1..=64).contains(&length) {
        return Err(AppError::validation("班级名需要 1 到 64 个字"));
    }
    Ok(name.to_string())
}

pub fn normalize_display_name(raw: &str) -> Result<Option<String>, AppError> {
    let name = raw.trim();
    if name.is_empty() {
        return Ok(None);
    }
    if name.chars().count() > 64 {
        return Err(AppError::validation("姓名不能超过 64 个字"));
    }
    Ok(Some(name.to_string()))
}
