use std::sync::Arc;

use server::{connect, migrate, router, AppState, Config};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::MySqlPool;
use tower::ServiceExt;

const ADMIN_URL: &str = "mysql://root:virtuallab@127.0.0.1:3306/mysql";
const TEST_URL: &str = "mysql://root:virtuallab@127.0.0.1:3306/virtuallab_test";

static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn fresh_pool() -> MySqlPool {
    let admin = connect(ADMIN_URL).await.expect(
        "MySQL is not reachable. Start it with: docker compose -f server/docker-compose.yml up -d",
    );
    sqlx::query(
        "CREATE DATABASE IF NOT EXISTS virtuallab_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    )
    .execute(&admin)
    .await
    .expect("create virtuallab_test");
    let pool = connect(TEST_URL).await.expect("connect virtuallab_test");
    migrate(&pool).await.expect("migrate virtuallab_test");
    pool
}

async fn truncate(pool: &MySqlPool) {
    let mut conn = pool.acquire().await.unwrap();
    for statement in [
        "DELETE FROM refresh_tokens",
        "DELETE FROM class_members",
        "DELETE FROM classes",
        "DELETE FROM login_attempts",
        "DELETE FROM users",
    ] {
        sqlx::query(statement)
            .execute(&mut *conn)
            .await
            .unwrap();
    }
}

async fn with_app<F, Fut>(test: F)
where
    F: FnOnce(axum::Router) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let _guard = LOCK.lock().await;
    let pool = fresh_pool().await;
    truncate(&pool).await;
    let app = router(AppState {
        pool: pool.clone(),
        config: Arc::new(Config::for_test()),
    });
    test(app).await;
}

async fn call(
    app: &axum::Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let request = if let Some(body) = body {
        builder
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    };
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    if bytes.is_empty() {
        return (status, Value::Null);
    }
    let value = serde_json::from_slice(&bytes).unwrap_or_else(|_| {
        panic!(
            "{method} {uri} -> {status} body {}",
            String::from_utf8_lossy(&bytes)
        )
    });
    (status, value)
}

fn error_message(body: &Value) -> String {
    body["error"]["message"].as_str().unwrap_or("").to_string()
}

#[tokio::test]
async fn teacher_register_exposes_invite_code_on_me() {
    with_app(|app| async move {
        let (status, body) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "teacher",
                "displayName": "王老师",
                "email": "Teacher@School.edu",
                "password": "password1",
                "className": "高二 (3) 班"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let invite = body["user"]["class"]["inviteCode"].as_str().unwrap();
        assert_eq!(invite.len(), 5);
        assert!(invite
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit()));
        assert_eq!(body["user"]["email"], "teacher@school.edu");
        assert_eq!(body["user"]["role"], "teacher");
        assert_eq!(body["user"]["displayName"], "王老师");
        assert_eq!(body["user"]["class"]["name"], "高二 (3) 班");
        assert!(body["user"]["class"]["students"].as_array().unwrap().is_empty());

        let token = body["accessToken"].as_str().unwrap();
        let (status, me) = call(&app, "GET", "/api/v1/me", Some(token), None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(me["class"]["inviteCode"], invite);
    })
    .await;
}

#[tokio::test]
async fn student_with_invite_joins_and_cannot_see_the_code() {
    with_app(|app| async move {
        let (_, teacher) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "teacher",
                "displayName": "王老师",
                "email": "teacher@school.edu",
                "password": "password1",
                "className": "高二 (3) 班"
            })),
        )
        .await;
        let invite = teacher["user"]["class"]["inviteCode"].as_str().unwrap();
        let class_id = teacher["user"]["class"]["id"].as_str().unwrap();

        let (status, student) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student",
                "displayName": "李同学",
                "email": "student@school.edu",
                "password": "password1",
                "inviteCode": format!("{}-{}", &invite[..2], &invite[2..])
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(student["user"]["displayName"], "李同学");
        assert_eq!(student["user"]["class"]["id"], class_id);
        assert_eq!(student["user"]["class"]["name"], "高二 (3) 班");
        assert!(student["user"]["class"].get("inviteCode").is_none());
        assert!(student["user"]["class"].get("students").is_none());

        let teacher_token = teacher["accessToken"].as_str().unwrap();
        let (_, me) = call(&app, "GET", "/api/v1/me", Some(teacher_token), None).await;
        assert_eq!(me["class"]["students"][0]["email"], "student@school.edu");
        assert_eq!(me["class"]["students"][0]["displayName"], "李同学");

        let student_token = student["accessToken"].as_str().unwrap();
        let (status, _) = call(
            &app,
            "PATCH",
            "/api/v1/classes/current",
            Some(student_token),
            Some(json!({ "name": "别的班" })),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
async fn student_can_skip_invite_code_and_join_later() {
    with_app(|app| async move {
        let (_, teacher) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "teacher",
                "displayName": "王老师",
                "email": "teacher@school.edu",
                "password": "password1",
                "className": "高二 (3) 班"
            })),
        )
        .await;
        let (status, student) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student",
                "displayName": "李同学",
                "email": "student@school.edu",
                "password": "password1"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert!(student["user"]["class"].is_null());

        let token = student["accessToken"].as_str().unwrap().to_string();
        let (status, joined) = call(
            &app,
            "POST",
            "/api/v1/classes/join",
            Some(&token),
            Some(json!({ "inviteCode": teacher["user"]["class"]["inviteCode"] })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(joined["class"]["name"], "高二 (3) 班");
        assert!(joined["class"].get("inviteCode").is_none());
    })
    .await;
}

#[tokio::test]
async fn invalid_invite_code_does_not_create_the_user() {
    with_app(|app| async move {
        let (status, body) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student",
                "displayName": "李同学",
                "email": "student@school.edu",
                "password": "password1",
                "inviteCode": "ZZZZZ"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(error_message(&body), "邀请码无效");

        let (status, _) = call(
            &app,
            "POST",
            "/api/v1/auth/login",
            None,
            Some(json!({
                "email": "student@school.edu",
                "password": "password1"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        let (status, _) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student",
                "displayName": "李同学",
                "email": "student@school.edu",
                "password": "password1"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
    })
    .await;
}

#[tokio::test]
async fn register_requires_a_display_name() {
    with_app(|app| async move {
        let (status, body) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student",
                "email": "student@school.edu",
                "password": "password1",
                "displayName": "   "
            })),
        )
        .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(error_message(&body), "请填写用户名");

        let (status, _) = call(
            &app,
            "POST",
            "/api/v1/auth/login",
            None,
            Some(json!({
                "email": "student@school.edu",
                "password": "password1"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    })
    .await;
}

#[tokio::test]
async fn duplicate_email_and_wrong_password() {
    with_app(|app| async move {
        let _ = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "teacher",
                "displayName": "王老师",
                "email": "teacher@school.edu",
                "password": "password1",
                "className": "一班"
            })),
        )
        .await;
        let (status, body) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student",
                "displayName": "李同学",
                "email": "TEACHER@school.edu",
                "password": "password1"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT, "{body}");
        assert_eq!(error_message(&body), "该邮箱已注册");

        let (status, body) = call(
            &app,
            "POST",
            "/api/v1/auth/login",
            None,
            Some(json!({
                "email": "teacher@school.edu",
                "password": "wrong-password"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(error_message(&body), "邮箱或密码错误");
    })
    .await;
}

#[tokio::test]
async fn refresh_rotates_and_logout_revokes() {
    with_app(|app| async move {
        let (_, registered) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student",
                "displayName": "李同学",
                "email": "student@school.edu",
                "password": "password1"
            })),
        )
        .await;
        let first = registered["refreshToken"].as_str().unwrap().to_string();
        let (status, rotated) = call(
            &app,
            "POST",
            "/api/v1/auth/refresh",
            None,
            Some(json!({ "refreshToken": first })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let second = rotated["refreshToken"].as_str().unwrap().to_string();
        assert_ne!(first, second);

        let (status, _) = call(
            &app,
            "POST",
            "/api/v1/auth/refresh",
            None,
            Some(json!({ "refreshToken": first })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        let (status, _) = call(
            &app,
            "POST",
            "/api/v1/auth/logout",
            None,
            Some(json!({ "refreshToken": second })),
        )
        .await;
        assert_eq!(status, StatusCode::NO_CONTENT);

        let (status, _) = call(
            &app,
            "POST",
            "/api/v1/auth/refresh",
            None,
            Some(json!({ "refreshToken": second })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    })
    .await;
}
