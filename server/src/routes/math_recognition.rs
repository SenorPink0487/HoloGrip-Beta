use std::sync::OnceLock;
use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::state::AppState;

const FAST_STEREOMETRY_SYSTEM_PROMPT: &str = r#"你是高中立体几何极速识图与空间约束提取器。
先把照片按汉字正常水平阅读方向扶正观察（记录顺时针旋转角 rot: 0|90|180|270），按右手系（+X水平向右，+Y竖直向上为高度轴，底面在y=0；+Z朝观察者向前，底面后排边z=0，前排顶点z>0）只输出一个紧凑JSON（不要Markdown）：
{
  "rot": 0,
  "text": "如图，在四棱锥W-UVXY中，WV⊥平面UVXY，UX∥VY，UV=VY=WV=2，H为棱WU上的动点",
  "name": "四棱锥 W-UVXY",
  "subtitle": "WV⊥平面UVXY，UX∥VY",
  "faces": [["U","V","X","Y"],["W","U","V"],["W","V","X"],["W","X","Y"],["W","Y","U"]],
  "points": [{"id":"H","from":"U","to":"W","t":0.4,"conn":["V"]}],
  "aux": [["U","X","dashed"]],
  "constraints": {
    "base": ["U","V","X","Y"],
    "up": [["V","W"]],
    "len": [["U","V",2],["V","Y",2],["W","V",2]],
    "eq": [],
    "par": [["U","X","V","Y"]],
    "perp": [["W","V","U","V"],["W","V","V","Y"]],
    "ang": [],
    "lr": [["Y","V"]],
    "front": ["U","X"],
    "back": ["Y","V"]
  },
  "vertices": [["U",-1,0,1],["V",1,0,0],["X",1,0,1],["Y",-1,0,0],["W",1,2,0]]
}
严格遵守：
1. text：逐字抄录题干关键条件（保留全部 ⊥、∥、△、角度、边长等式、动点/分点；无文字填空字符串）。
2. faces：列出多面体全部外表面周界环绕顶点（平整四边形面勿拆成两个三角形；圆柱/圆锥底面用8顶点近似圆）。
3. points：列出不在多面体顶点上的棱上动点/中点/分点（估算 t∈(0,1)）；conn 填入图中以该点为端点直接引出的额外实线或虚线所连向的目标字母（极短连线切勿漏掉；仅从背后穿过的顶点长对角线交点不是该点连线；无则填 []）。
4. aux：只填多面体顶点之间图中真实画有墨迹线条的对角线 [端点1, 端点2, "solid"或"dashed"]（未画墨迹线的两点严禁填入）。
5. constraints：base(底面y=0环序)、up(垂直底面向上的有向边[下,上])、len(仅填题干明确给数值的边长)、eq([1,2,3,4,倍数k]表示|12|=k*|34|)、par([1,2,3,4]平行)、perp([1,2,3,4]垂直)、ang([1,2,3,度数])、lr/front/back。
6. vertices：用 [点名,x,y,z] 给多面体本体顶点初值（底面y=0，高度沿+Y）。"#;

const FAST_STEREOMETRY_USER_PROMPT: &str = "识别图中立体几何题并输出紧凑约束与拓扑JSON。";
const MAX_IMAGE_DATA_URL_BYTES: usize = 8_000_000;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn shared_http_client() -> Result<&'static reqwest::Client, String> {
    if let Some(client) = HTTP_CLIENT.get() {
        return Ok(client);
    }
    let built = reqwest::Client::builder()
        .timeout(Duration::from_secs(22))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;
    let _ = HTTP_CLIENT.set(built);
    HTTP_CLIENT.get().ok_or_else(|| "client init failed".to_string())
}

#[derive(Deserialize)]
pub struct RecognizeRequest {
    image: String,
}

async fn call_deepseek_chat(
    client: &reqwest::Client,
    api_key: &str,
    body: Value,
) -> Result<Value, (StatusCode, &'static str)> {
    let response = client
        .post("https://api.deepseek.com/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| {
            tracing::warn!(error = %err, "math recognition provider request failed");
            let status = if err.is_timeout() {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            (status, "识别服务暂时没有回应，请稍后再试")
        })?;

    if !response.status().is_success() {
        let provider_status = response.status();
        tracing::warn!(%provider_status, "math recognition provider returned an error");
        return Err((StatusCode::BAD_GATEWAY, "识别服务暂时没有回应，请稍后再试"));
    }

    let payload = response.json::<Value>().await.map_err(|err| {
        tracing::warn!(error = %err, "invalid math recognition provider response");
        (StatusCode::BAD_GATEWAY, "识图服务返回了无效结果")
    })?;

    let Some(content) = payload
        .pointer("/choices/0/message/content")
        .and_then(message_content)
    else {
        tracing::warn!("math recognition provider response is missing message content");
        return Err((StatusCode::BAD_GATEWAY, "没有认出图里的立体"));
    };

    extract_json(&content).ok_or((StatusCode::BAD_GATEWAY, "没有认出图里的立体"))
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

    let client = match shared_http_client() {
        Ok(client) => client,
        Err(err) => {
            tracing::error!(error = %err, "failed to create math recognition client");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "识图服务暂时不可用");
        }
    };

    let body = json!({
        "model": "deepseek-flash",
        "temperature": 0.0,
        "thinking": { "type": "disabled" },
        "max_tokens": 900,
        "stream": false,
        "response_format": { "type": "json_object" },
        "messages": [
            { "role": "system", "content": FAST_STEREOMETRY_SYSTEM_PROMPT },
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": FAST_STEREOMETRY_USER_PROMPT },
                    { "type": "image_url", "image_url": { "url": &input.image, "detail": "high" } }
                ]
            }
        ]
    });

    match call_deepseek_chat(client, api_key, body).await {
        Ok(figure) => (StatusCode::OK, Json(json!({ "figure": figure }))),
        Err((status, msg)) => error(status, msg),
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
