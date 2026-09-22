use axum::extract::State;
use axum::http::{header, HeaderName, HeaderValue, Method};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use crate::config::{default_cors_origins, Config};
use crate::error::AppError;
use crate::state::AppState;

mod auth;
mod classes;
mod me;

pub fn router(state: AppState) -> Router {
    let cors = cors_layer(&state.config);
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/refresh", post(auth::refresh))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/me", get(me::me).patch(me::update_me))
        .route("/api/v1/classes/current", patch(classes::update_class))
        .route("/api/v1/classes/join", post(classes::join_class))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("cross-origin-resource-policy"),
            HeaderValue::from_static("cross-origin"),
        ))
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    sqlx::query("SELECT 1").execute(&state.pool).await?;
    Ok(Json(json!({ "status": "ok" })))
}

fn cors_layer(config: &Config) -> CorsLayer {
    let mut origins: Vec<HeaderValue> = default_cors_origins()
        .into_iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect();
    for origin in &config.cors_origins {
        if let Ok(value) = HeaderValue::from_str(origin) {
            if !origins.iter().any(|existing| existing == &value) {
                origins.push(value);
            }
        } else {
            tracing::warn!(origin, "ignored invalid CORS origin");
        }
    }
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT])
}
