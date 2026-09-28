use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::state::AppState;

const SYSTEM_PROMPT: &str = r#"你是烧杯配料器。用户说出一种日常物质，把它拆成 3 到 5 种真实主要成分。只输出一个 JSON，不要解释，不要写制备步骤。

字段：name，summary（20字以内），color（#rrggbb 液体颜色），volumeMl（40到120），components。
每个成分：name，formula，kind，moles，molarMass，color，protons，species。
kind 只能是 acid、base、carbonate、chloride、sulfate、copper、iron3、iron2、silver、barium、permanganate、peroxide、metal、fizz、inert。
species 是 [{ion, count}]。ion 只能是 H+、OH-、Na+、K+、Ca2+、Cu2+、Fe3+、Fe2+、Ba2+、Ag+、Al3+、Cl-、SO4_2-、NO3-、CO3_2-、I-、MnO4-、H2O2。
moles 是这一杯里的物质的量，用 0.0001 到 0.05。弱酸 protons 写 1，盐酸写 1，硫酸写 2。金属一块大约 0.02。
糖、咖啡因、色素、蛋白质、脂肪用 inert，species 用空数组。
汽水里的二氧化碳只写一个 fizz，不要再写碳酸。可乐和果汁要写出糖。食醋、柠檬汁里的酸用 acid。小苏打用 carbonate。食盐用 chloride。
金属 formula 只能是 Mg、Zn、Fe、Al、Cu、Na。"#;

#[derive(Deserialize)]
pub struct AnalyzeRequest {
    query: String,
}

pub async fn analyze(
    State(state): State<AppState>,
    Json(input): Json<AnalyzeRequest>,
) -> (StatusCode, Json<Value>) {
    let query = input.query.trim();
    if query.is_empty() {
        return error(StatusCode::BAD_REQUEST, "请说出要分析的东西");
    }
    if query.chars().count() > 40 {
        return error(StatusCode::BAD_REQUEST, "描述请控制在 40 个字以内");
    }

    let Some(api_key) = state.config.deepseek_api_key.as_deref() else {
        tracing::error!("DEEPSEEK_API_KEY is not configured");
        return error(StatusCode::SERVICE_UNAVAILABLE, "成分分析服务尚未配置");
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            tracing::error!(error = %err, "failed to create chemistry provider client");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "成分分析暂时不可用");
        }
    };

    let response = match client
        .post("https://api.deepseek.com/chat/completions")
        .bearer_auth(api_key)
        .json(&json!({
            "model": "deepseek-flash",
            "thinking": { "type": "disabled" },
            "max_tokens": 520,
            "temperature": 0,
            "stream": false,
            "response_format": { "type": "json_object" },
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                { "role": "user", "content": query },
            ]
        }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => {
            tracing::warn!(error = %err, "chemistry provider request failed");
            let status = if err.is_timeout() {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            return error(status, "成分分析暂时没有回应，请稍后再试");
        }
    };

    if !response.status().is_success() {
        let provider_status = response.status();
        let detail = response
            .json::<Value>()
            .await
            .ok()
            .and_then(|body| {
                body.pointer("/error/message")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .unwrap_or_default();
        tracing::warn!(%provider_status, provider_error = %detail, "chemistry provider returned an error");
        return error(StatusCode::BAD_GATEWAY, "成分分析暂时没有回应，请稍后再试");
    }

    let payload = match response.json::<Value>().await {
        Ok(payload) => payload,
        Err(err) => {
            tracing::warn!(error = %err, "invalid chemistry provider response");
            return error(StatusCode::BAD_GATEWAY, "成分分析暂时没有回应，请稍后再试");
        }
    };
    let Some(content) = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
    else {
        tracing::warn!("chemistry provider response is missing message content");
        return error(StatusCode::BAD_GATEWAY, "没有拆出可用的成分");
    };

    match extract_json(content) {
        Some(mixture) => (StatusCode::OK, Json(json!({ "mixture": mixture }))),
        None => error(StatusCode::BAD_GATEWAY, "没有拆出可用的成分"),
    }
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
