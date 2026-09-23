use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
}

impl AppError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNPROCESSABLE_ENTITY, "validation", message)
    }

    pub fn invalid_invite() -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_invite_code", "邀请码无效")
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized", "登录已失效，请重新登录")
    }

    pub fn invalid_credentials() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "invalid_credentials", "邮箱或密码错误")
    }

    pub fn locked() -> Self {
        Self::new(
            StatusCode::TOO_MANY_REQUESTS,
            "account_locked",
            "登录尝试过多，请 15 分钟后再试",
        )
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden", message)
    }

    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, code, message)
    }

    pub fn internal() -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "internal", "服务暂时不可用")
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DuplicateKind {
    Email,
    Invite,
    Membership,
    TeacherClass,
    Other,
}

pub fn duplicate_kind(err: &sqlx::Error) -> Option<DuplicateKind> {
    let sqlx::Error::Database(db) = err else {
        return None;
    };
    let message = db.message().to_lowercase();
    // MySQL reports duplicates as SQLSTATE 23000 / error 1062. The driver
    // exposes the SQLSTATE through DatabaseError::code, not 1062.
    if !message.contains("duplicate entry") {
        return None;
    }
    if message.contains("uq_users_email") {
        Some(DuplicateKind::Email)
    } else if message.contains("invite") {
        Some(DuplicateKind::Invite)
    } else if message.contains("class_members") {
        Some(DuplicateKind::Membership)
    } else if message.contains("uq_classes_teacher") {
        Some(DuplicateKind::TeacherClass)
    } else {
        Some(DuplicateKind::Other)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match duplicate_kind(&err) {
            Some(DuplicateKind::Email) => AppError::conflict("email_taken", "该邮箱已注册"),
            Some(DuplicateKind::Membership) => AppError::conflict("already_in_class", "已加入班级"),
            Some(DuplicateKind::TeacherClass) => AppError::conflict("class_exists", "已经创建过班级"),
            Some(DuplicateKind::Invite) | Some(DuplicateKind::Other) => {
                tracing::error!(error = %err, "unhandled database constraint");
                AppError::internal()
            }
            None => {
                tracing::error!(error = %err, "database");
                AppError::internal()
            }
        }
    }
}

impl From<jsonwebtoken::errors::Error> for AppError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        tracing::debug!(error = %err, "rejected access token");
        AppError::unauthorized()
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = Json(json!({
            "error": {
                "code": self.code,
                "message": self.message,
            }
        }));
        (self.status, body).into_response()
    }
}
