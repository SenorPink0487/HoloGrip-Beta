use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, NaiveDateTime, Utc};
use hmac::{Hmac, Mac};
use lettre::{
    message::{header::ContentType, Attachment, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use rand::{rngs::OsRng, Rng};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::Sha256;
use uuid::Uuid;

use crate::{
    auth::{
        password::{hash_password, validate_password},
        token::CurrentUser,
    },
    error::AppError,
    state::AppState,
};

const RESEND_SECONDS: i64 = 60;
const EXPIRY_SECONDS: i64 = 600;
const MAX_ATTEMPTS: i32 = 5;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChangePasswordBody {
    code: String,
    new_password: String,
}

#[derive(sqlx::FromRow)]
struct Verification {
    email: String,
    auth_version: i64,
    code_hash: Vec<u8>,
    sent_at: NaiveDateTime,
    expires_at: NaiveDateTime,
    failed_attempts: i32,
    delivered: bool,
}

fn code_mac(secret: &str, user_id: &str, email: &str, version: i64, code: &str) -> Hmac<Sha256> {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key size");
    mac.update(format!("password-change\0{user_id}\0{email}\0{version}\0{code}").as_bytes());
    mac
}

fn invalid_code() -> AppError {
    AppError::new(
        StatusCode::UNPROCESSABLE_ENTITY,
        "invalid_verification_code",
        "验证码错误或已失效，请重新获取",
    )
}

const OFFICIAL_WEBSITE_URL: &str = "https://hologrip.cn";
const DISCORD_INVITE_URL: &str = "https://discord.gg/2ZKMRCzxH2";
const HOLOGRIP_LOGO_CID: &str = "hologrip-logo";
const WEBSITE_ICON_CID: &str = "website-icon";
const DISCORD_ICON_CID: &str = "discord-icon";

const HOLOGRIP_LOGO_PNG: &[u8] = include_bytes!("../assets/hologrip-logo.png");
const WEBSITE_ICON_PNG: &[u8] = include_bytes!("../assets/website-icon.png");
const DISCORD_ICON_PNG: &[u8] = include_bytes!("../assets/discord-icon.png");

fn mail_error() -> AppError {
    AppError::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "email_unavailable",
        "验证邮件发送失败，请稍后重试或联系管理员",
    )
}

fn escape_html(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn format_greeting(display_name: Option<&str>, escape: bool) -> String {
    match display_name.map(str::trim).filter(|name| !name.is_empty()) {
        Some(name) if escape => format!("尊敬的 {}，您好：", escape_html(name)),
        Some(name) => format!("尊敬的 {name}，您好："),
        None => "尊敬的用户，您好：".to_string(),
    }
}

fn build_verification_plain_text(display_name: Option<&str>, email: &str, code: &str) -> String {
    let greeting = format_greeting(display_name, false);
    format!(
        "{greeting}\n\
\n\
感谢您的使用与支持。我们收到了您账户（{email}）的密码修改申请，为保障您的账户安全，请在验证界面输入以下验证码以完成身份确认：\n\
\n\
{code}\n\
\n\
该验证码将在 10 分钟后失效（最多可尝试 5 次）。出于安全考虑，请勿将此验证码透露给他人。若非您本人发起此次操作，请直接忽略本邮件，您的账户依然安全无虞。\n\
\n\
衷心感谢您的信任与陪伴，祝您探索愉快、教学顺心！\n\
\n\
顺颂时祺，\n\
HoloGrip Team\n\
\n\
—\n\
本邮件由系统自动发送，请勿直接回复\n\
Website · {OFFICIAL_WEBSITE_URL}\n\
Discord · {DISCORD_INVITE_URL}"
    )
}

fn build_verification_html(display_name: Option<&str>, _email: &str, code: &str) -> String {
    let greeting = format_greeting(display_name, true);
    let safe_code = escape_html(code);

    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>密码修改验证</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#ffffff;">
    您的密码修改验证码为 {safe_code}，10 分钟内有效。
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:28px 16px 36px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;text-align:left;">
          <!-- Header Title with Inline Logo -->
          <tr>
            <td style="padding-bottom:20px;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:12px;">
                    <a href="{OFFICIAL_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:block;">
                      <img src="cid:{HOLOGRIP_LOGO_CID}" alt="Logo" width="34" height="34" style="display:block;width:34px;height:34px;border:0;outline:none;" />
                    </a>
                  </td>
                  <td valign="middle">
                    <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;line-height:1.25;">
                      密码修改验证
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting & Lead-in -->
          <tr>
            <td style="padding-top:24px;padding-bottom:10px;font-size:15px;font-weight:500;color:#1e293b;line-height:1.7;">
              {greeting}
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:22px;font-size:15px;color:#334155;line-height:1.8;">
              感谢您的使用与支持。我们收到了您的账户密码修改申请，为保障您的账户安全，请在验证界面输入以下验证码以完成身份确认：
            </td>
          </tr>

          <!-- Verification Code Box -->
          <tr>
            <td style="padding-bottom:22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px 16px 20px 16px;">
                    <div style="font-family:ui-monospace,'SF Mono','JetBrains Mono',Menlo,Monaco,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:12px;color:#0f172a;line-height:1.1;padding-left:12px;">
                      {safe_code}
                    </div>
                    <div style="font-size:12px;color:#64748b;line-height:1.5;margin-top:10px;">
                      有效期 10 分钟 · 最多可尝试 5 次
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security Note & Blessing -->
          <tr>
            <td style="padding-bottom:14px;font-size:14px;color:#475569;line-height:1.8;">
              出于安全考虑，请勿将此验证码透露给他人。若非您本人发起此次操作，请直接忽略本邮件，您的账户依然安全无虞。
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:22px;font-size:14px;color:#475569;line-height:1.8;">
              衷心感谢您的信任与陪伴，祝您探索愉快、教学顺心！
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;font-size:14px;color:#64748b;line-height:1.6;">
              顺颂时祺，<br />
              <strong style="color:#0f172a;font-weight:600;font-size:15px;display:inline-block;margin-top:4px;">HoloGrip Team</strong>
            </td>
          </tr>

          <!-- Minimalist Footer -->
          <tr>
            <td style="border-top:1px solid #e2e8f0;padding-top:18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="font-size:12px;color:#94a3b8;line-height:1.6;">
                    本邮件由系统自动发送，请勿直接回复
                  </td>
                  <td align="right" valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right:16px;">
                          <a href="{OFFICIAL_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" title="官方网站" style="text-decoration:none;display:inline-block;">
                            <img src="cid:{WEBSITE_ICON_CID}" alt="Website" width="18" height="18" style="display:block;width:18px;height:18px;border:0;" />
                          </a>
                        </td>
                        <td valign="middle">
                          <a href="{DISCORD_INVITE_URL}" target="_blank" rel="noopener noreferrer" title="加入 Discord 社区" style="text-decoration:none;display:inline-block;">
                            <img src="cid:{DISCORD_ICON_CID}" alt="Discord" width="18" height="18" style="display:block;width:18px;height:18px;border:0;" />
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"#
    )
}

fn inline_png_attachment(cid: &str, bytes: &'static [u8]) -> Result<SinglePart, AppError> {
    let content_type = ContentType::parse("image/png").map_err(|_| mail_error())?;
    Ok(Attachment::new_inline(cid.to_string()).body(bytes.to_vec(), content_type))
}

fn build_verification_message(
    from: &str,
    to: &str,
    display_name: Option<&str>,
    code: &str,
) -> Result<Message, AppError> {
    let plain_text = build_verification_plain_text(display_name, to, code);
    let html_body = build_verification_html(display_name, to, code);
    let html_related = MultiPart::related()
        .singlepart(SinglePart::html(html_body))
        .singlepart(inline_png_attachment(HOLOGRIP_LOGO_CID, HOLOGRIP_LOGO_PNG)?)
        .singlepart(inline_png_attachment(WEBSITE_ICON_CID, WEBSITE_ICON_PNG)?)
        .singlepart(inline_png_attachment(DISCORD_ICON_CID, DISCORD_ICON_PNG)?);

    Message::builder()
        .from(from.parse().map_err(|_| mail_error())?)
        .to(to.parse().map_err(|_| mail_error())?)
        .subject("密码修改验证码")
        .multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(plain_text))
                .multipart(html_related),
        )
        .map_err(|_| mail_error())
}

async fn deliver_verification_email(
    smtp: &crate::config::SmtpConfig,
    to: &str,
    display_name: Option<&str>,
    code: &str,
) -> Result<(), AppError> {
    let message = build_verification_message(&smtp.from, to, display_name, code)?;
    // Always require TLS and certificate validation, including on STARTTLS relays.
    let builder = if smtp.starttls {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp.host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp.host)
    }
    .map_err(|_| mail_error())?;
    let transport = builder
        .port(smtp.port)
        .credentials(Credentials::new(
            smtp.username.clone(),
            smtp.password.clone(),
        ))
        .timeout(Some(std::time::Duration::from_secs(15)))
        .build();
    // Do not log the code, message, or SMTP credentials on failures.
    tokio::time::timeout(std::time::Duration::from_secs(20), transport.send(message))
        .await
        .map_err(|_| mail_error())?
        .map_err(|_| mail_error())?;
    Ok(())
}

pub async fn send_code(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Value>, AppError> {
    let smtp = state.config.smtp.as_ref().ok_or_else(|| {
        AppError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "email_not_configured",
            "邮箱验证服务尚未配置，请联系管理员",
        )
    })?;
    let mut tx = state.pool.begin().await?;
    // Both endpoints lock the user first to serialize requests, verification, and credential changes.
    let (email, display_name, version): (String, Option<String>, i64) = sqlx::query_as(
        "SELECT email, display_name, auth_version FROM users WHERE id = ? FOR UPDATE",
    )
    .bind(&user.id)
    .fetch_one(&mut *tx)
    .await?;
    let previous = sqlx::query_as::<_, Verification>("SELECT email, auth_version, code_hash, sent_at, expires_at, failed_attempts, delivered FROM password_email_verifications WHERE user_id = ? FOR UPDATE")
        .bind(&user.id).fetch_optional(&mut *tx).await?;
    let now = Utc::now().naive_utc();
    if previous.is_some_and(|row| row.sent_at + Duration::seconds(RESEND_SECONDS) > now) {
        return Err(AppError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "verification_rate_limited",
            "验证码发送过于频繁，请 60 秒后再试",
        ));
    }
    let code = format!("{:06}", OsRng.gen_range(0..1_000_000u32));
    let hash = code_mac(&state.config.jwt_secret, &user.id, &email, version, &code)
        .finalize()
        .into_bytes()
        .to_vec();
    let request_id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO password_email_verifications (user_id, request_id, email, auth_version, code_hash, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE request_id = VALUES(request_id), email = VALUES(email), auth_version = VALUES(auth_version), code_hash = VALUES(code_hash), sent_at = VALUES(sent_at), expires_at = VALUES(expires_at), failed_attempts = 0, delivered = FALSE")
        .bind(&user.id).bind(&request_id).bind(&email).bind(version).bind(hash).bind(now).bind(now + Duration::seconds(EXPIRY_SECONDS))
        .execute(&mut *tx).await?;
    tx.commit().await?;

    deliver_verification_email(smtp, &email, display_name.as_deref(), &code).await?;
    sqlx::query("UPDATE password_email_verifications SET delivered = TRUE WHERE user_id = ? AND request_id = ?")
        .bind(&user.id).bind(request_id).execute(&state.pool).await?;
    Ok(Json(
        json!({ "retryAfterSeconds": RESEND_SECONDS, "expiresInSeconds": EXPIRY_SECONDS }),
    ))
}

pub async fn change_password(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(body): Json<ChangePasswordBody>,
) -> Result<StatusCode, AppError> {
    validate_password(&body.new_password)?;
    let mut tx = state.pool.begin().await?;
    let (email, version): (String, i64) =
        sqlx::query_as("SELECT email, auth_version FROM users WHERE id = ? FOR UPDATE")
            .bind(&user.id)
            .fetch_one(&mut *tx)
            .await?;
    let row = sqlx::query_as::<_, Verification>("SELECT email, auth_version, code_hash, sent_at, expires_at, failed_attempts, delivered FROM password_email_verifications WHERE user_id = ? FOR UPDATE")
        .bind(&user.id).fetch_optional(&mut *tx).await?.ok_or_else(invalid_code)?;
    if !row.delivered
        || row.email != email
        || row.auth_version != version
        || row.expires_at <= Utc::now().naive_utc()
        || row.failed_attempts >= MAX_ATTEMPTS
    {
        return Err(invalid_code());
    }
    if body.code.len() != 6
        || !body.code.bytes().all(|b| b.is_ascii_digit())
        || code_mac(
            &state.config.jwt_secret,
            &user.id,
            &email,
            version,
            &body.code,
        )
        .verify_slice(&row.code_hash)
        .is_err()
    {
        sqlx::query("UPDATE password_email_verifications SET failed_attempts = failed_attempts + 1 WHERE user_id = ?")
            .bind(&user.id).execute(&mut *tx).await?;
        tx.commit().await?;
        return Err(invalid_code());
    }
    let hash = hash_password(&body.new_password, state.config.fast_hash)?;
    sqlx::query("UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?")
        .bind(hash)
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    )
    .bind(Utc::now().naive_utc())
    .bind(&user.id)
    .execute(&mut *tx)
    .await?;
    // Keep sent_at to prevent bypassing the resend cooldown, but consume the proof.
    sqlx::query("UPDATE password_email_verifications SET delivered = FALSE WHERE user_id = ?")
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verification_email_contains_polite_copy_website_logo_and_discord_without_brand_repetition() {
        let plain = build_verification_plain_text(Some("王老师"), "teacher@school.edu", "482910");
        assert!(plain.contains("尊敬的 王老师，您好："));
        assert!(plain.contains("482910"));
        assert!(plain.contains("https://hologrip.cn"));
        assert!(plain.contains("https://discord.gg/2ZKMRCzxH2"));
        assert!(plain.contains("HoloGrip Team"));
        assert!(!plain.contains("HoloGrip 用户"));
        assert!(!plain.contains("沉浸式 3D"));

        let html = build_verification_html(Some("王老师"), "teacher@school.edu", "482910");
        assert!(html.contains("尊敬的 王老师，您好："));
        assert!(html.contains("密码修改验证"));
        assert!(html.contains("482910"));
        assert!(html.contains("HoloGrip Team"));
        assert!(html.contains("本邮件由系统自动发送，请勿直接回复"));
        assert!(html.contains("https://hologrip.cn"));
        assert!(html.contains("cid:hologrip-logo"));
        assert!(html.contains("cid:website-icon"));
        assert!(html.contains("cid:discord-icon"));
        assert!(html.contains("https://discord.gg/2ZKMRCzxH2"));
        assert!(!html.contains("HoloGrip 验证码"));
        assert!(!html.contains("HoloGrip 用户"));
        assert!(!html.contains("沉浸式 3D"));
    }

    #[test]
    fn verification_email_escapes_html_and_falls_back_when_name_is_blank() {
        let html = build_verification_html(Some("   "), "user@school.edu", "007123");
        assert!(html.contains("尊敬的用户，您好："));
        assert!(!html.contains("HoloGrip 用户"));

        let escaped = build_verification_html(
            Some("<script>alert(1)</script>"),
            "user@school.edu",
            "123456",
        );
        assert!(!escaped.contains("<script>"));
        assert!(escaped.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
    }

    #[test]
    fn verification_message_builds_multipart_alternative() {
        let msg = build_verification_message(
            "HoloGrip <no-reply@hologrip.cn>",
            "student@school.edu",
            Some("李同学"),
            "654321",
        )
        .expect("valid email message");
        let raw = String::from_utf8(msg.formatted()).expect("utf8 mime message");
        assert!(raw.contains("multipart/alternative"));
        assert!(raw.contains("multipart/related"));
        assert!(raw.contains("text/plain"));
        assert!(raw.contains("text/html"));
        assert!(raw.contains("<hologrip-logo>"));
        assert!(raw.contains("<website-icon>"));
        assert!(raw.contains("<discord-icon>"));
        assert!(raw.contains("https://discord.gg/2ZKMRCzxH2"));
    }

    #[tokio::test]
    #[ignore]
    async fn send_live_test_email() {
        let _ = dotenvy::from_filename(".env");
        let config = crate::config::Config::from_env().expect("valid env config");
        let smtp = config.smtp.expect("SMTP must be configured in server/.env");
        let target =
            std::env::var("TEST_EMAIL_TO").unwrap_or_else(|_| "3155584495@qq.com".to_string());
        deliver_verification_email(&smtp, &target, None, "829406")
            .await
            .expect("live test email delivery succeeded");
        println!("Successfully delivered test verification email to {target}");
    }
}
