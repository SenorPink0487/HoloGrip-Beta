use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, NaiveDateTime, Utc};
use hmac::{Hmac, Mac};
use lettre::{
    transport::smtp::authentication::Credentials, AsyncSmtpTransport, AsyncTransport, Message,
    Tokio1Executor,
};
use rand::{rngs::OsRng, Rng};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::Sha256;
use uuid::Uuid;

use crate::{
    auth::{
        password::{hash_password, validate_password},
        token::CurrentUser,
    },
    error::AppError,
    state::AppState,
};

const RESEND_SECONDS: i64 = 60;
const EXPIRY_SECONDS: i64 = 600;
const MAX_ATTEMPTS: i32 = 5;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChangePasswordBody {
    code: String,
    new_password: String,
}

#[derive(sqlx::FromRow)]
struct Verification {
    email: String,
    auth_version: i64,
    code_hash: Vec<u8>,
    sent_at: NaiveDateTime,
    expires_at: NaiveDateTime,
    failed_attempts: i32,
    delivered: bool,
}

fn code_mac(secret: &str, user_id: &str, email: &str, version: i64, code: &str) -> Hmac<Sha256> {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key size");
    mac.update(format!("password-change\0{user_id}\0{email}\0{version}\0{code}").as_bytes());
    mac
}

fn invalid_code() -> AppError {
    AppError::new(
        StatusCode::UNPROCESSABLE_ENTITY,
        "invalid_verification_code",
        "验证码错误或已失效，请重新获取",
    )
}

fn mail_error() -> AppError {
    AppError::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "email_unavailable",
        "验证邮件发送失败，请稍后重试或联系管理员",
    )
}

pub async fn send_code(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let smtp = state.config.smtp.as_ref().ok_or_else(|| {
        AppError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "email_not_configured",
            "邮箱验证服务尚未配置，请联系管理员",
        )
    })?;
    let mut tx = state.pool.begin().await?;
    // Both endpoints lock the user first to serialize requests, verification, and credential changes.
    let (email, version): (String, i64) =
        sqlx::query_as("SELECT email, auth_version FROM users WHERE id = ? FOR UPDATE")
            .bind(&user.id)
            .fetch_one(&mut *tx)
            .await?;
    let previous = sqlx::query_as::<_, Verification>("SELECT email, auth_version, code_hash, sent_at, expires_at, failed_attempts, delivered FROM password_email_verifications WHERE user_id = ? FOR UPDATE")
        .bind(&user.id).fetch_optional(&mut *tx).await?;
    let now = Utc::now().naive_utc();
    if previous.is_some_and(|row| row.sent_at + Duration::seconds(RESEND_SECONDS) > now) {
        return Err(AppError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "verification_rate_limited",
            "验证码发送过于频繁，请 60 秒后再试",
        ));
    }
    let code = format!("{:06}", OsRng.gen_range(0..1_000_000u32));
    let hash = code_mac(&state.config.jwt_secret, &user.id, &email, version, &code)
        .finalize()
        .into_bytes()
        .to_vec();
    let request_id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO password_email_verifications (user_id, request_id, email, auth_version, code_hash, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE request_id = VALUES(request_id), email = VALUES(email), auth_version = VALUES(auth_version), code_hash = VALUES(code_hash), sent_at = VALUES(sent_at), expires_at = VALUES(expires_at), failed_attempts = 0, delivered = FALSE")
        .bind(&user.id).bind(&request_id).bind(&email).bind(version).bind(hash).bind(now).bind(now + Duration::seconds(EXPIRY_SECONDS))
        .execute(&mut *tx).await?;
    tx.commit().await?;

    let message = Message::builder()
        .from(smtp.from.parse().map_err(|_| mail_error())?)
        .to(email.parse().map_err(|_| mail_error())?)
        .subject("HoloGrip 修改密码验证码")
        .body(format!("你正在修改 HoloGrip 账户密码。\n\n验证码：{code}\n\n验证码 10 分钟内有效，最多可尝试 5 次。请勿向他人提供验证码。\n如果这不是你的操作，请忽略本邮件。"))
        .map_err(|_| mail_error())?;
    // Always require TLS and certificate validation, including on STARTTLS relays.
    let builder = if smtp.starttls {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp.host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp.host)
    }
    .map_err(|_| mail_error())?;
    let transport = builder
        .port(smtp.port)
        .credentials(Credentials::new(
            smtp.username.clone(),
            smtp.password.clone(),
        ))
        .timeout(Some(std::time::Duration::from_secs(15)))
        .build();
    // Do not log the code, message, or SMTP credentials on failures.
    tokio::time::timeout(std::time::Duration::from_secs(20), transport.send(message))
        .await
        .map_err(|_| mail_error())?
        .map_err(|_| mail_error())?;
    sqlx::query("UPDATE password_email_verifications SET delivered = TRUE WHERE user_id = ? AND request_id = ?")
        .bind(&user.id).bind(request_id).execute(&state.pool).await?;
    Ok(Json(
        json!({ "retryAfterSeconds": RESEND_SECONDS, "expiresInSeconds": EXPIRY_SECONDS }),
    ))
}

pub async fn change_password(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(body): Json<ChangePasswordBody>,
) -> Result<StatusCode, AppError> {
    validate_password(&body.new_password)?;
    let mut tx = state.pool.begin().await?;
    let (email, version): (String, i64) =
        sqlx::query_as("SELECT email, auth_version FROM users WHERE id = ? FOR UPDATE")
            .bind(&user.id)
            .fetch_one(&mut *tx)
            .await?;
    let row = sqlx::query_as::<_, Verification>("SELECT email, auth_version, code_hash, sent_at, expires_at, failed_attempts, delivered FROM password_email_verifications WHERE user_id = ? FOR UPDATE")
        .bind(&user.id).fetch_optional(&mut *tx).await?.ok_or_else(invalid_code)?;
    if !row.delivered
        || row.email != email
        || row.auth_version != version
        || row.expires_at <= Utc::now().naive_utc()
        || row.failed_attempts >= MAX_ATTEMPTS
    {
        return Err(invalid_code());
    }
    if body.code.len() != 6
        || !body.code.bytes().all(|b| b.is_ascii_digit())
        || code_mac(
            &state.config.jwt_secret,
            &user.id,
            &email,
            version,
            &body.code,
        )
        .verify_slice(&row.code_hash)
        .is_err()
    {
        sqlx::query("UPDATE password_email_verifications SET failed_attempts = failed_attempts + 1 WHERE user_id = ?")
            .bind(&user.id).execute(&mut *tx).await?;
        tx.commit().await?;
        return Err(invalid_code());
    }
    let hash = hash_password(&body.new_password, state.config.fast_hash)?;
    sqlx::query("UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?")
        .bind(hash)
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    )
    .bind(Utc::now().naive_utc())
    .bind(&user.id)
    .execute(&mut *tx)
    .await?;
    // Keep sent_at to prevent bypassing the resend cooldown, but consume the proof.
    sqlx::query("UPDATE password_email_verifications SET delivered = FALSE WHERE user_id = ?")
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
