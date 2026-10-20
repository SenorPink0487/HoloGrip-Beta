use axum::extract::{FromRef, FromRequestParts};
use axum::http::request::Parts;
use chrono::{Duration, NaiveDateTime, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::MySqlPool;
use uuid::Uuid;

use crate::config::Config;
use crate::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
struct AccessClaims {
    sub: String,
    role: String,
    iat: i64,
    exp: i64,
    #[serde(default)]
    version: i64,
    #[serde(default)]
    session: String,
}

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: String,
    pub role: String,
    pub is_admin: bool,
}

impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
    crate::state::AppState: FromRef<S>,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = crate::state::AppState::from_ref(state);
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(AppError::unauthorized)?;
        let token = header
            .strip_prefix("Bearer ")
            .ok_or_else(AppError::unauthorized)?;
        let claims = decode_access(token, &state.config.jwt_secret)?;
        let user: Option<(String, bool, i64, Option<NaiveDateTime>, bool)> = sqlx::query_as(
            "SELECT u.role, u.is_admin, u.auth_version, la.locked_until, EXISTS(SELECT 1 FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.session_id = ? AND rt.revoked_at IS NULL AND rt.expires_at > UTC_TIMESTAMP(3)) FROM users u LEFT JOIN login_attempts la ON la.email = u.email WHERE u.id = ?",
        )
        .bind(&claims.session)
        .bind(&claims.sub)
        .fetch_optional(&state.pool)
        .await?;
        let (role, is_admin, version, locked_until, active_session) =
            user.ok_or_else(AppError::unauthorized)?;
        if version != claims.version || !active_session {
            return Err(AppError::unauthorized());
        }
        if locked_until.is_some_and(|until| until > Utc::now().naive_utc()) {
            return Err(AppError::locked());
        }
        Ok(CurrentUser {
            id: claims.sub,
            role,
            is_admin,
        })
    }
}

pub fn encode_access(
    user_id: &str,
    role: &str,
    version: i64,
    session: &str,
    config: &Config,
) -> Result<String, AppError> {
    let now = Utc::now().timestamp();
    let claims = AccessClaims {
        sub: user_id.to_string(),
        role: role.to_string(),
        iat: now,
        exp: now + config.access_ttl_secs,
        version,
        session: session.to_string(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(AppError::from)
}

fn decode_access(token: &str, secret: &str) -> Result<AccessClaims, AppError> {
    let mut validation = Validation::default();
    validation.validate_exp = true;
    let data = decode::<AccessClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    Ok(data.claims)
}

pub fn new_refresh_token() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    (token.clone(), sha256_hex(&token))
}

pub fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn refresh_expiry(config: &Config) -> NaiveDateTime {
    Utc::now().naive_utc() + Duration::seconds(config.refresh_ttl_secs)
}

pub async fn issue_tokens(
    pool: &MySqlPool,
    config: &Config,
    user_id: &str,
    role: &str,
) -> Result<(String, String), AppError> {
    let version: i64 = sqlx::query_scalar("SELECT auth_version FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    let session_id = Uuid::now_v7().to_string();
    let access = encode_access(user_id, role, version, &session_id, config)?;
    let (refresh, hash) = new_refresh_token();
    sqlx::query(
        "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, session_id) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(user_id)
    .bind(hash)
    .bind(refresh_expiry(config))
    .bind(&session_id)
    .execute(pool)
    .await?;
    Ok((access, refresh))
}
