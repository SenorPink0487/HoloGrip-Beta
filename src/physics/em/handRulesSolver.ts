import type { HandGestureFrame, NormalizedLandmark, SingleHandData } from '../../vision/types.ts';

export type HandRuleMode = 'right-hand-screw' | 'left-hand-rule' | 'right-hand-rule';

export type Polarity = 1 | -1;

export type HandPoseStatus =
  | 'idle'           // 未开启手势或视野内无手
  | 'wrong-hand'     // 伸错了左右手（如左手定则伸了右手）
  | 'adjusting'      // 左右手正确，正在调整方向/姿势
  | 'matched';       // 手势方向正确，触发物理响应

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface HandRuleConfig {
  mode: HandRuleMode;
  currentPolarity: Polarity; // +1 或 -1（用于右手螺旋定则、左手定则）
  fieldPolarity: Polarity;   // +1 或 -1（用于左手定则、右手定则）
  motionPolarity: Polarity;  // +1 或 -1（用于右手定则导体切割运动方向）
  gestureEnabled: boolean;
}

export interface HandRuleEvaluation {
  mode: HandRuleMode;
  requiredHand: 'left' | 'right';
  detectedHand: 'left' | 'right' | null;
  status: HandPoseStatus;
  alignmentScore: number; // [0, 1] 连续匹配度
  isMatched: boolean;
  /** 已知电流方向矢量（世界坐标） */
  knownCurrentDir: Vec3 | null;
  /** 已知磁场方向矢量（世界坐标） */
  knownFieldDir: Vec3 | null;
  /** 已知导体切割运动方向矢量（世界坐标） */
  knownMotionDir: Vec3 | null;
  /** 所求的目标物理矢量方向（安培力 F / 感应电流 I_ind / 螺线管北极或电流方向） */
  targetVectorDir: Vec3;
  /** 右手螺旋定则中环绕磁场在俯视下的旋转方向：+1 逆时针（拇指向上），-1 顺时针（拇指向下） */
  screwCirculationSign: Polarity;
  /** 测得的大拇指单位方向矢量（世界坐标） */
  thumbDir: Vec3 | null;
  /** 测得的四指伸展平均单位方向矢量（世界坐标） */
  fourFingersDir: Vec3 | null;
  /** 四指弯曲程度 [0 = 完全伸直, 1 = 握拳弯曲] */
  fingerCurlRatio: number;
  /** 用于空间视窗控制面板展示的简明状态文本 */
  statusLabel: string;
}

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-6) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * 基于 3D 骨骼解剖学手性不变量，判定是否为解剖学右手或左手
 * 核心原理：
 * 1. 纵向轴 L = P9 - P0 (中指 MCP - 腕部)
 * 2. 横向轴 T = P5 - P17 (食指 MCP - 小指 MCP，指向桡侧/大拇指侧)
 * 3. 掌面法向 N = T x L
 * 4. 大拇指指向 D = P4 - P5 (食指 MCP -> 大拇指指尖)
 * 标量三重积 det([T, L, D]) = N · D 在任意 SO(3) 刚体旋转下符号严格保持不变：
 * 右手严格为负 (< 0)，左手严格为正 (> 0)
 */
export function detectAnatomicalChirality(lms: NormalizedLandmark[]): 'left' | 'right' | null {
  if (!lms || lms.length < 21) return null;
  const lx = lms[9].x - lms[0].x;
  const ly = lms[9].y - lms[0].y;
  const lz = (lms[9].z ?? 0) - (lms[0].z ?? 0);

  const tx = lms[5].x - lms[17].x;
  const ty = lms[5].y - lms[17].y;
  const tz = (lms[5].z ?? 0) - (lms[17].z ?? 0);

  const nx = ty * lz - tz * ly;
  const ny = tz * lx - tx * lz;
  const nz = tx * ly - ty * lx;

  const thx = lms[4].x - lms[5].x;
  const thy = lms[4].y - lms[5].y;
  const thz = (lms[4].z ?? 0) - (lms[5].z ?? 0);

  const det = nx * thx + ny * thy + nz * thz;

  // 必须具有真实 3D 深度信息（单目伪 3D 或真实相机深度）
  const hasZ = Math.abs(lz) > 1e-4 || Math.abs(tz) > 1e-4 || Math.abs(thz) > 1e-4;
  if (!hasZ) return null;

  if (det < -0.00003) return 'right';
  if (det > 0.00003) return 'left';
  return null;
}

/**
 * 将 MediaPipe 归一化关键点转换为实验台世界空间的左手/右手局部坐标（镜像后：+X 向右，+Y 向上，+Z 朝向操作者）
 */
export function landmarkToMirroredWorld(lm: NormalizedLandmark): Vec3 {
  return {
    x: 0.5 - lm.x,
    y: 0.5 - lm.y,
    z: -lm.z,
  };
}

/**
 * 从 21 个手部关键点提取大拇指指向、四指指向、掌心法向量与手掌屈伸几何特征
 * 严格遵循解剖学与物理学矢量规范：
 * 1. 大拇指指向由远端指骨 (IP=3 -> TIP=4) 与掌指骨 (MCP=2 -> TIP=4) 定义，严禁掺杂手腕到指尖的全局平移量
 * 2. 四指弯曲度结合关节弯曲收敛度 (MCP->PIP->DIP->TIP 路径长度比) 与掌心缩展比，精确区分握拳环绕与开掌平展
 * 3. 掌心法向量用于判定磁感线穿入/穿出掌心
 */
export function extractHandKinematics(
  landmarks: NormalizedLandmark[],
  handedness: 'left' | 'right' = 'right'
): {
  thumbDir: Vec3;
  fourFingersDir: Vec3;
  palmNormal: Vec3;
  fingerCurlRatio: number;
  avgExtension: number;
} {
  const pts = landmarks.map(landmarkToMirroredWorld);

  // 1. 大拇指指向矢量：由大拇指远端指节 (IP 3 -> TIP 4) 与掌指段 (MCP 2 -> TIP 4) 综合决定
  // 坚决去除 pts[4] - pts[0]（手腕到指尖），防止手掌竖直放置时大拇指即便水平横指也被虚假掺入 +Y 分量
  const thumbFromIp: Vec3 = {
    x: pts[4].x - pts[3].x,
    y: pts[4].y - pts[3].y,
    z: (pts[4].z - pts[3].z) * 0.70,
  };
  const thumbFromMcp: Vec3 = {
    x: pts[4].x - pts[2].x,
    y: pts[4].y - pts[2].y,
    z: (pts[4].z - pts[2].z) * 0.70,
  };

  const thumbRaw: Vec3 = {
    x: thumbFromIp.x * 0.65 + thumbFromMcp.x * 0.35,
    y: thumbFromIp.y * 0.65 + thumbFromMcp.y * 0.35,
    z: thumbFromIp.z * 0.65 + thumbFromMcp.z * 0.35,
  };
  const thumbDir = normalizeVec3(thumbRaw);

  // 1b. 大拇指关节伸直度 (straightness) 与伸展比 (extensionRatio)
  // 精确区分真正的「竖起大拇指 Thumbs-Up」与「普通闭合握拳 Plain Fist」
  const d23 = Math.hypot(pts[3].x - pts[2].x, pts[3].y - pts[2].y, pts[3].z - pts[2].z);
  const d34 = Math.hypot(pts[4].x - pts[3].x, pts[4].y - pts[3].y, pts[4].z - pts[3].z);
  const d24 = Math.hypot(pts[4].x - pts[2].x, pts[4].y - pts[2].y, pts[4].z - pts[2].z);
  const thumbStraightness = d24 / Math.max(1e-4, d23 + d34);
  const thumbMcpToTip: Vec3 = {
    x: pts[4].x - pts[2].x,
    y: pts[4].y - pts[2].y,
    z: pts[4].z - pts[2].z,
  };

  // 2. 四指平均指向矢量：食指(5->8)、中指(9->12)、无名指(13->16)、小指(17->20)
  const fingerJoints: Array<[number, number, number, number]> = [
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ];
  let fx = 0;
  let fy = 0;
  let fz = 0;
  for (const [mcpIdx, , , tipIdx] of fingerJoints) {
    fx += pts[tipIdx].x - pts[mcpIdx].x;
    fy += pts[tipIdx].y - pts[mcpIdx].y;
    fz += (pts[tipIdx].z - pts[mcpIdx].z) * 0.70;
  }
  const fourFingersDir = normalizeVec3({ x: fx, y: fy, z: fz });

  // 3. 四指弯曲程度与伸展程度
  // 结合真实关节点弯曲折叠度 (straightness = direct / jointPath) 与掌心尺度比 (extension = direct / palmScale)
  const wrist = pts[0];
  const palmScale = Math.max(
    0.05,
    Math.hypot(pts[9].x - wrist.x, pts[9].y - wrist.y, pts[9].z - wrist.z),
    Math.hypot(pts[5].x - pts[17].x, pts[5].y - pts[17].y, pts[5].z - pts[17].z)
  );

  let totalStraightness = 0;
  let totalExtension = 0;
  for (const [mcpIdx, pipIdx, dipIdx, tipIdx] of fingerJoints) {
    const d1 = Math.hypot(pts[pipIdx].x - pts[mcpIdx].x, pts[pipIdx].y - pts[mcpIdx].y, pts[pipIdx].z - pts[mcpIdx].z);
    const d2 = Math.hypot(pts[dipIdx].x - pts[pipIdx].x, pts[dipIdx].y - pts[pipIdx].y, pts[dipIdx].z - pts[pipIdx].z);
    const d3 = Math.hypot(pts[tipIdx].x - pts[dipIdx].x, pts[tipIdx].y - pts[dipIdx].y, pts[tipIdx].z - pts[dipIdx].z);
    const directDist = Math.hypot(
      pts[tipIdx].x - pts[mcpIdx].x,
      pts[tipIdx].y - pts[mcpIdx].y,
      pts[tipIdx].z - pts[mcpIdx].z
    );
    const segSum = d1 + d2 + d3;
    totalStraightness += directDist / Math.max(1e-4, segSum);
    totalExtension += directDist / palmScale;
  }
  const avgStraightness = totalStraightness / 4;
  const avgExtension = totalExtension / 4;

  // 真实手部各指节弯曲时 avgStraightness 显著下降至 0.35~0.60（伸直为 0.95~1.0）；
  // 合成测试手骨骼各段共线时 avgStraightness = 1.0，但 avgExtension 降至 0.35
  const realCurl = Math.max(0, Math.min(1, (0.88 - avgStraightness) / 0.40));
  const scaleCurl = Math.max(0, Math.min(1, (0.75 - avgExtension) / 0.40));
  const fingerCurlRatio = avgStraightness < 0.96 ? realCurl : scaleCurl;

  // 4. 手掌掌心朝向法向量（垂直于掌面并指向掌心外侧）
  // v_long: 腕部 0 -> 中指根部 9（手掌纵轴向远端）
  // v_lat: 小指根部 17 -> 食指根部 5（手掌横向）
  const v_long: Vec3 = { x: pts[9].x - pts[0].x, y: pts[9].y - pts[0].y, z: pts[9].z - pts[0].z };
  const v_lat: Vec3 = { x: pts[5].x - pts[17].x, y: pts[5].y - pts[17].y, z: pts[5].z - pts[17].z };
  const rawNormal: Vec3 = handedness === 'left'
    ? {
        x: v_lat.y * v_long.z - v_lat.z * v_long.y,
        y: v_lat.z * v_long.x - v_lat.x * v_long.z,
        z: v_lat.x * v_long.y - v_lat.y * v_long.x,
      }
    : {
        x: v_long.y * v_lat.z - v_long.z * v_lat.y,
        y: v_long.z * v_lat.x - v_long.x * v_lat.z,
        z: v_long.x * v_lat.y - v_long.y * v_lat.x,
      };
  const palmNormal = normalizeVec3(rawNormal);

  return {
    thumbDir,
    fourFingersDir,
    palmNormal,
    fingerCurlRatio,
    avgExtension,
    thumbStraightness,
    thumbExtensionRatio: d24 / palmScale,
    thumbMcpToTip,
    palmScale,
  };
}

/**
 * 构造模拟手势关键点（用于桌面无摄像头直接点击操作或自动化测试验证）
 */
export function buildSyntheticHandLandmarks(options: {
  thumbDirWorld: { x: number; y: number; z?: number };
  fingersDirWorld: { x: number; y: number; z?: number };
  curled?: boolean;
}): NormalizedLandmark[] {
  const lms: NormalizedLandmark[] = [];
  for (let i = 0; i < 21; i++) {
    lms.push({ x: 0.5, y: 0.5, z: 0 });
  }

  lms[0] = { x: 0.5, y: 0.58, z: 0 };
  lms[5] = { x: 0.46, y: 0.5, z: 0 };
  lms[9] = { x: 0.5, y: 0.48, z: 0 };
  lms[13] = { x: 0.54, y: 0.5, z: 0 };
  lms[17] = { x: 0.58, y: 0.52, z: 0 };

  const tx = options.thumbDirWorld.x;
  const ty = options.thumbDirWorld.y;
  const tz = options.thumbDirWorld.z ?? 0;
  lms[1] = { x: 0.48, y: 0.54, z: 0 };
  lms[2] = { x: 0.48 - tx * 0.03, y: 0.54 - ty * 0.03, z: -tz * 0.03 };
  lms[3] = { x: 0.48 - tx * 0.07, y: 0.54 - ty * 0.07, z: -tz * 0.07 };
  lms[4] = { x: 0.48 - tx * 0.12, y: 0.54 - ty * 0.12, z: -tz * 0.12 };

  const fx = options.fingersDirWorld.x;
  const fy = options.fingersDirWorld.y;
  const fz = options.fingersDirWorld.z ?? 0;
  const reach = options.curled ? 0.035 : 0.11;

  for (const mcp of [5, 9, 13, 17]) {
    const base = lms[mcp];
    lms[mcp + 1] = { x: base.x - fx * reach * 0.35, y: base.y - fy * reach * 0.35, z: -fz * reach * 0.35 };
    lms[mcp + 2] = { x: base.x - fx * reach * 0.7, y: base.y - fy * reach * 0.7, z: -fz * reach * 0.7 };
    lms[mcp + 3] = { x: base.x - fx * reach, y: base.y - fy * reach, z: -fz * reach };
  }

  return lms;
}

/**
 * 包装为完整的 HandGestureFrame 手势数据载荷
 */
export function wrapSyntheticHandFrame(
  handedness: 'left' | 'right',
  landmarks: NormalizedLandmark[]
): HandGestureFrame {
  const hand: SingleHandData = {
    handedness,
    confidence: 0.98,
    landmarks,
    thumbTip: landmarks[4],
    indexTip: landmarks[8],
    midpointNorm: { x: 0.5, y: 0.5, z: 0 },
    screenX: 600,
    screenY: 400,
    rawDistance: 0.08,
    handScale: 0.12,
    pinchRatio: 0.66,
    pinchStrength: 0,
    isPinching: false,
    justPinchStarted: false,
    justPinchEnded: false,
    pinchDuration: 0,
    isLongPinch: false,
  };

  return {
    hasHand: true,
    timestamp: typeof performance !== 'undefined' ? performance.now() : 1000,
    leftHand: handedness === 'left' ? hand : null,
    rightHand: handedness === 'right' ? hand : null,
    leftHandQuickPinch: false,
    leftHandCameraDelta: null,
    landmarks,
    thumbTip: landmarks[4],
    indexTip: landmarks[8],
    midpointNorm: { x: 0.5, y: 0.5, z: 0 },
    screenX: 600,
    screenY: 400,
    rawDistance: 0.08,
    handScale: 0.12,
    pinchRatio: 0.66,
    pinchStrength: 0,
    isPinching: false,
    justPinchStarted: false,
    justPinchEnded: false,
  };
}

/**
 * 计算三大定则下的已知物理量方向与目标待求方向
 */
export function computeRuleVectors(config: HandRuleConfig): {
  requiredHand: 'left' | 'right';
  knownCurrentDir: Vec3 | null;
  knownFieldDir: Vec3 | null;
  knownMotionDir: Vec3 | null;
  targetVectorDir: Vec3;
  screwCirculationSign: Polarity;
} {
  if (config.mode === 'right-hand-screw') {
    // 右手螺旋法则：竖直通电直导线，已知电流 I 沿 Y 轴 (+Y 向上 / -Y 向下)
    const iy = config.currentPolarity;
    return {
      requiredHand: 'right',
      knownCurrentDir: { x: 0, y: iy, z: 0 },
      knownFieldDir: null,
      knownMotionDir: null,
      targetVectorDir: { x: 0, y: iy, z: 0 }, // 右手大拇指需对齐电流方向
      screwCirculationSign: iy,
    };
  }

  if (config.mode === 'left-hand-rule') {
    // 左手定则：已知磁场 B (沿 Z 轴穿入/穿出掌心) 与导线电流 I (沿竖直导线 +Y 向上 / -Y 向下)
    // 安培力 F = I × B:
    // I = (0, iy, 0), B = (0, 0, bz), 其中 bz = -config.fieldPolarity, iy = config.currentPolarity
    // F = (iy * bz, 0, 0) (沿导轨水平向右 +X 或向左 -X)
    const bz = -config.fieldPolarity;
    const iy = config.currentPolarity;
    const fx = (iy * bz) as Polarity;
    return {
      requiredHand: 'left',
      knownCurrentDir: { x: 0, y: iy, z: 0 },
      knownFieldDir: { x: 0, y: 0, z: bz },
      knownMotionDir: null,
      targetVectorDir: { x: fx, y: 0, z: 0 }, // 左手大拇指指向安培力方向
      screwCirculationSign: 1,
    };
  }

  // 右手定则：已知磁场 B 沿前后方向 (0, 0, -fieldPolarity) 穿入掌心，导体切割速度 v 沿水平导轨 (motionPolarity, 0, 0)
  // 感应电流方向 I_ind = v × B = (vx, 0, 0) × (0, 0, bz) = (0, -vx * bz, 0) = (0, motionPolarity * fieldPolarity, 0)
  const bz = -config.fieldPolarity;
  const vx = config.motionPolarity;
  const indY = (config.motionPolarity * config.fieldPolarity) as Polarity;
  return {
    requiredHand: 'right',
    knownCurrentDir: null,
    knownFieldDir: { x: 0, y: 0, z: bz },
    knownMotionDir: { x: vx, y: 0, z: 0 },
    targetVectorDir: { x: 0, y: indY, z: 0 }, // 右手四指指向感应电流方向 (沿导体棒向上 +Y 或向下 -Y)
    screwCirculationSign: 1,
  };
}

/**
 * 根据当前手势帧评估用户的定则手势是否正确
 */
export function evaluateHandRuleFrame(
  config: HandRuleConfig,
  frame: HandGestureFrame | null
): HandRuleEvaluation {
  const vectors = computeRuleVectors(config);
  const { requiredHand, knownCurrentDir, knownFieldDir, knownMotionDir, targetVectorDir, screwCirculationSign } = vectors;

  if (!config.gestureEnabled || !frame || !frame.hasHand) {
    return {
      mode: config.mode,
      requiredHand,
      detectedHand: null,
      status: 'idle',
      alignmentScore: 0,
      isMatched: false,
      knownCurrentDir,
      knownFieldDir,
      knownMotionDir,
      targetVectorDir,
      screwCirculationSign,
      thumbDir: null,
      fourFingersDir: null,
      fingerCurlRatio: 0,
      statusLabel: config.gestureEnabled
        ? `请伸出${requiredHand === 'left' ? '左手' : '右手'}进行定则比划`
        : '手势交互未开启',
    };
  }

  // 优先取当前定则要求的手；若只检测到另一只手，则检查解剖学手性纠偏或在单手螺旋定则中智能判定
  let targetHandData: SingleHandData | null =
    requiredHand === 'left' ? frame.leftHand : frame.rightHand;
  let oppositeHandData: SingleHandData | null =
    requiredHand === 'left' ? frame.rightHand : frame.leftHand;

  // 1. 若目标手为空但对侧手存在：优先通过 3D 解剖学手性不变量校准（防止握拳/拇指比划时分类头单帧反转）
  if (!targetHandData && oppositeHandData && oppositeHandData.landmarks) {
    const anatomical = detectAnatomicalChirality(oppositeHandData.landmarks);
    if (anatomical === requiredHand) {
      targetHandData = { ...oppositeHandData, handedness: requiredHand };
      oppositeHandData = null;
    }
  }

  if (!targetHandData && oppositeHandData) {
    const oppKin = extractHandKinematics(oppositeHandData.landmarks, oppositeHandData.handedness);
    return {
      mode: config.mode,
      requiredHand,
      detectedHand: oppositeHandData.handedness,
      status: 'wrong-hand',
      alignmentScore: 0,
      isMatched: false,
      knownCurrentDir,
      knownFieldDir,
      knownMotionDir,
      targetVectorDir,
      screwCirculationSign,
      thumbDir: oppKin.thumbDir,
      fourFingersDir: oppKin.fourFingersDir,
      fingerCurlRatio: oppKin.fingerCurlRatio,
      statusLabel: `当前为${oppositeHandData.handedness === 'left' ? '左手' : '右手'}，请换用${requiredHand === 'left' ? '左手' : '右手'}`,
    };
  }

  if (!targetHandData || !targetHandData.landmarks || targetHandData.landmarks.length < 21) {
    return {
      mode: config.mode,
      requiredHand,
      detectedHand: null,
      status: 'idle',
      alignmentScore: 0,
      isMatched: false,
      knownCurrentDir,
      knownFieldDir,
      knownMotionDir,
      targetVectorDir,
      screwCirculationSign,
      thumbDir: null,
      fourFingersDir: null,
      fingerCurlRatio: 0,
      statusLabel: `请将${requiredHand === 'left' ? '左手' : '右手'}移入镜头视野`,
    };
  }

  const {
    thumbDir,
    fourFingersDir,
    palmNormal,
    fingerCurlRatio,
    avgExtension,
    thumbStraightness,
    thumbMcpToTip,
    palmScale,
  } = extractHandKinematics(targetHandData.landmarks, targetHandData.handedness);

  if (config.mode === 'right-hand-screw') {
    // 右手螺旋法则（安培定则）：
    // 物理铁律与用户直觉：
    // 1. 核心判定依据：右手必须明确「竖起大拇指」指向直导线电流 I 方向 (thumbDot >= 0.55)
    // 2. 严禁普通握拳误判：大拇指必须真正伸展突出 (thumbExtensionAlongTarget >= 0.35 且 thumbStraightness >= 0.85)
    // 3. 严禁全开手掌误判：四指必须握持环绕导线，严禁全张开平摊掌面 (isFlatOpenHand)
    const thumbDot = dotVec3(thumbDir, targetVectorDir);
    const thumbExtensionAlongTarget = dotVec3(thumbMcpToTip, targetVectorDir) / palmScale;
    const isThumbExtended = thumbExtensionAlongTarget >= 0.35 && thumbStraightness >= 0.85;
    const thumbAligned = thumbDot >= 0.55 && isThumbExtended;
    const isFlatOpenHand =
      fingerCurlRatio < 0.30 || (fingerCurlRatio < 0.40 && dotVec3(fourFingersDir, targetVectorDir) > 0.50);

    const isMatched = thumbAligned && !isFlatOpenHand;
    const alignmentScore = Math.max(0, Math.min(1, (thumbDot - 0.20) / 0.70)) *
      (isThumbExtended ? 1.0 : 0.2) *
      (isFlatOpenHand ? 0.15 : 1.0);

    let statusLabel: string;
    if (isMatched) {
      statusLabel = '右手螺旋匹配成功：环绕磁场 B 已点亮';
    } else if (isFlatOpenHand) {
      statusLabel = `请用右手四指握住导线（弯曲环绕），大拇指指向电流 (${targetVectorDir.y > 0 ? '向上' : '向下'})，避免全张开手掌`;
    } else if (!isThumbExtended) {
      statusLabel = `请竖起大拇指指向电流方向 (${targetVectorDir.y > 0 ? '向上' : '向下'})，避免仅闭合握拳`;
    } else if (thumbDot < -0.20) {
      statusLabel = `大拇指方向相反，请使大拇指指向电流 (${targetVectorDir.y > 0 ? '向上' : '向下'})`;
    } else {
      statusLabel = `请伸出右手握持导线，使大拇指指向电流方向 (${targetVectorDir.y > 0 ? '向上' : '向下'})`;
    }

    return {
      mode: config.mode,
      requiredHand,
      detectedHand: 'right',
      status: isMatched ? 'matched' : 'adjusting',
      alignmentScore,
      isMatched,
      knownCurrentDir,
      knownFieldDir,
      knownMotionDir,
      targetVectorDir,
      screwCirculationSign,
      thumbDir,
      fourFingersDir,
      fingerCurlRatio,
      statusLabel,
    };
  }

  if (config.mode === 'left-hand-rule') {
    // 左手定则：已知磁场 B 和导线电流 I，求安培力 F
    // 物理法则：
    // 1. 必须使用左手
    // 2. 开掌平展 (fingerCurlRatio <= 0.45)，大拇指指向安培力 F 方向 (+X 或 -X)
    // 3. 四指平展伸直，且大拇指垂直于四指
    const thumbDot = dotVec3(thumbDir, targetVectorDir);
    const fingersDot = knownCurrentDir ? dotVec3(fourFingersDir, knownCurrentDir) : 0;

    const isOpenHand = fingerCurlRatio <= 0.45;
    const thumbAligned = thumbDot >= 0.40;

    const isMatched = isOpenHand && thumbAligned;
    const alignmentScore = Math.max(0, Math.min(1, (thumbDot - 0.10) / 0.70)) *
      (fingersDot > 0.4 ? 1.0 : 0.85) *
      (isOpenHand ? 1.0 : 0.2);

    let statusLabel: string;
    if (isMatched) {
      statusLabel = `左手定则判定正确：安培力 F 驱动导体向${targetVectorDir.x > 0 ? '右' : '左'}加速滑行`;
    } else if (!isOpenHand) {
      statusLabel = '请平展左手掌并伸直四指，大拇指与四指垂直';
    } else if (thumbDot < -0.15) {
      statusLabel = `大拇指方向相反，请使大拇指指向安培力 F (${targetVectorDir.x > 0 ? '向右' : '向左'})`;
    } else {
      statusLabel = `请伸出左手，使大拇指指向安培力 F 方向 (${targetVectorDir.x > 0 ? '向右' : '向左'})`;
    }

    return {
      mode: config.mode,
      requiredHand,
      detectedHand: 'left',
      status: isMatched ? 'matched' : 'adjusting',
      alignmentScore,
      isMatched,
      knownCurrentDir,
      knownFieldDir,
      knownMotionDir,
      targetVectorDir,
      screwCirculationSign,
      thumbDir,
      fourFingersDir,
      fingerCurlRatio,
      statusLabel,
    };
  }

  // 右手定则：已知磁场 B 与切割运动速度 v，求感应电流 I_ind
  // 物理法则：
  // 1. 必须使用右手
  // 2. 开掌平展 (fingerCurlRatio <= 0.45)，四指伸直指向感应电流方向 (targetVectorDir, +Y 或 -Y)
  // 3. 大拇指伸直指向导体切割运动方向 (knownMotionDir, +X 或 -X)
  const fingersDot = dotVec3(fourFingersDir, targetVectorDir);
  const thumbDot = knownMotionDir ? dotVec3(thumbDir, knownMotionDir) : 0;

  const isOpenHand = fingerCurlRatio <= 0.45;
  const fingersAligned = fingersDot >= 0.42;
  const thumbNotOpposite = thumbDot >= -0.25;

  const isMatched = isOpenHand && fingersAligned && thumbNotOpposite;
  const alignmentScore = Math.max(0, Math.min(1, (fingersDot - 0.15) / 0.55)) *
    (thumbDot > 0.4 ? 1.0 : 0.8) *
    (isOpenHand ? 1.0 : 0.2);

  let statusLabel: string;
  if (isMatched) {
    statusLabel = `右手定则判定正确：感应电流沿导体向${targetVectorDir.y > 0 ? '上' : '下'}激发`;
  } else if (!isOpenHand) {
    statusLabel = '请平展右手掌并伸直四指，大拇指与四指垂直';
  } else if (!thumbNotOpposite) {
    statusLabel = `大拇指与运动方向相反，请使大拇指指向导体切割运动方向 (${knownMotionDir && knownMotionDir.x > 0 ? '向右' : '向左'})`;
  } else if (fingersDot < -0.15) {
    statusLabel = `四指方向与感应电流相反，请使四指指向感应电流方向 (${targetVectorDir.y > 0 ? '向上' : '向下'})`;
  } else {
    statusLabel = `已知 B 与切割运动 v，请伸右手使四指指向正确的感应电流方向 (${targetVectorDir.y > 0 ? '向上' : '向下'})`;
  }

  return {
    mode: config.mode,
    requiredHand,
    detectedHand: 'right',
    status: isMatched ? 'matched' : 'adjusting',
    alignmentScore,
    isMatched,
    knownCurrentDir,
    knownFieldDir,
    knownMotionDir,
    targetVectorDir,
    screwCirculationSign,
    thumbDir,
    fourFingersDir,
    fingerCurlRatio,
    statusLabel,
  };
}
