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
}

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("bind", &self.bind)
            .field("access_ttl_secs", &self.access_ttl_secs)
            .field("refresh_ttl_secs", &self.refresh_ttl_secs)
            .field("fast_hash", &self.fast_hash)
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

        Ok(Self {
            database_url,
            jwt_secret,
            bind,
            access_ttl_secs,
            refresh_ttl_secs,
            cors_origins,
            fast_hash: false,
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
