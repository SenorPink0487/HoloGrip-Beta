use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub bind: String,
    pub access_ttl_secs: i64,
    pub refresh_ttl_secs: i64,
    pub cors_origins: Vec<String>,
    pub fast_hash: bool,
    pub deepseek_api_key: Option<String>,
    pub smtp: Option<SmtpConfig>,
}

// Deliberately do not derive Debug: SMTP credentials must never enter logs.
#[derive(Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from: String,
    pub starttls: bool,
}

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("bind", &self.bind)
            .field("access_ttl_secs", &self.access_ttl_secs)
            .field("refresh_ttl_secs", &self.refresh_ttl_secs)
            .field("fast_hash", &self.fast_hash)
            .field(
                "deepseek_api_key_configured",
                &self.deepseek_api_key.is_some(),
            )
            .finish_non_exhaustive()
    }
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url = env::var("DATABASE_URL").map_err(|_| "缺少 DATABASE_URL".to_string())?;
        let jwt_secret = env::var("JWT_SECRET").map_err(|_| "缺少 JWT_SECRET".to_string())?;
        if jwt_secret.len() < 32 {
            return Err("JWT_SECRET 至少需要 32 字节".to_string());
        }
        let bind = env::var("BIND").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
        let access_ttl_secs = parse_secs("ACCESS_TTL_SECS", 900)?;
        let refresh_ttl_secs = parse_secs("REFRESH_TTL_SECS", 1_209_600)?;
        let cors_origins = env::var("CORS_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(str::to_string)
            .collect();
        let deepseek_api_key = env::var("DEEPSEEK_API_KEY")
            .ok()
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty());
        let smtp = match env::var("SMTP_HOST")
            .ok()
            .filter(|host| !host.trim().is_empty())
        {
            Some(_) if env::var("SMTP_PASSWORD").map_or(true, |value| value.trim().is_empty()) => {
                tracing::warn!(
                    "SMTP_PASSWORD is not configured; email verification is unavailable"
                );
                None
            }
            Some(host) => {
                let required = |name: &str| {
                    env::var(name)
                        .ok()
                        .filter(|value| !value.trim().is_empty())
                        .ok_or_else(|| format!("缺少 {name}"))
                };
                let starttls = match env::var("SMTP_SECURITY").as_deref().unwrap_or("tls") {
                    "tls" => false,
                    "starttls" => true,
                    _ => return Err("SMTP_SECURITY 必须为 tls 或 starttls".to_string()),
                };
                let port = env::var("SMTP_PORT")
                    .unwrap_or_else(|_| if starttls { "587" } else { "465" }.to_string())
                    .parse::<u16>()
                    .ok()
                    .filter(|port| *port > 0)
                    .ok_or_else(|| "SMTP_PORT 必须是有效端口".to_string())?;
                let from = required("SMTP_FROM")?;
                from.parse::<lettre::message::Mailbox>()
                    .map_err(|_| "SMTP_FROM 邮箱格式不正确".to_string())?;
                Some(SmtpConfig {
                    host: host.trim().to_string(),
                    port,
                    starttls,
                    from,
                    username: required("SMTP_USERNAME")?,
                    password: required("SMTP_PASSWORD")?,
                })
            }
            None => None,
        };

        Ok(Self {
            database_url,
            jwt_secret,
            bind,
            access_ttl_secs,
            refresh_ttl_secs,
            cors_origins,
            fast_hash: false,
            deepseek_api_key,
            smtp,
        })
    }

    pub fn for_test() -> Self {
        Self {
            database_url: String::new(),
            jwt_secret: "0123456789abcdef0123456789abcdef".to_string(),
            bind: "127.0.0.1:0".to_string(),
            access_ttl_secs: 900,
            refresh_ttl_secs: 1_209_600,
            cors_origins: Vec::new(),
            fast_hash: true,
            deepseek_api_key: None,
            smtp: None,
        }
    }
}

fn parse_secs(name: &str, default: i64) -> Result<i64, String> {
    match env::var(name) {
        Ok(value) => value
            .parse::<i64>()
            .map_err(|_| format!("{name} 必须是整数"))
            .and_then(|secs| {
                if secs > 0 {
                    Ok(secs)
                } else {
                    Err(format!("{name} 必须大于 0"))
                }
            }),
        Err(_) => Ok(default),
    }
}

pub fn default_cors_origins() -> Vec<&'static str> {
    vec![
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ]
}
