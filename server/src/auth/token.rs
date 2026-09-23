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
}

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: String,
    pub role: String,
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
        Ok(CurrentUser {
            id: claims.sub,
            role: claims.role,
        })
    }
}

pub fn encode_access(user_id: &str, role: &str, config: &Config) -> Result<String, AppError> {
    let now = Utc::now().timestamp();
    let claims = AccessClaims {
        sub: user_id.to_string(),
        role: role.to_string(),
        iat: now,
        exp: now + config.access_ttl_secs,
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
    let token = bytes.iter().map(|byte| format!("{byte:02x}")).collect::<String>();
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
    let access = encode_access(user_id, role, config)?;
    let (refresh, hash) = new_refresh_token();
    sqlx::query(
        "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(user_id)
    .bind(hash)
    .bind(refresh_expiry(config))
    .execute(pool)
    .await?;
    Ok((access, refresh))
}
