use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use server::{connect, migrate, router, AppState, Config};
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
        sqlx::query(statement).execute(&mut *conn).await.unwrap();
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
async fn account_preferences_survive_login_and_remain_private() {
    with_app(|app| async move {
        let credentials = json!({ "email": "prefs@school.edu", "password": "password1" });
        let (status, registered) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student", "displayName": "偏好测试",
                "email": "prefs@school.edu", "password": "password1"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(registered["user"]["preferences"], json!({}));
        let token = registered["accessToken"].as_str().unwrap();
        let (status, _) = call(
            &app,
            "PATCH",
            "/api/v1/me/preferences",
            None,
            Some(json!({ "spatialWindowScale": 1.65 })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        let (status, prefs) = call(
            &app,
            "PATCH",
            "/api/v1/me/preferences",
            Some(token),
            Some(json!({ "spatialWindowScale": 1.65 })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(prefs["spatialWindowScale"], 1.65);
        let (status, _) = call(
            &app,
            "PATCH",
            "/api/v1/me/preferences",
            Some(token),
            Some(json!({ "spatialWindowScale": 9 })),
        )
        .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        // An empty patch must preserve the user's existing preference.
        let (_, prefs) = call(
            &app,
            "PATCH",
            "/api/v1/me/preferences",
            Some(token),
            Some(json!({})),
        )
        .await;
        assert_eq!(prefs["spatialWindowScale"], 1.65);
        let (_, me) = call(&app, "GET", "/api/v1/me", Some(token), None).await;
        assert_eq!(me["preferences"]["spatialWindowScale"], 1.65);
        let (status, prefs) = call(
            &app,
            "PATCH",
            "/api/v1/me/preferences",
            Some(token),
            Some(json!({ "whiteboardTheme": "grid" })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(prefs["spatialWindowScale"], 1.65);
        assert_eq!(prefs["whiteboardTheme"], "grid");
        let (status, _) = call(
            &app,
            "PATCH",
            "/api/v1/me/preferences",
            Some(token),
            Some(json!({ "whiteboardTheme": "invalid" })),
        )
        .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        let (status, _) = call(
            &app,
            "POST",
            "/api/v1/auth/logout",
            None,
            Some(json!({ "refreshToken": registered["refreshToken"] })),
        )
        .await;
        assert_eq!(status, StatusCode::NO_CONTENT);
        let (status, login) =
            call(&app, "POST", "/api/v1/auth/login", None, Some(credentials)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(login["user"]["preferences"]["spatialWindowScale"], 1.65);
        assert_eq!(login["user"]["preferences"]["whiteboardTheme"], "grid");
        let (status, refreshed) = call(
            &app,
            "POST",
            "/api/v1/auth/refresh",
            None,
            Some(json!({ "refreshToken": login["refreshToken"] })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(refreshed["user"]["preferences"]["spatialWindowScale"], 1.65);
        assert_eq!(refreshed["user"]["preferences"]["whiteboardTheme"], "grid");

        let (_, other) = call(
            &app,
            "POST",
            "/api/v1/auth/register",
            None,
            Some(json!({
                "role": "student", "displayName": "另一个用户",
                "email": "other-prefs@school.edu", "password": "password1"
            })),
        )
        .await;
        assert_eq!(other["user"]["preferences"], json!({}));
        let (status, prefs) = call(
            &app,
            "PATCH",
            "/api/v1/me/preferences",
            other["accessToken"].as_str(),
            Some(json!({ "spatialWindowScale": 0.8 })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(prefs["spatialWindowScale"], 0.8);
        let (_, me) = call(
            &app,
            "GET",
            "/api/v1/me",
            refreshed["accessToken"].as_str(),
            None,
        )
        .await;
        assert_eq!(me["preferences"]["spatialWindowScale"], 1.65);
    })
    .await;
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
        assert!(body["user"]["class"]["students"]
            .as_array()
            .unwrap()
            .is_empty());

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

async fn with_admin_app<F, Fut>(test: F)
where
    F: FnOnce(axum::Router, MySqlPool, Value) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let _guard = LOCK.lock().await;
    let pool = fresh_pool().await;
    server::reset_data(&pool, "owner@example.com", "Owner", "owner-password-123")
        .await
        .unwrap();
    let app = router(AppState {
        pool: pool.clone(),
        config: Arc::new(Config::for_test()),
    });
    let (status, owner) = call(
        &app,
        "POST",
        "/api/v1/auth/login",
        None,
        Some(json!({"email": "owner@example.com", "password": "owner-password-123"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(owner["user"]["isAdmin"], true);
    test(app, pool, owner).await;
}

#[tokio::test]
async fn every_admin_route_requires_a_current_administrator() {
    with_admin_app(|app, _pool, owner| async move {
        let endpoints = [
            ("GET", "/api/v1/admin/overview"),
            ("GET", "/api/v1/admin/users"),
            ("POST", "/api/v1/admin/users"),
            ("PATCH", "/api/v1/admin/users/missing"),
            ("DELETE", "/api/v1/admin/users/missing"),
            ("GET", "/api/v1/admin/classes"),
            ("POST", "/api/v1/admin/classes"),
            ("PATCH", "/api/v1/admin/classes/missing"),
            ("DELETE", "/api/v1/admin/classes/missing"),
            ("POST", "/api/v1/admin/classes/missing/regenerate-code"),
            ("POST", "/api/v1/admin/classes/missing/members"),
            ("DELETE", "/api/v1/admin/classes/missing/members/missing"),
            ("GET", "/api/v1/admin/security"),
            ("POST", "/api/v1/admin/security/unlock"),
            ("POST", "/api/v1/admin/security/unlock-all"),
            ("POST", "/api/v1/admin/security/lock"),
            ("POST", "/api/v1/admin/security/sessions/missing/revoke"),
            ("POST", "/api/v1/admin/security/users/missing/revoke-all"),
        ];
        for role in ["student", "teacher"] {
            let (status, ordinary) = call(
                &app,
                "POST",
                "/api/v1/auth/register",
                None,
                Some(json!({
                    "role": role, "displayName": "Ordinary", "email": format!("{role}@example.com"),
                    "password": "ordinary-password", "className": "Test class", "isAdmin": true,
                })),
            )
            .await;
            assert_eq!(status, StatusCode::CREATED);
            assert_eq!(
                ordinary["user"]["isAdmin"], false,
                "public registration cannot grant admin"
            );
            for (method, endpoint) in endpoints {
                assert_eq!(
                    call(&app, method, endpoint, None, Some(json!({}))).await.0,
                    StatusCode::UNAUTHORIZED,
                    "anonymous {method} {endpoint}"
                );
                assert_eq!(
                    call(
                        &app,
                        method,
                        endpoint,
                        ordinary["accessToken"].as_str(),
                        Some(json!({}))
                    )
                    .await
                    .0,
                    StatusCode::FORBIDDEN,
                    "{role} {method} {endpoint}"
                );
                assert_eq!(
                    call(&app, method, endpoint, Some("invalid-jwt"), Some(json!({})))
                        .await
                        .0,
                    StatusCode::UNAUTHORIZED
                );
            }
        }
        assert_eq!(
            call(
                &app,
                "GET",
                "/api/v1/admin/overview",
                owner["accessToken"].as_str(),
                None
            )
            .await
            .0,
            StatusCode::OK
        );
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/admin/seed",
                owner["accessToken"].as_str(),
                None
            )
            .await
            .0,
            StatusCode::NOT_FOUND
        );
    })
    .await;
}

#[tokio::test]
async fn administrator_edits_accounts_and_grants_and_revokes_access() {
    with_admin_app(|app, _pool, owner| async move {
        let token = owner["accessToken"].as_str();
        let (status, user) = call(&app, "POST", "/api/v1/admin/users", token, Some(json!({
            "role": "student", "displayName": "Before", "email": "before@example.com", "password": "old-password",
        }))).await;
        assert_eq!(status, StatusCode::CREATED);
        let id = user["id"].as_str().unwrap();
        let (_, old_login) = call(&app, "POST", "/api/v1/auth/login", None, Some(json!({"email":"before@example.com", "password":"old-password"}))).await;
        let (status, updated) = call(&app, "PATCH", &format!("/api/v1/admin/users/{id}"), token, Some(json!({
            "email": "after@example.com", "displayName": "After", "password": "new-password",
            "isAdmin": true, "preferences": {"spatialWindowScale": 1.5, "whiteboardTheme": "grid"},
        }))).await;
        assert_eq!(status, StatusCode::OK, "{updated}");
        assert_eq!(updated["isAdmin"], true);
        assert_eq!(updated["preferences"]["spatialWindowScale"], 1.5);
        assert!(updated.get("password").is_none() && updated.get("passwordHash").is_none());
        assert_eq!(call(&app, "GET", "/api/v1/me", old_login["accessToken"].as_str(), None).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(call(&app, "POST", "/api/v1/auth/refresh", None, Some(json!({"refreshToken":old_login["refreshToken"]}))).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(call(&app, "POST", "/api/v1/auth/login", None, Some(json!({"email":"after@example.com", "password":"old-password"}))).await.0, StatusCode::UNAUTHORIZED);
        let (status, promoted) = call(&app, "POST", "/api/v1/auth/login", None, Some(json!({"email":"after@example.com", "password":"new-password"}))).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(promoted["user"]["role"], "student", "admin access preserves teaching identity");
        assert_eq!(call(&app, "GET", "/api/v1/admin/users", promoted["accessToken"].as_str(), None).await.0, StatusCode::OK);
        assert_eq!(call(&app, "PATCH", &format!("/api/v1/admin/users/{id}"), token, Some(json!({"isAdmin":false}))).await.0, StatusCode::OK);
        assert_eq!(call(&app, "GET", "/api/v1/admin/users", promoted["accessToken"].as_str(), None).await.0, StatusCode::UNAUTHORIZED);
        let (_, demoted) = call(&app, "POST", "/api/v1/auth/login", None, Some(json!({"email":"after@example.com", "password":"new-password"}))).await;
        assert_eq!(call(&app, "GET", "/api/v1/admin/users", demoted["accessToken"].as_str(), None).await.0, StatusCode::FORBIDDEN);
        assert_eq!(call(&app, "DELETE", &format!("/api/v1/admin/users/{id}"), token, None).await.0, StatusCode::NO_CONTENT);
        assert_eq!(call(&app, "GET", "/api/v1/me", demoted["accessToken"].as_str(), None).await.0, StatusCode::UNAUTHORIZED);
    }).await;
}

#[tokio::test]
async fn last_admin_cannot_be_removed_and_reset_clears_all_application_data() {
    with_admin_app(|app, pool, owner| async move {
        let path = format!("/api/v1/admin/users/{}", owner["user"]["id"].as_str().unwrap());
        assert_eq!(call(&app, "PATCH", &path, owner["accessToken"].as_str(), Some(json!({"isAdmin":false}))).await.0, StatusCode::CONFLICT);
        assert_eq!(call(&app, "DELETE", &path, owner["accessToken"].as_str(), None).await.0, StatusCode::CONFLICT);
        let (_, teacher) = call(&app, "POST", "/api/v1/auth/register", None, Some(json!({"role":"teacher","displayName":"Teacher","email":"teacher@example.com","password":"teacher-password","className":"Reset class"}))).await;
        let class_id = teacher["user"]["class"]["id"].as_str().unwrap();
        sqlx::query("INSERT INTO class_whiteboards (class_id,snapshot) VALUES (?, JSON_OBJECT())").bind(class_id).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO whiteboard_operations (class_id,op_id,user_id) VALUES (?,'test',?)").bind(class_id).bind(teacher["user"]["id"].as_str().unwrap()).execute(&pool).await.unwrap();
        let (_, _student) = call(&app, "POST", "/api/v1/auth/register", None, Some(json!({"role":"student","displayName":"Student","email":"student@example.com","password":"student-password","inviteCode":teacher["user"]["class"]["inviteCode"]}))).await;
        server::reset_data(&pool, "reset@example.com", "Reset owner", "reset-password").await.unwrap();
        for table in ["classes","class_members","class_whiteboards","whiteboard_operations","refresh_tokens","login_attempts"] {
            let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}")).fetch_one(&pool).await.unwrap();
            assert_eq!(count, 0, "{table} must be empty");
        }
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE is_admin = TRUE").fetch_one(&pool).await.unwrap();
        assert_eq!(count, 1);
        assert_eq!(call(&app, "GET", "/api/v1/admin/users", owner["accessToken"].as_str(), None).await.0, StatusCode::UNAUTHORIZED);
        let (status, fresh) = call(&app, "POST", "/api/v1/auth/login", None, Some(json!({"email":"reset@example.com","password":"reset-password"}))).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(fresh["user"]["displayName"], "Reset owner");
        assert_eq!(fresh["user"]["isAdmin"], true);
    }).await;
}

#[tokio::test]
async fn revoking_a_device_blocks_access_and_refresh_without_affecting_other_devices() {
    with_admin_app(|app, pool, owner| async move {
        let token = owner["accessToken"].as_str();
        let (_, created) = call(&app, "POST", "/api/v1/admin/users", token, Some(json!({"role":"student","displayName":"Devices","email":"devices@example.com","password":"device-password"}))).await;
        let credentials = json!({"email":"devices@example.com","password":"device-password"});
        let (_, first) = call(&app,"POST","/api/v1/auth/login",None,Some(credentials.clone())).await;
        let session_id: String = sqlx::query_scalar("SELECT id FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL")
            .bind(created["id"].as_str().unwrap()).fetch_one(&pool).await.unwrap();
        let (_, second) = call(&app,"POST","/api/v1/auth/login",None,Some(credentials)).await;
        assert_eq!(call(&app,"POST",&format!("/api/v1/admin/security/sessions/{session_id}/revoke"),token,None).await.0,StatusCode::NO_CONTENT);
        assert_eq!(call(&app,"GET","/api/v1/me",first["accessToken"].as_str(),None).await.0,StatusCode::UNAUTHORIZED);
        assert_eq!(call(&app,"POST","/api/v1/auth/refresh",None,Some(json!({"refreshToken":first["refreshToken"]}))).await.0,StatusCode::UNAUTHORIZED);
        assert_eq!(call(&app,"GET","/api/v1/me",second["accessToken"].as_str(),None).await.0,StatusCode::OK);
        let (status, refreshed) = call(&app,"POST","/api/v1/auth/refresh",None,Some(json!({"refreshToken":second["refreshToken"]}))).await;
        assert_eq!(status,StatusCode::OK);
        assert_eq!(call(&app,"GET","/api/v1/me",refreshed["accessToken"].as_str(),None).await.0,StatusCode::OK);
        let path = format!("/api/v1/admin/security/users/{}/revoke-all",created["id"].as_str().unwrap());
        assert_eq!(call(&app,"POST",&path,token,None).await.0,StatusCode::NO_CONTENT);
        assert_eq!(call(&app,"GET","/api/v1/me",refreshed["accessToken"].as_str(),None).await.0,StatusCode::UNAUTHORIZED);
    }).await;
}
