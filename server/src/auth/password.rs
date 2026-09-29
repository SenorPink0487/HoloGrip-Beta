use std::sync::OnceLock;

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};

use crate::error::AppError;

pub fn validate_password(password: &str) -> Result<(), AppError> {
    if password.chars().count() < 8 || password.len() > 72 {
        return Err(AppError::validation("密码至少 8 位，且不能超过 72 字节"));
    }
    Ok(())
}

pub fn hash_password(password: &str, fast: bool) -> Result<String, AppError> {
    validate_password(password)?;
    hash_unchecked(password, fast)
}

pub fn password_matches(password: &str, encoded: &str, fast: bool) -> bool {
    let Ok(parsed) = PasswordHash::new(encoded) else {
        return false;
    };
    hasher(fast)
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

/// 执行与真实用户耗时相同的哈希验证，避免邮箱不存在比密码错误返回得更快（防止时序攻击）。
pub fn obscure_missing_user(password: &str, fast: bool) {
    let slot = if fast { &DUMMY_FAST } else { &DUMMY_SLOW };
    let encoded = slot
        .get_or_init(|| hash_unchecked("not-a-real-password", fast).expect("dummy password hash"));
    let _ = password_matches(password, encoded, fast);
}

fn hash_unchecked(password: &str, fast: bool) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    hasher(fast)
        .hash_password(password.as_bytes(), &salt)
        .map_err(|err| {
            tracing::error!(error = %err, "password hash failed");
            AppError::internal()
        })
        .map(|hash| hash.to_string())
}

fn hasher(fast: bool) -> Argon2<'static> {
    if !fast {
        return Argon2::default();
    }
    let params = Params::new(8192, 1, 1, None).expect("argon2 test parameters");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

static DUMMY_FAST: OnceLock<String> = OnceLock::new();
static DUMMY_SLOW: OnceLock<String> = OnceLock::new();
