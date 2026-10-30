use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::state::AppState;

const STAGE1_VISION_SYSTEM_PROMPT: &str = r#"你是高中立体几何试卷视觉感知与 OCR 提取器。你只负责客观、精准地读出题目文字与二维直观图中的线条连接关系，不做三维坐标计算。

请严格按以下规范观察图片：
1. 先根据印刷汉字的正常水平阅读方向，判断整张照片是否顺时针旋转了 0、90、180 或 270 度（填入 imageRotationDegrees）。以下所有方位（左/右、上/下、前排/后排、水平、竖直）一律以【把题目文字扶正到正常水平阅读方向后】的几何图为准！
2. problemText：逐字完整抄录图中的题目文字，保留全部垂直(⊥)、平行(∥)、角度(∠)、三角形(△)、边长等式（如 DC=2AB=2, CB=CE）、中点/分点/动点条件；若无文字填空字符串。
3. 区分多面体本体顶点（solidVertices）与棱上/面内的辅助点、中点、分点、动点（auxiliaryPoints）。
4. drawnPolyhedronEdges：列出图中画出的多面体本体外表面棱及线型 [端点1, 端点2, "solid" 或 "dashed"]。
5. extraAuxiliarySegments：逐一检查每个辅助点/动点以及多边形内部，列出图中所有【不与多面体本体棱重合】的额外作图线 [端点1, 端点2, "solid" 或 "dashed"]：
   - 包含底面或侧面内部额外画出的对角线（例如底面内部虚线对角线 ["A","C","dashed"]）；
   - 特别仔细观察每个动点/分点（如 F、M、N、P、Q）除了所在棱之外引出的极短实线或虚线（例如棱 BE 上的点 F 向紧邻顶点 C 连出的短线段 ["C","F","solid"]），务必顺着笔迹看清线段真正落在哪个字母顶点上，既不能漏掉短线，也绝不能把未画线连接的远处顶点臆测连上！
   - 某个点把一条本体棱分成两段时（如 F 在棱 BE 上），BF 与 FE 属于原棱本身，不要放进 extraAuxiliarySegments。

只输出一个 JSON 对象，不要 Markdown，字段如下：
{
  "imageRotationDegrees": 0,
  "problemText": "",
  "solidName": "",
  "solidVertices": ["A","B","C","D","E"],
  "basePolygonCyclic": ["A","B","C","D"],
  "topOrApexVertices": ["E"],
  "horizontalLeftToRightPairs": [["D","C"],["A","B"]],
  "verticalBottomToTopPairs": [["C","E"]],
  "backRowVertices": ["D","C"],
  "frontRowVertices": ["A","B"],
  "drawnPolyhedronEdges": [["A","B","solid"]],
  "auxiliaryPoints": [{"id":"F","description":"棱 BE 上的动点","onSegment":["B","E"],"approxRatioFromFirst":0.4}],
  "extraAuxiliarySegments": [["A","C","dashed"],["C","F","solid"]]
}"#;

const STAGE1_VISION_USER_PROMPT: &str = "仔细辨认图中的立体几何题干文字、所有顶点与动点字母、实线/虚线棱以及每一条额外辅助连线（特别是短连线与内部对角线），只输出 JSON。";

const STAGE2_SOLVER_SYSTEM_PROMPT: &str = r#"你是高中立体几何三维解析建系求解器。请根据视觉阶段提取的题干文字与直观图拓扑信息，严格通过空间解析几何方程还原真实、精确的三维立体模型。

【三维右手坐标系铁律（Y 轴竖直向上）】
- +X：水平向右；-X：水平向左
- +Y：竖直向上（高度轴！底面水平放置在 y=0 平面上，严禁使用 Z 轴作为高度轴！）
- +Z：朝向观察者正前方（对应斜二测画法中向前下方/左下方延伸的深度方向；后排深处顶点取 z=0，前排近处顶点必须取严格正值 z>0，绝不能取 z<0！）

【核心求解与数值自检铁律】
1. 题干几何约束最高优先级：problemText 中的所有定量与几何条件必须 100% 精确满足（零误差）：
   - 线面垂直：如 EC⊥平面ABCD，则 E 与 C 的 x、z 坐标完全相同，y_C=0，y_E=|CE|>0；
   - 平行与不自交环绕：若底面环绕顺序为 A-B-C-D 且 AB∥DC、DC=2AB=2，则有向向量 A→B 与 D→C 必须同向（即 (x_B-x_A, z_B-z_A) = +0.5*(x_C-x_D, z_C-z_D)），且 A、B、C 绝不共线（z_A=z_B>0, z_C=z_D=0），严禁写成反向蝴蝶结或三点共线退化图形！
   - 特殊三角形与直角：如 △ACD 为等边三角形且 DC=2，则必须满足 |AC|=|AD|=|DC|=2；如 ∠ACB=90°，则 CA·CB=0；
   - 严禁把一般四棱锥（如直角梯形底面、侧棱垂直底面）偷换成对称的正四棱锥或正方形底面！
2. 直观图方位对齐与横拍照片纠偏：
   - 正常方位下：图上水平从左到右的边 P→Q 必须满足 x_Q > x_P（注意正负号：若 C=(0,0,0) 且 D 在 C 左边距离为 2，则 D=(-2,0,0)，绝不能误写成 D=(+2,0,0)！）；后排顶点在 z=0，前排顶点在 z>0；竖直向上沿 +Y。
   - 若 imageRotationDegrees 为 90 或 270（照片横置）：Stage 1 的屏幕左右/前后方位可能旋转了 90°，此时一律以 problemText 的几何条件为准——直接将题干中平行的底边对（如 AB∥DC 中的后底边 D→C）沿 +X 轴放置（z=0, x_D < x_C），前排平行边 A→B 放在 z>0（x_A < x_B），垂直底面的侧棱沿 +Y 向上。
3. 数值精度：未直接给出的边长先用垂直、平行、等边、勾股定理严格推导；确属自由度未定的长度取 1 或 2。根号化成小数并保留 4 位（如 √3≈1.7321，√2≈1.4142）。
4. 拓扑完整性：
   - vertices：只放多面体本体顶点（不含棱上中点/动点等辅助点）。
   - faces：列出多面体的全部外表面（底面 + 所有侧面/顶面），每个面按周界连续环绕顺序排列（不要把平整四边形底面拆成两个三角形）。
   - edges：只放多面体外表面周界棱（含被遮挡虚线棱），确保凸多面体满足 V - E + F = 2。面内对角线（如底面对角线 AC）绝不能放进 edges，必须放进 aux！
   - points：辅助点/分点/动点。在线段上的点写 {"id":"F","from":"B","to":"E","t":0.4}（中点 t=0.5；DQ=3QC 且在 DC 上则从 D 到 C 的 t=0.75；动点按图中比例取 0.35~0.5）；不在已知线段上的点写 {"id":"O","x":0,"y":0,"z":0}。
   - aux：放入 extraAuxiliarySegments 中所有不与多面体棱重合的辅助线段与面内对角线（如 [["A","C"],["C","F"]]），无则给 []。
   - 圆柱、圆锥底面用 8 个顶点近似圆。
5. 强制代入具体数字验算（derivation 字段）：
   - JSON 第一个字段必须是 derivation（约 200~550 字）：写出各顶点具体数值坐标后，**必须把具体数字代入距离平方公式逐条写出算式验算**（例如写出 |AD|²=(-1-(-2))²+(1.7321-0)²=1+3=4 => |AD|=2，检验 x_C>x_D、z_前排>0、底面不共线不自交）！若发现算式不成立（如误把 -2 写成 +2 导致 |AD|²=12≠4），立即在 derivation 中修正坐标后再输出 vertices！

只输出一个 JSON 对象，不要 Markdown，字段顺序固定为：
{
  "derivation": "建系设点并代入具体数字逐条验算边长平方、平行同向、垂直与前后左右正负号",
  "name": "四棱锥 E-ABCD",
  "subtitle": "EC⊥底面ABCD，AB∥DC",
  "vertices": [{"id":"A","x":0,"y":0,"z":0}],
  "edges": [["A","B"]],
  "faces": [["A","B","C","D"]],
  "points": [{"id":"F","from":"B","to":"E","t":0.4}],
  "aux": [["A","C"],["C","F"]]
}"#;

const SINGLE_STAGE_USER_PROMPT: &str = "按斜二测画法与题干几何条件精确还原图中的三维立体（Y轴竖直向上，底面在y=0），只输出 JSON。";
const MAX_IMAGE_DATA_URL_BYTES: usize = 8_000_000;

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

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(42))
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            tracing::error!(error = %err, "failed to create math recognition client");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "识图服务暂时不可用");
        }
    };

    // Stage 1: deepseek-flash 高精度视觉感知与 OCR 拓扑提取
    let stage1_body = json!({
        "model": "deepseek-flash",
        "temperature": 0.0,
        "thinking": { "type": "disabled" },
        "max_tokens": 1400,
        "stream": false,
        "response_format": { "type": "json_object" },
        "messages": [
            { "role": "system", "content": STAGE1_VISION_SYSTEM_PROMPT },
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": STAGE1_VISION_USER_PROMPT },
                    { "type": "image_url", "image_url": { "url": &input.image, "detail": "high" } }
                ]
            }
        ]
    });

    let mut stage1_perception = match call_deepseek_chat(&client, api_key, stage1_body).await {
        Ok(parsed) => parsed,
        Err((status, msg)) => return error(status, msg),
    };
    if let Some(obj) = stage1_perception.as_object_mut() {
        let rot = obj
            .get("imageRotationDegrees")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        if matches!(rot, 90 | 180 | 270) {
            obj.remove("horizontalLeftToRightPairs");
            obj.remove("verticalBottomToTopPairs");
            obj.remove("backRowVertices");
            obj.remove("frontRowVertices");
        }
    }

    // Stage 2: deepseek-v4-pro 旗舰级三维空间解析几何建系求解与验算
    let stage2_user = format!(
        "以下是从立体几何试卷图像中提取的题干文字与二维直观图拓扑结构，请严格按右手系（Y轴向上，底面 y=0）完成三维解析几何建系求解与验算，只输出 JSON：\n{}",
        stage1_perception
    );
    let stage2_body = json!({
        "model": "deepseek-v4-pro",
        "temperature": 0.0,
        "thinking": { "type": "disabled" },
        "max_tokens": 4096,
        "stream": false,
        "response_format": { "type": "json_object" },
        "messages": [
            { "role": "system", "content": STAGE2_SOLVER_SYSTEM_PROMPT },
            { "role": "user", "content": stage2_user }
        ]
    });

    match call_deepseek_chat(&client, api_key, stage2_body).await {
        Ok(figure) => (StatusCode::OK, Json(json!({ "figure": figure }))),
        Err((StatusCode::GATEWAY_TIMEOUT, msg)) => error(StatusCode::GATEWAY_TIMEOUT, msg),
        Err(_) => {
            tracing::warn!("stage 2 deepseek-v4-pro failed, falling back to single-stage flash solver");
            let fallback_system = format!(
                "{STAGE2_SOLVER_SYSTEM_PROMPT}\n\n请直接观察用户上传的立体几何题目图片，先读清题干全部条件与图中所有顶点、动点、实线、虚线及短辅助连线，在 derivation 中完成建系验算并输出上述 JSON。"
            );
            let fallback_body = json!({
                "model": "deepseek-flash",
                "temperature": 0.0,
                "thinking": { "type": "disabled" },
                "max_tokens": 2400,
                "stream": false,
                "response_format": { "type": "json_object" },
                "messages": [
                    { "role": "system", "content": fallback_system },
                    {
                        "role": "user",
                        "content": [
                            { "type": "text", "text": SINGLE_STAGE_USER_PROMPT },
                            { "type": "image_url", "image_url": { "url": &input.image, "detail": "high" } }
                        ]
                    }
                ]
            });
            match call_deepseek_chat(&client, api_key, fallback_body).await {
                Ok(figure) => (StatusCode::OK, Json(json!({ "figure": figure }))),
                Err((status, msg)) => error(status, msg),
            }
        }
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
