use axum::extract::State;
use axum::Json;
use serde::Deserialize;

use crate::auth::token::CurrentUser;
use crate::dto::MeResponse;
use crate::error::AppError;
use crate::profile::load_me;
use crate::routes::auth::normalize_display_name;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateMeBody {
    display_name: String,
}

pub async fn me(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<MeResponse>, AppError> {
    Ok(Json(load_me(&state.pool, &user.id).await?))
}

pub async fn update_me(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(body): Json<UpdateMeBody>,
) -> Result<Json<MeResponse>, AppError> {
    let display_name = normalize_display_name(&body.display_name)?;
    sqlx::query("UPDATE users SET display_name = ? WHERE id = ?")
        .bind(display_name)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;
    Ok(Json(load_me(&state.pool, &user.id).await?))
}
