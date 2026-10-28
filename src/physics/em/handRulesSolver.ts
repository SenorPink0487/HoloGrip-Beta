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
 * 从 21 个手部关键点提取大拇指指向、四指指向与四指弯曲度
 */
export function extractHandKinematics(landmarks: NormalizedLandmark[]): {
  thumbDir: Vec3;
  fourFingersDir: Vec3;
  fingerCurlRatio: number;
} {
  const pts = landmarks.map(landmarkToMirroredWorld);

  // 1. 大拇指指向矢量：从拇指掌指关节 (MCP=2) 指向拇指尖 (TIP=4)，兼顾腕掌关节 (CMC=1)
  const thumbRaw: Vec3 = {
    x: (pts[4].x - pts[2].x) * 0.7 + (pts[4].x - pts[1].x) * 0.3,
    y: (pts[4].y - pts[2].y) * 0.7 + (pts[4].y - pts[1].y) * 0.3,
    z: (pts[4].z - pts[2].z) * 0.35, // 抑制单目深度 Z 噪声，强化 XY 主平面指向精度
  };
  const thumbDir = normalizeVec3(thumbRaw);

  // 2. 四指平均指向矢量：食指(5->8)、中指(9->12)、无名指(13->16)、小指(17->20)
  const fingerPairs: Array<[number, number]> = [
    [5, 8],
    [9, 12],
    [13, 16],
    [17, 20],
  ];
  let fx = 0;
  let fy = 0;
  let fz = 0;
  for (const [mcpIdx, tipIdx] of fingerPairs) {
    fx += pts[tipIdx].x - pts[mcpIdx].x;
    fy += pts[tipIdx].y - pts[mcpIdx].y;
    fz += (pts[tipIdx].z - pts[mcpIdx].z) * 0.35;
  }
  const fourFingersDir = normalizeVec3({ x: fx, y: fy, z: fz });

  // 3. 四指弯曲程度（通过指尖到掌心基部距离与掌骨长度的比值计算）
  const wrist = pts[0];
  const palmScale = Math.max(
    0.05,
    Math.hypot(pts[9].x - wrist.x, pts[9].y - wrist.y),
    Math.hypot(pts[5].x - pts[17].x, pts[5].y - pts[17].y)
  );

  let totalExtension = 0;
  for (const [mcpIdx, tipIdx] of fingerPairs) {
    const tipToMcp = Math.hypot(pts[tipIdx].x - pts[mcpIdx].x, pts[tipIdx].y - pts[mcpIdx].y);
    totalExtension += tipToMcp / palmScale;
  }
  const avgExtension = totalExtension / 4; // 伸直时约 0.85~1.25，握拳时约 0.15~0.45
  const fingerCurlRatio = Math.max(0, Math.min(1, (0.95 - avgExtension) / 0.55));

  return {
    thumbDir,
    fourFingersDir,
    fingerCurlRatio,
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
    // 左手定则：已知磁场 B 沿竖直方向 (0, fieldPolarity, 0)，电流 I 沿导体棒 (0, 0, -currentPolarity)
    // 安培力 F = I × B = ((-currentPolarity) * fieldPolarity, 0, 0) -> 当 currentPolarity=+1, fieldPolarity=+1 时，I=(0,0,-1)向里, B=(0,1,0)向上, F = (+1, 0, 0) 水平向右
    const by = config.fieldPolarity;
    const iz = -config.currentPolarity;
    // F = I x B: (0, 0, iz) x (0, by, 0) = (-iz * by, 0, 0) = (currentPolarity * fieldPolarity, 0, 0)
    const fx = (config.currentPolarity * config.fieldPolarity) as Polarity;
    return {
      requiredHand: 'left',
      knownCurrentDir: { x: 0, y: 0, z: iz },
      knownFieldDir: { x: 0, y: by, z: 0 },
      knownMotionDir: null,
      targetVectorDir: { x: fx, y: 0, z: 0 }, // 左手大拇指指向安培力 F (水平向右 +X 或水平向左 -X)
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

  // 优先取当前定则要求的手；若只检测到另一只手，则提示伸错左右手
  const targetHandData: SingleHandData | null =
    requiredHand === 'left' ? frame.leftHand : frame.rightHand;
  const oppositeHandData: SingleHandData | null =
    requiredHand === 'left' ? frame.rightHand : frame.leftHand;

  if (!targetHandData && oppositeHandData) {
    const oppKin = extractHandKinematics(oppositeHandData.landmarks);
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

  const { thumbDir, fourFingersDir, fingerCurlRatio } = extractHandKinematics(targetHandData.landmarks);

  if (config.mode === 'right-hand-screw') {
    // 右手螺旋定则：大拇指与电流 I 方向一致，且四指弯曲环绕
    const thumbDot = dotVec3(thumbDir, targetVectorDir); // [-1, 1]
    const dirScore = Math.max(0, Math.min(1, (thumbDot - 0.15) / 0.55));
    // 兼顾弯曲四指（握姿加分，即便微弯也允许通过）
    const curlBonus = fingerCurlRatio >= 0.18 ? 1.0 : 0.65 + (fingerCurlRatio / 0.18) * 0.35;
    const alignmentScore = dirScore * curlBonus;
    const isMatched = thumbDot >= 0.45 && fingerCurlRatio >= 0.15;

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
      statusLabel: isMatched
        ? `右手螺旋匹配成功：环绕磁场 B 已点亮`
        : `请用右手弯曲四指，大拇指指向电流 I (${targetVectorDir.y > 0 ? '向上' : '向下'})`,
    };
  }

  if (config.mode === 'left-hand-rule') {
    // 左手定则：已知磁场 B 和电流 I，求安培力 F —— 只要左手大拇指指向正确的安培力 F 方向即算对
    const thumbDot = dotVec3(thumbDir, targetVectorDir);
    const alignmentScore = Math.max(0, Math.min(1, (thumbDot - 0.15) / 0.55));
    const isMatched = thumbDot >= 0.42;

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
      statusLabel: isMatched
        ? `左手定则判定正确：安培力 F 驱动导体向${targetVectorDir.x > 0 ? '右' : '左'}运动`
        : `已知 B 与 I，请伸左手使大拇指指向正确的安培力 F 方向`,
    };
  }

  // 右手定则：已知磁场 B 与切割运动方向 v，求感应电流 I_ind —— 只要右手四指指向正确的感应电流方向即算对
  const fingersDot = dotVec3(fourFingersDir, targetVectorDir);
  const alignmentScore = Math.max(0, Math.min(1, (fingersDot - 0.15) / 0.55));
  const isMatched = fingersDot >= 0.42;

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
    statusLabel: isMatched
      ? `右手定则判定正确：感应电流沿导体向${targetVectorDir.y > 0 ? '上' : '下'}激发`
      : `已知 B 与切割运动 v，请伸右手使四指指向正确的感应电流方向`,
  };
}
