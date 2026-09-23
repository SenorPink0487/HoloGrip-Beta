use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;

use server::{connect, migrate, router, AppState, Config};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let env_path = Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
    dotenvy::from_path(env_path).ok();
    init_tracing();

    let config = Config::from_env().map_err(anyhow::Error::msg)?;
    let bind: SocketAddr = config.bind.parse()?;
    let pool = connect(&config.database_url).await?;
    migrate(&pool).await?;

    let app = router(AppState {
        pool,
        config: Arc::new(config),
    });
    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(%bind, "virtual lab backend server listening");
    axum::serve(listener, app).await?;
    Ok(())
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    if std::env::var("LOG_FORMAT").ok().as_deref() == Some("json") {
        tracing_subscriber::fmt().json().with_env_filter(filter).init();
    } else {
        tracing_subscriber::fmt().with_env_filter(filter).init();
    }
}
