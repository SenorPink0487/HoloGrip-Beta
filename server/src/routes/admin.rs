use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{Duration, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;
use uuid::Uuid;

use crate::auth::invite::{generate_invite_code, normalize_invite_code};
use crate::auth::password::{hash_password, validate_password};
use crate::dto::StudentView;
use crate::error::{duplicate_kind, AppError, DuplicateKind};
use crate::routes::auth::{normalize_class_name, normalize_display_name, normalize_email};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminOverviewResponse {
    pub total_users: i64,
    pub teacher_count: i64,
    pub student_count: i64,
    pub total_classes: i64,
    pub total_enrollments: i64,
    pub unassigned_students: i64,
    pub active_sessions: i64,
    pub revoked_sessions: i64,
    pub expired_sessions: i64,
    pub locked_accounts: i64,
    pub warning_accounts: i64,
    pub total_whiteboards: i64,
    pub total_whiteboard_revisions: i64,
    pub total_whiteboard_ops: i64,
    pub class_metrics: Vec<ClassMetricItem>,
    pub registration_trend: Vec<TrendPoint>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassMetricItem {
    pub id: String,
    pub name: String,
    pub invite_code: String,
    pub teacher_name: String,
    pub teacher_email: String,
    pub student_count: i64,
    pub whiteboard_revision: i64,
    pub whiteboard_ops: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendPoint {
    pub date: String,
    pub teachers: i64,
    pub students: i64,
    pub operations: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUserView {
    pub is_admin: bool,
    pub preferences: serde_json::Value,
    pub id: String,
    pub email: String,
    pub role: String,
    pub display_name: Option<String>,
    pub class_id: Option<String>,
    pub class_name: Option<String>,
    pub invite_code: Option<String>,
    pub student_count: i64,
    pub active_sessions: i64,
    pub failed_attempts: i64,
    pub locked_until: Option<String>,
    pub is_locked: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminClassView {
    pub id: String,
    pub name: String,
    pub invite_code: String,
    pub teacher_id: String,
    pub teacher_name: Option<String>,
    pub teacher_email: String,
    pub student_count: i64,
    pub whiteboard_revision: i64,
    pub whiteboard_ops_count: i64,
    pub whiteboard_updated_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub students: Vec<StudentView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityAuditResponse {
    pub login_attempts: Vec<LoginAttemptView>,
    pub sessions: Vec<SessionAuditView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginAttemptView {
    pub email: String,
    pub user_id: Option<String>,
    pub display_name: Option<String>,
    pub role: Option<String>,
    pub failed_count: i32,
    pub locked_until: Option<String>,
    pub is_locked: bool,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAuditView {
    pub id: String,
    pub user_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub role: String,
    pub token_fingerprint: String,
    pub status: String,
    pub created_at: String,
    pub expires_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAdminUserBody {
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default)]
    pub preferences: Option<crate::preferences::AccountPreferences>,
    pub role: String,
    pub email: String,
    pub password: String,
    pub display_name: String,
    #[serde(default)]
    pub class_name: Option<String>,
    #[serde(default)]
    pub invite_code: Option<String>,
    #[serde(default)]
    pub class_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAdminUserBody {
    #[serde(default)]
    pub is_admin: Option<bool>,
    #[serde(default)]
    pub preferences: Option<crate::preferences::AccountPreferences>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub class_id: Option<String>,
    #[serde(default)]
    pub class_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAdminClassBody {
    pub teacher_id: String,
    pub name: String,
    #[serde(default)]
    pub invite_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAdminClassBody {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub invite_code: Option<String>,
    #[serde(default)]
    pub teacher_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMemberBody {
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailActionBody {
    pub email: String,
    #[serde(default)]
    pub minutes: Option<i64>,
}

fn format_dt(dt: NaiveDateTime) -> String {
    format!("{}Z", dt.format("%Y-%m-%dT%H:%M:%S%.3f"))
}

pub async fn get_overview(
    State(state): State<AppState>,
) -> Result<Json<AdminOverviewResponse>, AppError> {
    let pool = &state.pool;
    let now = Utc::now().naive_utc();

    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    let teacher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'teacher'")
            .fetch_one(pool)
            .await?;
    let student_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'student'")
            .fetch_one(pool)
            .await?;
    let total_classes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM classes")
        .fetch_one(pool)
        .await?;
    let total_enrollments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM class_members")
        .fetch_one(pool)
        .await?;
    let unassigned_students = (student_count - total_enrollments).max(0);

    let active_sessions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > ?",
    )
    .bind(now)
    .fetch_one(pool)
    .await?;

    let revoked_sessions: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at IS NOT NULL")
            .fetch_one(pool)
            .await?;

    let expired_sessions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at <= ?",
    )
    .bind(now)
    .fetch_one(pool)
    .await?;

    let locked_accounts: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM login_attempts WHERE locked_until > ?")
            .bind(now)
            .fetch_one(pool)
            .await?;

    let warning_accounts: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM login_attempts WHERE failed_count > 0")
            .fetch_one(pool)
            .await?;

    let total_whiteboards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM class_whiteboards")
        .fetch_one(pool)
        .await?;

    let total_whiteboard_revisions: i64 = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(revision), 0) AS SIGNED) FROM class_whiteboards",
    )
    .fetch_one(pool)
    .await?;

    let total_whiteboard_ops: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM whiteboard_operations")
            .fetch_one(pool)
            .await?;

    #[derive(sqlx::FromRow)]
    struct ClassMetricRow {
        id: String,
        name: String,
        invite_code: String,
        teacher_name: Option<String>,
        teacher_email: String,
        student_count: i64,
        whiteboard_revision: i64,
        whiteboard_ops: i64,
    }

    let class_rows = sqlx::query_as::<_, ClassMetricRow>(
        "SELECT
            c.id,
            c.name,
            c.invite_code,
            u.display_name AS teacher_name,
            u.email AS teacher_email,
            (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS student_count,
            CAST(COALESCE(w.revision, 0) AS SIGNED) AS whiteboard_revision,
            (SELECT COUNT(*) FROM whiteboard_operations wo WHERE wo.class_id = c.id) AS whiteboard_ops
         FROM classes c
         JOIN users u ON u.id = c.teacher_id
         LEFT JOIN class_whiteboards w ON w.class_id = c.id
         ORDER BY student_count DESC, c.created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    let class_metrics = class_rows
        .into_iter()
        .map(|row| ClassMetricItem {
            id: row.id,
            name: row.name,
            invite_code: row.invite_code,
            teacher_name: row
                .teacher_name
                .unwrap_or_else(|| row.teacher_email.clone()),
            teacher_email: row.teacher_email,
            student_count: row.student_count,
            whiteboard_revision: row.whiteboard_revision,
            whiteboard_ops: row.whiteboard_ops,
        })
        .collect();

    #[derive(sqlx::FromRow)]
    struct DayRoleCount {
        day: String,
        role: String,
        cnt: i64,
    }

    let user_days = sqlx::query_as::<_, DayRoleCount>(
        "SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, role, COUNT(*) AS cnt
         FROM users
         GROUP BY day, role
         ORDER BY day ASC",
    )
    .fetch_all(pool)
    .await?;

    #[derive(sqlx::FromRow)]
    struct DayOpCount {
        day: String,
        cnt: i64,
    }

    let op_days = sqlx::query_as::<_, DayOpCount>(
        "SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS cnt
         FROM whiteboard_operations
         GROUP BY day
         ORDER BY day ASC",
    )
    .fetch_all(pool)
    .await?;

    let mut days_set = std::collections::BTreeSet::new();
    for i in (0..7).rev() {
        let d = (Utc::now() - Duration::days(i))
            .format("%Y-%m-%d")
            .to_string();
        days_set.insert(d);
    }
    for row in &user_days {
        days_set.insert(row.day.clone());
    }
    for row in &op_days {
        days_set.insert(row.day.clone());
    }

    let registration_trend: Vec<TrendPoint> = days_set
        .into_iter()
        .rev()
        .take(10)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|date| {
            let teachers = user_days
                .iter()
                .find(|r| r.day == date && r.role == "teacher")
                .map(|r| r.cnt)
                .unwrap_or(0);
            let students = user_days
                .iter()
                .find(|r| r.day == date && r.role == "student")
                .map(|r| r.cnt)
                .unwrap_or(0);
            let operations = op_days
                .iter()
                .find(|r| r.day == date)
                .map(|r| r.cnt)
                .unwrap_or(0);
            TrendPoint {
                date,
                teachers,
                students,
                operations,
            }
        })
        .collect();

    Ok(Json(AdminOverviewResponse {
        total_users,
        teacher_count,
        student_count,
        total_classes,
        total_enrollments,
        unassigned_students,
        active_sessions,
        revoked_sessions,
        expired_sessions,
        locked_accounts,
        warning_accounts,
        total_whiteboards,
        total_whiteboard_revisions,
        total_whiteboard_ops,
        class_metrics,
        registration_trend,
    }))
}

#[derive(sqlx::FromRow)]
struct AdminUserRow {
    is_admin: bool,
    preferences: Option<String>,
    id: String,
    email: String,
    role: String,
    display_name: Option<String>,
    teacher_class_id: Option<String>,
    teacher_class_name: Option<String>,
    teacher_invite_code: Option<String>,
    teacher_student_count: i64,
    student_class_id: Option<String>,
    student_class_name: Option<String>,
    student_invite_code: Option<String>,
    active_sessions: i64,
    failed_attempts: i64,
    locked_until: Option<NaiveDateTime>,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

impl AdminUserRow {
    fn into_view(self, now: NaiveDateTime) -> AdminUserView {
        let (class_id, class_name, invite_code, student_count) = if self.role == "teacher" {
            (
                self.teacher_class_id,
                self.teacher_class_name,
                self.teacher_invite_code,
                self.teacher_student_count,
            )
        } else {
            (
                self.student_class_id,
                self.student_class_name,
                self.student_invite_code,
                0,
            )
        };
        let is_locked = self.locked_until.map(|until| until > now).unwrap_or(false);
        AdminUserView {
            is_admin: self.is_admin,
            preferences: self
                .preferences
                .and_then(|v| serde_json::from_str(&v).ok())
                .unwrap_or(serde_json::json!({})),
            id: self.id,
            email: self.email,
            role: self.role,
            display_name: self.display_name,
            class_id,
            class_name,
            invite_code,
            student_count,
            active_sessions: self.active_sessions,
            failed_attempts: self.failed_attempts,
            locked_until: self.locked_until.map(format_dt),
            is_locked,
            created_at: format_dt(self.created_at),
            updated_at: format_dt(self.updated_at),
        }
    }
}

const USER_QUERY_BASE: &str = "
    SELECT
        u.id,
        u.email,
        u.role,
        u.is_admin,
        CAST(u.preferences AS CHAR) AS preferences,
        u.display_name,
        tc.id AS teacher_class_id,
        tc.name AS teacher_class_name,
        tc.invite_code AS teacher_invite_code,
        (SELECT COUNT(*) FROM class_members tm WHERE tm.class_id = tc.id) AS teacher_student_count,
        sc.id AS student_class_id,
        sc.name AS student_class_name,
        sc.invite_code AS student_invite_code,
        (SELECT COUNT(*) FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.revoked_at IS NULL AND rt.expires_at > UTC_TIMESTAMP(3)) AS active_sessions,
        CAST(COALESCE(la.failed_count, 0) AS SIGNED) AS failed_attempts,
        la.locked_until,
        u.created_at,
        u.updated_at
    FROM users u
    LEFT JOIN classes tc ON tc.teacher_id = u.id
    LEFT JOIN class_members cm ON cm.user_id = u.id
    LEFT JOIN classes sc ON sc.id = cm.class_id
    LEFT JOIN login_attempts la ON la.email = u.email
";

async fn fetch_admin_user(pool: &MySqlPool, user_id: &str) -> Result<AdminUserView, AppError> {
    let sql = format!("{USER_QUERY_BASE} WHERE u.id = ?");
    let row = sqlx::query_as::<_, AdminUserRow>(&sql)
        .bind(user_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::new(StatusCode::NOT_FOUND, "user_not_found", "用户不存在"))?;
    Ok(row.into_view(Utc::now().naive_utc()))
}

pub async fn list_users(
    State(state): State<AppState>,
) -> Result<Json<Vec<AdminUserView>>, AppError> {
    let sql = format!("{USER_QUERY_BASE} ORDER BY u.created_at DESC, u.email ASC");
    let rows = sqlx::query_as::<_, AdminUserRow>(&sql)
        .fetch_all(&state.pool)
        .await?;
    let now = Utc::now().naive_utc();
    Ok(Json(rows.into_iter().map(|r| r.into_view(now)).collect()))
}

pub async fn create_user(
    State(state): State<AppState>,
    Json(body): Json<CreateAdminUserBody>,
) -> Result<(StatusCode, Json<AdminUserView>), AppError> {
    let role = match body.role.as_str() {
        "teacher" => "teacher",
        "student" => "student",
        _ => return Err(AppError::validation("角色必须是 teacher 或 student")),
    };
    let email = normalize_email(&body.email)?;
    let display_name = normalize_display_name(&body.display_name)?
        .ok_or_else(|| AppError::validation("请填写姓名/显示名称"))?;
    validate_password(&body.password)?;
    let password_hash = hash_password(&body.password, state.config.fast_hash)?;
    let user_id = Uuid::now_v7().to_string();

    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&user_id)
    .bind(&email)
    .bind(&password_hash)
    .bind(role)
    .bind(&display_name)
    .execute(&mut *tx)
    .await?;

    if role == "teacher" {
        if let Some(raw_cname) = body.class_name.as_deref() {
            if !raw_cname.trim().is_empty() {
                let cname = normalize_class_name(raw_cname)?;
                insert_class_tx(&mut tx, &user_id, &cname, None).await?;
            }
        }
    } else if role == "student" {
        if let Some(cid) = body.class_id.as_deref().filter(|s| !s.trim().is_empty()) {
            let exists: Option<String> = sqlx::query_scalar("SELECT id FROM classes WHERE id = ?")
                .bind(cid.trim())
                .fetch_optional(&mut *tx)
                .await?;
            let class_id = exists.ok_or_else(|| AppError::validation("指定的班级不存在"))?;
            sqlx::query("INSERT INTO class_members (class_id, user_id) VALUES (?, ?)")
                .bind(class_id)
                .bind(&user_id)
                .execute(&mut *tx)
                .await?;
        } else if let Some(raw_code) = body.invite_code.as_deref().filter(|s| !s.trim().is_empty())
        {
            let code = normalize_invite_code(raw_code)
                .map_err(|_| AppError::validation("邀请码格式不正确（需为5位字母或数字）"))?
                .ok_or_else(|| AppError::validation("邀请码不能为空"))?;
            let class_id: Option<String> =
                sqlx::query_scalar("SELECT id FROM classes WHERE invite_code = ?")
                    .bind(&code)
                    .fetch_optional(&mut *tx)
                    .await?;
            let class_id = class_id.ok_or_else(AppError::invalid_invite)?;
            sqlx::query("INSERT INTO class_members (class_id, user_id) VALUES (?, ?)")
                .bind(class_id)
                .bind(&user_id)
                .execute(&mut *tx)
                .await?;
        }
    }

    if let Some(preferences) = &body.preferences {
        preferences.validate()?;
    }
    sqlx::query("UPDATE users SET is_admin = ?, preferences = ? WHERE id = ?")
        .bind(body.is_admin)
        .bind(
            body.preferences
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|_| AppError::internal())?,
        )
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let created = fetch_admin_user(&state.pool, &user_id).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn update_user(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
    Json(body): Json<UpdateAdminUserBody>,
) -> Result<Json<AdminUserView>, AppError> {
    let mut tx = state.pool.begin().await?;
    let admin_ids = lock_admins(&mut tx).await?;
    if body.is_admin == Some(false) && admin_ids.len() == 1 && admin_ids.contains(&user_id) {
        return Err(AppError::conflict("last_admin", "至少保留一位管理员"));
    }
    let old_email: Option<String> = sqlx::query_scalar("SELECT email FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_optional(&mut *tx)
        .await?;

    let existing_role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_optional(&mut *tx)
        .await?;
    let current_role = existing_role
        .ok_or_else(|| AppError::new(StatusCode::NOT_FOUND, "user_not_found", "用户不存在"))?;

    if let Some(raw_email) = body.email.as_deref() {
        let email = normalize_email(raw_email)?;
        sqlx::query("UPDATE users SET email = ? WHERE id = ?")
            .bind(email)
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;
    }

    if let Some(raw_name) = body.display_name.as_deref() {
        let display_name = normalize_display_name(raw_name)?;
        sqlx::query("UPDATE users SET display_name = ? WHERE id = ?")
            .bind(display_name)
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;
    }

    let effective_role = if let Some(raw_role) = body.role.as_deref() {
        let new_role = match raw_role {
            "teacher" => "teacher",
            "student" => "student",
            _ => return Err(AppError::validation("角色必须是 teacher 或 student")),
        };
        if new_role != current_role {
            sqlx::query("UPDATE users SET role = ? WHERE id = ?")
                .bind(new_role)
                .bind(&user_id)
                .execute(&mut *tx)
                .await?;
            if new_role == "student" {
                let owns_class: i64 =
                    sqlx::query_scalar("SELECT COUNT(*) FROM classes WHERE teacher_id = ?")
                        .bind(&user_id)
                        .fetch_one(&mut *tx)
                        .await?;
                if owns_class > 0 {
                    return Err(AppError::validation(
                        "请先转交或删除该教师负责的班级，再切换为学生",
                    ));
                }
            }
            if new_role == "teacher" {
                sqlx::query("DELETE FROM class_members WHERE user_id = ?")
                    .bind(&user_id)
                    .execute(&mut *tx)
                    .await?;
            }
        }
        new_role.to_string()
    } else {
        current_role
    };

    if let Some(raw_pwd) = body.password.as_deref() {
        if !raw_pwd.trim().is_empty() {
            validate_password(raw_pwd)?;
            let hash = hash_password(raw_pwd, state.config.fast_hash)?;
            sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
                .bind(hash)
                .bind(&user_id)
                .execute(&mut *tx)
                .await?;
        }
    }

    if effective_role == "student" {
        if let Some(raw_cid) = body.class_id.as_deref() {
            let trimmed = raw_cid.trim();
            sqlx::query("DELETE FROM class_members WHERE user_id = ?")
                .bind(&user_id)
                .execute(&mut *tx)
                .await?;
            if !trimmed.is_empty() && trimmed != "none" {
                sqlx::query("INSERT INTO class_members (class_id, user_id) VALUES (?, ?)")
                    .bind(trimmed)
                    .bind(&user_id)
                    .execute(&mut *tx)
                    .await?;
            }
        }
    } else if effective_role == "teacher" {
        if let Some(raw_cname) = body.class_name.as_deref() {
            let trimmed = raw_cname.trim();
            if !trimmed.is_empty() {
                let cname = normalize_class_name(trimmed)?;
                let existing_cid: Option<String> =
                    sqlx::query_scalar("SELECT id FROM classes WHERE teacher_id = ?")
                        .bind(&user_id)
                        .fetch_optional(&mut *tx)
                        .await?;
                if let Some(cid) = existing_cid {
                    sqlx::query("UPDATE classes SET name = ? WHERE id = ?")
                        .bind(&cname)
                        .bind(cid)
                        .execute(&mut *tx)
                        .await?;
                } else {
                    insert_class_tx(&mut tx, &user_id, &cname, None).await?;
                }
            }
        }
    }

    if let Some(is_admin) = body.is_admin {
        sqlx::query("UPDATE users SET is_admin = ? WHERE id = ?")
            .bind(is_admin)
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(preferences) = &body.preferences {
        preferences.validate()?;
        sqlx::query("UPDATE users SET preferences = ? WHERE id = ?")
            .bind(serde_json::to_string(preferences).map_err(|_| AppError::internal())?)
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;
    }
    if body.password.as_ref().is_some_and(|p| !p.trim().is_empty())
        || body.email.is_some()
        || body.role.is_some()
        || body.is_admin.is_some()
    {
        sqlx::query("UPDATE users SET auth_version = auth_version + 1 WHERE id = ?")
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL")
            .bind(&user_id).execute(&mut *tx).await?;
    }
    if body.email.is_some() {
        if let Some(old_email) = old_email {
            sqlx::query("DELETE FROM login_attempts WHERE email = ?")
                .bind(old_email)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    Ok(Json(fetch_admin_user(&state.pool, &user_id).await?))
}

pub async fn delete_user(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let mut tx = state.pool.begin().await?;
    let admin_ids = lock_admins(&mut tx).await?;
    if admin_ids.len() == 1 && admin_ids.contains(&user_id) {
        return Err(AppError::conflict("last_admin", "不能删除最后一位管理员"));
    }

    let email: Option<String> = sqlx::query_scalar("SELECT email FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_optional(&mut *tx)
        .await?;
    let Some(email) = email else {
        return Err(AppError::new(
            StatusCode::NOT_FOUND,
            "user_not_found",
            "用户不存在",
        ));
    };

    sqlx::query("DELETE FROM refresh_tokens WHERE user_id = ?")
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM class_members WHERE user_id = ?")
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;

    let teacher_classes: Vec<String> =
        sqlx::query_scalar("SELECT id FROM classes WHERE teacher_id = ?")
            .bind(&user_id)
            .fetch_all(&mut *tx)
            .await?;

    for cid in teacher_classes {
        sqlx::query("DELETE FROM class_members WHERE class_id = ?")
            .bind(&cid)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM whiteboard_operations WHERE class_id = ?")
            .bind(&cid)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM class_whiteboards WHERE class_id = ?")
            .bind(&cid)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM classes WHERE id = ?")
            .bind(&cid)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query("DELETE FROM login_attempts WHERE email = ?")
        .bind(&email)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(sqlx::FromRow)]
struct AdminClassRow {
    id: String,
    name: String,
    invite_code: String,
    teacher_id: String,
    teacher_name: Option<String>,
    teacher_email: String,
    whiteboard_revision: i64,
    whiteboard_ops_count: i64,
    whiteboard_updated_at: Option<NaiveDateTime>,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

#[derive(sqlx::FromRow)]
struct ClassMemberDetailRow {
    class_id: String,
    id: String,
    email: String,
    display_name: Option<String>,
    joined_at: NaiveDateTime,
}

async fn fetch_admin_class(pool: &MySqlPool, class_id: &str) -> Result<AdminClassView, AppError> {
    let row = sqlx::query_as::<_, AdminClassRow>(
        "SELECT
            c.id,
            c.name,
            c.invite_code,
            c.teacher_id,
            u.display_name AS teacher_name,
            u.email AS teacher_email,
            CAST(COALESCE(w.revision, 0) AS SIGNED) AS whiteboard_revision,
            (SELECT COUNT(*) FROM whiteboard_operations wo WHERE wo.class_id = c.id) AS whiteboard_ops_count,
            w.updated_at AS whiteboard_updated_at,
            c.created_at,
            c.updated_at
         FROM classes c
         JOIN users u ON u.id = c.teacher_id
         LEFT JOIN class_whiteboards w ON w.class_id = c.id
         WHERE c.id = ?",
    )
    .bind(class_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::new(StatusCode::NOT_FOUND, "class_not_found", "班级不存在"))?;

    let members = sqlx::query_as::<_, ClassMemberDetailRow>(
        "SELECT m.class_id, u.id, u.email, u.display_name, m.joined_at
         FROM class_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.class_id = ?
         ORDER BY m.joined_at DESC, u.email ASC",
    )
    .bind(class_id)
    .fetch_all(pool)
    .await?;

    let students: Vec<StudentView> = members
        .into_iter()
        .map(|m| StudentView {
            id: m.id,
            email: m.email,
            display_name: m.display_name,
            joined_at: format_dt(m.joined_at),
        })
        .collect();

    Ok(AdminClassView {
        id: row.id,
        name: row.name,
        invite_code: row.invite_code,
        teacher_id: row.teacher_id,
        teacher_name: row.teacher_name,
        teacher_email: row.teacher_email,
        student_count: students.len() as i64,
        whiteboard_revision: row.whiteboard_revision,
        whiteboard_ops_count: row.whiteboard_ops_count,
        whiteboard_updated_at: row.whiteboard_updated_at.map(format_dt),
        created_at: format_dt(row.created_at),
        updated_at: format_dt(row.updated_at),
        students,
    })
}

pub async fn list_classes(
    State(state): State<AppState>,
) -> Result<Json<Vec<AdminClassView>>, AppError> {
    let rows = sqlx::query_as::<_, AdminClassRow>(
        "SELECT
            c.id,
            c.name,
            c.invite_code,
            c.teacher_id,
            u.display_name AS teacher_name,
            u.email AS teacher_email,
            CAST(COALESCE(w.revision, 0) AS SIGNED) AS whiteboard_revision,
            (SELECT COUNT(*) FROM whiteboard_operations wo WHERE wo.class_id = c.id) AS whiteboard_ops_count,
            w.updated_at AS whiteboard_updated_at,
            c.created_at,
            c.updated_at
         FROM classes c
         JOIN users u ON u.id = c.teacher_id
         LEFT JOIN class_whiteboards w ON w.class_id = c.id
         ORDER BY c.created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    let all_members = sqlx::query_as::<_, ClassMemberDetailRow>(
        "SELECT m.class_id, u.id, u.email, u.display_name, m.joined_at
         FROM class_members m
         JOIN users u ON u.id = m.user_id
         ORDER BY m.joined_at DESC, u.email ASC",
    )
    .fetch_all(&state.pool)
    .await?;

    let views = rows
        .into_iter()
        .map(|row| {
            let students: Vec<StudentView> = all_members
                .iter()
                .filter(|m| m.class_id == row.id)
                .map(|m| StudentView {
                    id: m.id.clone(),
                    email: m.email.clone(),
                    display_name: m.display_name.clone(),
                    joined_at: format_dt(m.joined_at),
                })
                .collect();
            let student_count = students.len() as i64;
            AdminClassView {
                id: row.id,
                name: row.name,
                invite_code: row.invite_code,
                teacher_id: row.teacher_id,
                teacher_name: row.teacher_name,
                teacher_email: row.teacher_email,
                student_count,
                whiteboard_revision: row.whiteboard_revision,
                whiteboard_ops_count: row.whiteboard_ops_count,
                whiteboard_updated_at: row.whiteboard_updated_at.map(format_dt),
                created_at: format_dt(row.created_at),
                updated_at: format_dt(row.updated_at),
                students,
            }
        })
        .collect();

    Ok(Json(views))
}

async fn insert_class_tx(
    tx: &mut sqlx::MySqlTransaction<'_>,
    teacher_id: &str,
    name: &str,
    custom_code: Option<String>,
) -> Result<String, AppError> {
    let class_id = Uuid::now_v7().to_string();
    if let Some(code) = custom_code {
        let res = sqlx::query(
            "INSERT INTO classes (id, teacher_id, name, invite_code) VALUES (?, ?, ?, ?)",
        )
        .bind(&class_id)
        .bind(teacher_id)
        .bind(name)
        .bind(&code)
        .execute(&mut **tx)
        .await;
        match res {
            Ok(_) => return Ok(class_id),
            Err(err) if duplicate_kind(&err) == Some(DuplicateKind::Invite) => {
                return Err(AppError::conflict("invite_taken", "该 5 位邀请码已被占用"));
            }
            Err(err) => return Err(err.into()),
        }
    }

    for _ in 0..8 {
        let code = generate_invite_code();
        let res = sqlx::query(
            "INSERT INTO classes (id, teacher_id, name, invite_code) VALUES (?, ?, ?, ?)",
        )
        .bind(&class_id)
        .bind(teacher_id)
        .bind(name)
        .bind(&code)
        .execute(&mut **tx)
        .await;
        match res {
            Ok(_) => return Ok(class_id),
            Err(err) if duplicate_kind(&err) == Some(DuplicateKind::Invite) => continue,
            Err(err) => return Err(err.into()),
        }
    }
    Err(AppError::internal())
}

pub async fn create_class(
    State(state): State<AppState>,
    Json(body): Json<CreateAdminClassBody>,
) -> Result<(StatusCode, Json<AdminClassView>), AppError> {
    let name = normalize_class_name(&body.name)?;
    let custom_code = match body.invite_code.as_deref() {
        Some(raw) if !raw.trim().is_empty() => Some(
            normalize_invite_code(raw)
                .map_err(|_| AppError::validation("邀请码必须为 5 位字母或数字"))?
                .unwrap(),
        ),
        _ => None,
    };

    let mut tx = state.pool.begin().await?;
    let role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
        .bind(body.teacher_id.trim())
        .fetch_optional(&mut *tx)
        .await?;
    match role.as_deref() {
        Some("teacher") => {}
        Some(_) => return Err(AppError::validation("班级负责人必须是教师账号")),
        None => return Err(AppError::validation("指定的教师账号不存在")),
    }

    let class_id = insert_class_tx(&mut tx, body.teacher_id.trim(), &name, custom_code).await?;
    tx.commit().await?;

    let view = fetch_admin_class(&state.pool, &class_id).await?;
    Ok((StatusCode::CREATED, Json(view)))
}

pub async fn update_class_admin(
    State(state): State<AppState>,
    Path(class_id): Path<String>,
    Json(body): Json<UpdateAdminClassBody>,
) -> Result<Json<AdminClassView>, AppError> {
    let mut tx = state.pool.begin().await?;

    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM classes WHERE id = ?")
        .bind(&class_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(AppError::new(
            StatusCode::NOT_FOUND,
            "class_not_found",
            "班级不存在",
        ));
    }

    if let Some(raw_name) = body.name.as_deref() {
        let name = normalize_class_name(raw_name)?;
        sqlx::query("UPDATE classes SET name = ? WHERE id = ?")
            .bind(name)
            .bind(&class_id)
            .execute(&mut *tx)
            .await?;
    }

    if let Some(raw_code) = body.invite_code.as_deref() {
        if !raw_code.trim().is_empty() {
            let code = normalize_invite_code(raw_code)
                .map_err(|_| AppError::validation("邀请码必须为 5 位字母或数字"))?
                .unwrap();
            let res = sqlx::query("UPDATE classes SET invite_code = ? WHERE id = ?")
                .bind(code)
                .bind(&class_id)
                .execute(&mut *tx)
                .await;
            if let Err(err) = res {
                if duplicate_kind(&err) == Some(DuplicateKind::Invite) {
                    return Err(AppError::conflict(
                        "invite_taken",
                        "该 5 位邀请码已被其他班级使用",
                    ));
                }
                return Err(err.into());
            }
        }
    }

    if let Some(raw_tid) = body.teacher_id.as_deref() {
        if !raw_tid.trim().is_empty() {
            let role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
                .bind(raw_tid.trim())
                .fetch_optional(&mut *tx)
                .await?;
            if role.as_deref() != Some("teacher") {
                return Err(AppError::validation("班级负责人必须是教师账号"));
            }
            sqlx::query("UPDATE classes SET teacher_id = ? WHERE id = ?")
                .bind(raw_tid.trim())
                .bind(&class_id)
                .execute(&mut *tx)
                .await?;
        }
    }

    tx.commit().await?;
    Ok(Json(fetch_admin_class(&state.pool, &class_id).await?))
}

pub async fn regenerate_class_code(
    State(state): State<AppState>,
    Path(class_id): Path<String>,
) -> Result<Json<AdminClassView>, AppError> {
    for _ in 0..8 {
        let code = generate_invite_code();
        let res = sqlx::query("UPDATE classes SET invite_code = ? WHERE id = ?")
            .bind(&code)
            .bind(&class_id)
            .execute(&state.pool)
            .await;
        match res {
            Ok(done) => {
                if done.rows_affected() == 0 {
                    return Err(AppError::new(
                        StatusCode::NOT_FOUND,
                        "class_not_found",
                        "班级不存在",
                    ));
                }
                return Ok(Json(fetch_admin_class(&state.pool, &class_id).await?));
            }
            Err(err) if duplicate_kind(&err) == Some(DuplicateKind::Invite) => continue,
            Err(err) => return Err(err.into()),
        }
    }
    Err(AppError::internal())
}

pub async fn add_class_member(
    State(state): State<AppState>,
    Path(class_id): Path<String>,
    Json(body): Json<AddMemberBody>,
) -> Result<Json<AdminClassView>, AppError> {
    let mut tx = state.pool.begin().await?;

    let student_id: String = if let Some(uid) =
        body.user_id.as_deref().filter(|s| !s.trim().is_empty())
    {
        uid.trim().to_string()
    } else if let Some(raw_email) = body.email.as_deref().filter(|s| !s.trim().is_empty()) {
        let email = normalize_email(raw_email)?;
        sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE email = ? AND role = 'student'")
            .bind(&email)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::validation("未找到该邮箱对应的学生账号"))?
    } else {
        return Err(AppError::validation("请提供学生 ID 或邮箱"));
    };

    let role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
        .bind(&student_id)
        .fetch_optional(&mut *tx)
        .await?;
    if role.as_deref() != Some("student") {
        return Err(AppError::validation("班级成员必须是学生账号"));
    }
    sqlx::query(
        "INSERT INTO class_members (class_id, user_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE class_id = VALUES(class_id), joined_at = CURRENT_TIMESTAMP(3)",
    )
    .bind(&class_id)
    .bind(&student_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(fetch_admin_class(&state.pool, &class_id).await?))
}

pub async fn remove_class_member(
    State(state): State<AppState>,
    Path((class_id, user_id)): Path<(String, String)>,
) -> Result<Json<AdminClassView>, AppError> {
    sqlx::query("DELETE FROM class_members WHERE class_id = ? AND user_id = ?")
        .bind(&class_id)
        .bind(&user_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(fetch_admin_class(&state.pool, &class_id).await?))
}

pub async fn delete_class(
    State(state): State<AppState>,
    Path(class_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("DELETE FROM class_members WHERE class_id = ?")
        .bind(&class_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM whiteboard_operations WHERE class_id = ?")
        .bind(&class_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM class_whiteboards WHERE class_id = ?")
        .bind(&class_id)
        .execute(&mut *tx)
        .await?;
    let res = sqlx::query("DELETE FROM classes WHERE id = ?")
        .bind(&class_id)
        .execute(&mut *tx)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::new(
            StatusCode::NOT_FOUND,
            "class_not_found",
            "班级不存在",
        ));
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_security_audit(
    State(state): State<AppState>,
) -> Result<Json<SecurityAuditResponse>, AppError> {
    let now = Utc::now().naive_utc();

    #[derive(sqlx::FromRow)]
    struct AttemptJoinedRow {
        email: String,
        user_id: Option<String>,
        display_name: Option<String>,
        role: Option<String>,
        failed_count: i32,
        locked_until: Option<NaiveDateTime>,
        updated_at: NaiveDateTime,
    }

    let attempt_rows = sqlx::query_as::<_, AttemptJoinedRow>(
        "SELECT
            la.email,
            u.id AS user_id,
            u.display_name,
            u.role,
            la.failed_count,
            la.locked_until,
            la.updated_at
         FROM login_attempts la
         LEFT JOIN users u ON u.email = la.email
         ORDER BY la.updated_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    let login_attempts = attempt_rows
        .into_iter()
        .map(|row| {
            let is_locked = row.locked_until.map(|u| u > now).unwrap_or(false);
            LoginAttemptView {
                email: row.email,
                user_id: row.user_id,
                display_name: row.display_name,
                role: row.role,
                failed_count: row.failed_count,
                locked_until: row.locked_until.map(format_dt),
                is_locked,
                updated_at: format_dt(row.updated_at),
            }
        })
        .collect();

    #[derive(sqlx::FromRow)]
    struct SessionJoinedRow {
        id: String,
        user_id: String,
        email: String,
        display_name: Option<String>,
        role: String,
        token_hash: String,
        created_at: NaiveDateTime,
        expires_at: NaiveDateTime,
        revoked_at: Option<NaiveDateTime>,
    }

    let session_rows = sqlx::query_as::<_, SessionJoinedRow>(
        "SELECT
            rt.id,
            rt.user_id,
            u.email,
            u.display_name,
            u.role,
            rt.token_hash,
            rt.created_at,
            rt.expires_at,
            rt.revoked_at
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         ORDER BY rt.created_at DESC
         LIMIT 100",
    )
    .fetch_all(&state.pool)
    .await?;

    let sessions = session_rows
        .into_iter()
        .map(|row| {
            let status = if row.revoked_at.is_some() {
                "revoked"
            } else if row.expires_at <= now {
                "expired"
            } else {
                "active"
            };
            let fingerprint = row.token_hash.chars().take(12).collect::<String>();
            SessionAuditView {
                id: row.id,
                user_id: row.user_id,
                email: row.email,
                display_name: row.display_name,
                role: row.role,
                token_fingerprint: fingerprint,
                status: status.to_string(),
                created_at: format_dt(row.created_at),
                expires_at: format_dt(row.expires_at),
                revoked_at: row.revoked_at.map(format_dt),
            }
        })
        .collect();

    Ok(Json(SecurityAuditResponse {
        login_attempts,
        sessions,
    }))
}

pub async fn unlock_account(
    State(state): State<AppState>,
    Json(body): Json<EmailActionBody>,
) -> Result<StatusCode, AppError> {
    let email = body.email.trim().to_lowercase();
    sqlx::query("DELETE FROM login_attempts WHERE email = ?")
        .bind(email)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn unlock_all_accounts(State(state): State<AppState>) -> Result<StatusCode, AppError> {
    sqlx::query("DELETE FROM login_attempts")
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn lock_account_manual(
    State(state): State<AppState>,
    Json(body): Json<EmailActionBody>,
) -> Result<StatusCode, AppError> {
    let email = normalize_email(&body.email)?;
    let mins = body.minutes.unwrap_or(30).clamp(1, 10080);
    let locked_until = Utc::now().naive_utc() + Duration::minutes(mins);
    sqlx::query(
        "INSERT INTO login_attempts (email, failed_count, locked_until) VALUES (?, 8, ?)
         ON DUPLICATE KEY UPDATE failed_count = GREATEST(failed_count, 8), locked_until = VALUES(locked_until)",
    )
    .bind(email)
    .bind(locked_until)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_session(
    State(state): State<AppState>,
    Path(token_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let session_id: Option<String> =
        sqlx::query_scalar("SELECT COALESCE(session_id, id) FROM refresh_tokens WHERE id = ?")
            .bind(&token_id)
            .fetch_optional(&state.pool)
            .await?;
    sqlx::query("UPDATE refresh_tokens SET revoked_at = ? WHERE (session_id = ? OR id = ?) AND revoked_at IS NULL")
        .bind(Utc::now().naive_utc())
        .bind(session_id)
        .bind(token_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_user_sessions(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<StatusCode, AppError> {
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    )
    .bind(Utc::now().naive_utc())
    .bind(user_id)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn lock_admins(tx: &mut sqlx::Transaction<'_, sqlx::MySql>) -> Result<Vec<String>, AppError> {
    Ok(
        sqlx::query_scalar("SELECT id FROM users WHERE is_admin = TRUE ORDER BY id FOR UPDATE")
            .fetch_all(&mut **tx)
            .await?,
    )
}
