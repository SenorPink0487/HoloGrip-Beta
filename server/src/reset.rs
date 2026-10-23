use sqlx::MySqlPool;
use uuid::Uuid;

use crate::auth::password::hash_password;
use crate::error::AppError;

/// One explicit, transactional reset. Never called by server startup or a public endpoint.
pub async fn reset_data(
    pool: &MySqlPool,
    email: &str,
    name: &str,
    password: &str,
) -> Result<(), String> {
    let hash = hash_password(password, false).map_err(|e: AppError| e.message)?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for table in [
        "password_email_verifications",
        "whiteboard_operations",
        "class_whiteboards",
        "class_members",
        "refresh_tokens",
        "login_attempts",
        "classes",
        "users",
    ] {
        sqlx::query(&format!("DELETE FROM {table}"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    sqlx::query("INSERT INTO users (id, email, display_name, password_hash, role, is_admin) VALUES (?, ?, ?, ?, 'teacher', TRUE)")
        .bind(Uuid::now_v7().to_string()).bind(email).bind(name).bind(hash)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
