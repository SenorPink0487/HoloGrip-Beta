use crate::auth::token::CurrentUser;
use axum::extract::Request;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{header, HeaderName, HeaderValue, Method};
use axum::middleware::{self, Next};
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use crate::config::{default_cors_origins, Config};
use crate::error::AppError;
use crate::state::AppState;

mod admin;
mod auth;
mod chemistry;
mod classes;
mod math_recognition;
mod me;
mod password;
mod whiteboard;

pub fn router(state: AppState) -> Router {
    let cors = cors_layer(&state.config);
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/whiteboard/ticket", post(whiteboard::ticket))
        .route("/api/chem/analyze", post(chemistry::analyze))
        .route(
            "/api/math/recognize",
            post(math_recognition::recognize).layer(DefaultBodyLimit::max(8_000_000)),
        )
        .route("/api/v1/whiteboard/ws", get(whiteboard::upgrade))
        .layer(axum::Extension(whiteboard::Hub::default()))
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/refresh", post(auth::refresh))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/me", get(me::me).patch(me::update_me))
        .route("/api/v1/me/preferences", patch(me::update_preferences))
        .route("/api/v1/me/password/code", post(password::send_code))
        .route("/api/v1/me/password", post(password::change_password))
        .route("/api/v1/classes/current", patch(classes::update_class))
        .route("/api/v1/classes/join", post(classes::join_class))
        .merge(admin_routes(state.clone()))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("cross-origin-resource-policy"),
            HeaderValue::from_static("cross-origin"),
        ))
        .with_state(state)
}

fn admin_routes(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/v1/admin/overview", get(admin::get_overview))
        .route(
            "/api/v1/admin/users",
            get(admin::list_users).post(admin::create_user),
        )
        .route(
            "/api/v1/admin/users/{id}",
            patch(admin::update_user).delete(admin::delete_user),
        )
        .route(
            "/api/v1/admin/classes",
            get(admin::list_classes).post(admin::create_class),
        )
        .route(
            "/api/v1/admin/classes/{id}",
            patch(admin::update_class_admin).delete(admin::delete_class),
        )
        .route(
            "/api/v1/admin/classes/{id}/regenerate-code",
            post(admin::regenerate_class_code),
        )
        .route(
            "/api/v1/admin/classes/{id}/members",
            post(admin::add_class_member),
        )
        .route(
            "/api/v1/admin/classes/{id}/members/{user_id}",
            delete(admin::remove_class_member),
        )
        .route("/api/v1/admin/security", get(admin::get_security_audit))
        .route("/api/v1/admin/security/unlock", post(admin::unlock_account))
        .route(
            "/api/v1/admin/security/unlock-all",
            post(admin::unlock_all_accounts),
        )
        .route(
            "/api/v1/admin/security/lock",
            post(admin::lock_account_manual),
        )
        .route(
            "/api/v1/admin/security/sessions/{id}/revoke",
            post(admin::revoke_session),
        )
        .route(
            "/api/v1/admin/security/users/{id}/revoke-all",
            post(admin::revoke_user_sessions),
        )
        .route_layer(middleware::from_fn_with_state(state, require_admin))
}

async fn require_admin(
    user: CurrentUser,
    request: Request,
    next: Next,
) -> Result<axum::response::Response, AppError> {
    if !user.is_admin {
        return Err(AppError::new(
            axum::http::StatusCode::FORBIDDEN,
            "admin_required",
            "仅管理员可以访问管理页面",
        ));
    }
    Ok(next.run(request).await)
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
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::PUT,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT])
}
