use std::{env, path::Path};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if env::args().nth(1).as_deref() != Some("--confirm-reset") {
        anyhow::bail!("Usage: reset-data --confirm-reset. Deletes all application data and creates one administrator. Set RESET_ADMIN_EMAIL, RESET_ADMIN_NAME, RESET_ADMIN_PASSWORD.");
    }
    dotenvy::from_path(Path::new(env!("CARGO_MANIFEST_DIR")).join(".env")).ok();
    let email = env::var("RESET_ADMIN_EMAIL")?.trim().to_lowercase();
    let name = env::var("RESET_ADMIN_NAME")?.trim().to_string();
    let password = env::var("RESET_ADMIN_PASSWORD")?;
    if email.len() > 255 || !email.contains('@') || name.is_empty() || name.chars().count() > 64 {
        anyhow::bail!("Invalid administrator email or name");
    }
    let config = server::Config::from_env().map_err(anyhow::Error::msg)?;
    let pool = server::connect(&config.database_url).await?;
    server::migrate(&pool).await?;
    server::reset_data(&pool, &email, &name, &password)
        .await
        .map_err(anyhow::Error::msg)?;
    println!("Reset complete: one administrator ({email}); all other application data cleared.");
    Ok(())
}
