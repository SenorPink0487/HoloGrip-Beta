use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::state::AppState;

const SYSTEM_PROMPT: &str = r#"你是高中立体几何识图器。用户上传的图几乎都是斜二测画法：水平向右是真实的 x，竖直向上是真实的 y，斜向约 45° 且画出来更短的那条轴是深度 z，纸上的斜线长度不是真实长度。不要把像素坐标抄下来。

根据图中的字母、实线、虚线和题目里的长度、垂直、中点、比例，还原真实的三维模型。坐标系用右手系，y 轴向上，底面在 y=0。方便的顶点放在原点附近。数字用题目里的长度，根号写成小数，保留 4 位。没给的长度用垂直和全等推出来，仍不知道就用 1。

规则：
- AD⊥平面ABC 时，D 和 A 的 x、z 相同，只有高度 y 不同。
- 直角在 C、CA 与 CB 垂直时，C 放在原点，CA 沿 x 轴，CB 沿 z 轴。
- 虚线是被挡住的棱，仍然写进 edges。
- 图里多画出来的线段，例如中点连线 BM、PQ，全部放进 aux。已经重合在某条棱上的线段不要再放。没有额外线就给空数组。
- 分点：DQ=3QC 且 Q 在 DC 上，表示从 D 到 C 的 t=0.75。中点 t=0.5。辅助点可以引用另一个辅助点。
- 不在棱上的点直接给 x,y,z。
- 圆柱、圆锥的底面用 8 个点近似圆。

只输出一个 JSON 对象，不要 Markdown，不要解答。字段：
name, subtitle,
vertices:[{id,x,y,z}],
edges:[[id,id]],
faces:[[id,id,id]],
points:[{id,from,to,t}] 或 {id,x,y,z},
aux:[[id,id]]"#;

const USER_PROMPT: &str = "按斜二测画法还原图中的立体，只输出 JSON。";
const MAX_IMAGE_DATA_URL_BYTES: usize = 8_000_000;

#[derive(Deserialize)]
pub struct RecognizeRequest {
    image: String,
}

pub async fn recognize(
    State(state): State<AppState>,
    Json(input): Json<RecognizeRequest>,
) -> (StatusCode, Json<Value>) {
    if input.image.len() > MAX_IMAGE_DATA_URL_BYTES {
        return error(StatusCode::PAYLOAD_TOO_LARGE, "图片太大，请重新选择");
    }
    if ![
        "data:image/jpeg;base64,",
        "data:image/png;base64,",
        "data:image/webp;base64,",
    ]
    .iter()
    .any(|prefix| input.image.starts_with(prefix))
    {
        return error(StatusCode::BAD_REQUEST, "请上传 JPG、PNG 或 WebP 图片");
    }

    let Some(api_key) = state.config.deepseek_api_key.as_deref() else {
        tracing::error!("DEEPSEEK_API_KEY is not configured");
        return error(StatusCode::SERVICE_UNAVAILABLE, "识图服务尚未配置");
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(35))
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            tracing::error!(error = %err, "failed to create math recognition client");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "识图服务暂时不可用");
        }
    };

    let response = match client
        .post("https://api.deepseek.com/chat/completions")
        .bearer_auth(api_key)
        .json(&json!({
            "model": "deepseek-flash",
            "thinking": { "type": "disabled" },
            "max_tokens": 1400,
            "stream": false,
            "response_format": { "type": "json_object" },
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": USER_PROMPT },
                        { "type": "image_url", "image_url": { "url": input.image, "detail": "high" } }
                    ]
                }
            ]
        }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => {
            tracing::warn!(error = %err, "math recognition provider request failed");
            let status = if err.is_timeout() {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            return error(status, "识别服务暂时没有回应，请稍后再试");
        }
    };

    if !response.status().is_success() {
        let provider_status = response.status();
        tracing::warn!(%provider_status, "math recognition provider returned an error");
        return error(StatusCode::BAD_GATEWAY, "识别服务暂时没有回应，请稍后再试");
    }

    let payload = match response.json::<Value>().await {
        Ok(payload) => payload,
        Err(err) => {
            tracing::warn!(error = %err, "invalid math recognition provider response");
            return error(StatusCode::BAD_GATEWAY, "识图服务返回了无效结果");
        }
    };
    let Some(content) = payload
        .pointer("/choices/0/message/content")
        .and_then(message_content)
    else {
        tracing::warn!("math recognition provider response is missing message content");
        return error(StatusCode::BAD_GATEWAY, "没有认出图里的立体");
    };

    match extract_json(&content) {
        Some(figure) => (StatusCode::OK, Json(json!({ "figure": figure }))),
        None => error(StatusCode::BAD_GATEWAY, "没有认出图里的立体"),
    }
}

fn message_content(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    let parts = value.as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<String>();
    (!text.is_empty()).then_some(text)
}

fn extract_json(content: &str) -> Option<Value> {
    let trimmed = content.trim();
    let body = if let Some(start) = trimmed.find("```json") {
        let after = &trimmed[start + 7..];
        let after = after.strip_prefix('\n').unwrap_or(after);
        after.split("```").next()?
    } else if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        let after = after.strip_prefix("json").unwrap_or(after);
        after.split("```").next()?
    } else {
        trimmed
    };
    let start = body.find('{')?;
    let end = body.rfind('}')?;
    (end >= start)
        .then(|| serde_json::from_str(&body[start..=end]).ok())
        .flatten()
}

fn error(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "error": message })))
}
