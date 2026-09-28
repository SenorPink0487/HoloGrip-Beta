use axum::extract::State;
use axum::Json;
use serde::Deserialize;

use crate::auth::invite::normalize_invite_code;
use crate::auth::token::CurrentUser;
use crate::dto::MeResponse;
use crate::error::AppError;
use crate::profile::load_me;
use crate::routes::auth::normalize_class_name;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub(super) struct UpdateClassBody {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct JoinBody {
    invite_code: String,
}

pub async fn update_class(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(body): Json<UpdateClassBody>,
) -> Result<Json<MeResponse>, AppError> {
    if user.role != "teacher" {
        return Err(AppError::forbidden("只有老师可以修改班级"));
    }
    let name = normalize_class_name(&body.name)?;
    let updated = sqlx::query("UPDATE classes SET name = ? WHERE teacher_id = ?")
        .bind(&name)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;
    if updated.rows_affected() != 1 {
        return Err(AppError::internal());
    }
    Ok(Json(load_me(&state.pool, &user.id).await?))
}

pub async fn join_class(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(body): Json<JoinBody>,
) -> Result<Json<MeResponse>, AppError> {
    if user.role != "student" {
        return Err(AppError::forbidden("只有学生可以加入班级"));
    }
    let code = normalize_invite_code(&body.invite_code)
        .map_err(|_| AppError::validation("邀请码格式不正确"))?
        .ok_or_else(|| AppError::validation("请填写邀请码"))?;

    let existing =
        sqlx::query_scalar::<_, String>("SELECT class_id FROM class_members WHERE user_id = ?")
            .bind(&user.id)
            .fetch_optional(&state.pool)
            .await?;
    if existing.is_some() {
        return Err(AppError::conflict("already_in_class", "已加入班级"));
    }

    let class_id = sqlx::query_scalar::<_, String>("SELECT id FROM classes WHERE invite_code = ?")
        .bind(&code)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(AppError::invalid_invite)?;

    sqlx::query("INSERT INTO class_members (class_id, user_id) VALUES (?, ?)")
        .bind(class_id)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    Ok(Json(load_me(&state.pool, &user.id).await?))
}
