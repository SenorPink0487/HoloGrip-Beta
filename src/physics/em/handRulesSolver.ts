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
  /** 判定使用的原始帧槽位，确保 3D 骨骼与判定使用同一只手。 */
  sourceHand: 'leftHand' | 'rightHand' | null;
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
  // 缺失的骨骼方向不能伪装成向上，否则坏帧也会触发竖直电流。
  if (len < 1e-8) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function lengthVec3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const FINGER_JOINTS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]] as const;

export function hasFiniteHandLandmarks(lms: NormalizedLandmark[]): boolean {
  return Array.isArray(lms) && lms.length >= 21 &&
    Array.from({ length: 21 }, (_, i) => lms[i]).every(point => point &&
      Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
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

interface FingerKinematics {
  direction: Vec3;
  straightness: number;
  extensionRatio: number;
  curlRatio: number;
}

/** 从骨节链提取姿态；所有距离相对于掌宽/掌长归一化，不依赖手在画面中的位置和远近。 */
export function extractHandKinematics(
  landmarks: NormalizedLandmark[],
  handedness: 'left' | 'right' = 'right'
): {
  thumbDir: Vec3;
  fourFingersDir: Vec3;
  palmNormal: Vec3;
  palmRadialDir: Vec3;
  thumbSpreadRatio: number;
  fingerCurlRatio: number;
  avgExtension: number;
  thumbStraightness: number;
  thumbExtensionRatio: number;
  thumbMcpToTip: Vec3;
  palmScale: number;
  fingers: FingerKinematics[];
} {
  const pts = landmarks.slice(0, 21).map(landmarkToMirroredWorld);
  const longitudinal = subtractVec3(pts[9], pts[0]);
  const lateral = subtractVec3(pts[5], pts[17]);
  const palmScale = Math.max(1e-8, lengthVec3(longitudinal), lengthVec3(lateral));
  const thumbFromIp = subtractVec3(pts[4], pts[3]);
  const thumbMcpToTip = subtractVec3(pts[4], pts[2]);
  const thumbDir = normalizeVec3({
    x: thumbFromIp.x * 0.65 + thumbMcpToTip.x * 0.35,
    y: thumbFromIp.y * 0.65 + thumbMcpToTip.y * 0.35,
    z: thumbFromIp.z * 0.65 + thumbMcpToTip.z * 0.35,
  });
  const thumbPath = lengthVec3(subtractVec3(pts[3], pts[2])) + lengthVec3(thumbFromIp);
  const thumbStraightness = lengthVec3(thumbMcpToTip) / Math.max(1e-8, thumbPath);

  const fingers = FINGER_JOINTS.map(([mcp, pip, dip, tip]): FingerKinematics => {
    const direct = subtractVec3(pts[tip], pts[mcp]);
    const path = lengthVec3(subtractVec3(pts[pip], pts[mcp])) +
      lengthVec3(subtractVec3(pts[dip], pts[pip])) + lengthVec3(subtractVec3(pts[tip], pts[dip]));
    const straightness = lengthVec3(direct) / Math.max(1e-8, path);
    return {
      direction: normalizeVec3(direct),
      straightness,
      extensionRatio: lengthVec3(direct) / palmScale,
      curlRatio: clamp01((0.88 - straightness) / 0.40),
    };
  });
  const fourFingersDir = normalizeVec3(fingers.reduce((sum, finger) => ({
    x: sum.x + finger.direction.x,
    y: sum.y + finger.direction.y,
    z: sum.z + finger.direction.z,
  }), { x: 0, y: 0, z: 0 }));

  // 掌心外法向：右手为桡侧轴 × 纵轴，左手反之。不能强制翻转至朝向相机。
  const palmNormal = normalizeVec3(handedness === 'right'
    ? crossVec3(lateral, longitudinal) : crossVec3(longitudinal, lateral));
  const palmRadialDir = normalizeVec3(lateral);
  return {
    thumbDir,
    fourFingersDir,
    palmNormal,
    palmRadialDir,
    thumbSpreadRatio: dotVec3(subtractVec3(pts[4], pts[5]), palmRadialDir) / palmScale,
    fingerCurlRatio: fingers.reduce((sum, finger) => sum + finger.curlRatio, 0) / 4,
    avgExtension: fingers.reduce((sum, finger) => sum + finger.extensionRatio, 0) / 4,
    thumbStraightness,
    thumbExtensionRatio: lengthVec3(thumbMcpToTip) / palmScale,
    thumbMcpToTip,
    palmScale,
    fingers,
  };
}

/**
 * 构造模拟手势关键点（用于桌面无摄像头直接点击操作或自动化测试验证）
 */
export function buildSyntheticHandLandmarks(options: {
  thumbDirWorld: { x: number; y: number; z?: number };
  fingersDirWorld: { x: number; y: number; z?: number };
  curled?: boolean;
  handedness?: 'left' | 'right';
}): NormalizedLandmark[] {
  const thumb = normalizeVec3({ ...options.thumbDirWorld, z: options.thumbDirWorld.z ?? 0 });
  const fingers = normalizeVec3({ ...options.fingersDirWorld, z: options.fingersDirWorld.z ?? 0 });
  const thumbAlongFingers = dotVec3(thumb, fingers);
  let lateral = normalizeVec3({
    x: thumb.x - fingers.x * thumbAlongFingers,
    y: thumb.y - fingers.y * thumbAlongFingers,
    z: thumb.z - fingers.z * thumbAlongFingers,
  });
  if (lengthVec3(lateral) < 0.5) {
    lateral = normalizeVec3(crossVec3(fingers, Math.abs(fingers.z) < 0.9
      ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }));
  }
  const normal = options.handedness === 'left'
    ? crossVec3(lateral, fingers) : crossVec3(fingers, lateral);
  const world: Vec3[] = Array.from({ length: 21 }, () => ({ x: 0, y: -0.08, z: 0 }));
  const offset = (base: Vec3, direction: Vec3, distance: number): Vec3 => ({
    x: base.x + direction.x * distance, y: base.y + direction.y * distance, z: base.z + direction.z * distance,
  });
  world[1] = offset(world[0], lateral, 0.035);
  world[2] = offset(offset(world[0], lateral, 0.06), fingers, 0.025);
  world[3] = offset(world[2], thumb, 0.04);
  world[4] = offset(world[2], thumb, 0.09);
  for (const [index, [mcp, pip, dip, tip]] of FINGER_JOINTS.entries()) {
    world[mcp] = offset(offset(world[0], fingers, 0.10), lateral, 0.06 - index * 0.04);
    if (options.curled) {
      // 保持真实骨长，通过关节屈曲握拳；不能把共线手指简单缩短冒充弯曲。
      world[pip] = offset(world[mcp], fingers, 0.05);
      world[dip] = offset(world[pip], normal, 0.035);
      world[tip] = offset(world[dip], fingers, -0.035);
    } else {
      world[pip] = offset(world[mcp], fingers, 0.04);
      world[dip] = offset(world[mcp], fingers, 0.075);
      world[tip] = offset(world[mcp], fingers, 0.11);
    }
  }
  return world.map(point => ({ x: 0.5 - point.x, y: 0.5 - point.y, z: -point.z }));
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
    return {
      requiredHand: 'left',
      knownCurrentDir: { x: 0, y: iy, z: 0 },
      knownFieldDir: { x: 0, y: 0, z: bz },
      knownMotionDir: null,
      targetVectorDir: crossVec3({ x: 0, y: iy, z: 0 }, { x: 0, y: 0, z: bz }), // F = Iℓ × B
      screwCirculationSign: 1,
    };
  }

  // 右手定则：已知磁场 B 沿前后方向 (0, 0, -fieldPolarity) 穿入掌心，导体切割速度 v 沿水平导轨 (motionPolarity, 0, 0)
  // 感应电流方向 I_ind = v × B = (vx, 0, 0) × (0, 0, bz) = (0, -vx * bz, 0) = (0, motionPolarity * fieldPolarity, 0)
  const bz = -config.fieldPolarity;
  const vx = config.motionPolarity;
  return {
    requiredHand: 'right',
    knownCurrentDir: null,
    knownFieldDir: { x: 0, y: 0, z: bz },
    knownMotionDir: { x: vx, y: 0, z: 0 },
    targetVectorDir: crossVec3({ x: vx, y: 0, z: 0 }, { x: 0, y: 0, z: bz }), // 正电荷方向 v × B
    screwCirculationSign: 1,
  };
}

/** 拒绝缺点、非有限坐标、零长指骨及退化掌面；不得给坏帧补造默认方向。 */
function isUsableHand(hand: SingleHandData | null, mode: HandRuleMode): hand is SingleHandData {
  const minConfidence = mode === 'left-hand-rule' ? 0.5 : 0.8;
  if (!hand || !Number.isFinite(hand.confidence) || hand.confidence < minConfidence ||
    !hasFiniteHandLandmarks(hand.landmarks)) return false;
  const pts = hand.landmarks;
  const longitudinal = subtractVec3(pts[9], pts[0]);
  const lateral = subtractVec3(pts[5], pts[17]);
  const palmScale = Math.max(lengthVec3(longitudinal), lengthVec3(lateral));
  if (palmScale < 1e-5 || lengthVec3(crossVec3(lateral, longitudinal)) < palmScale * palmScale * 0.15) return false;
  // 左手开掌由掌面与各指实际伸展程度验证，不用固定指骨最短长度拒绝侧视或自遮挡的自然手掌。
  if (mode === 'left-hand-rule') return true;
  const chains: readonly (readonly number[])[] = [[1, 2, 3, 4], ...FINGER_JOINTS];
  return chains.every(chain => chain.slice(1).every((joint, index) =>
    lengthVec3(subtractVec3(pts[joint], pts[chain[index]])) > palmScale * 0.015));
}

/**
 * 由当前手势的完整几何关系判定定则，不将匹配分数当作物理量大小。
 * 螺旋定则仅接受右手，手型只校验拇指朝向；左手：F = Iℓ × B；感应右手：正电荷沿 v × B。
 * 后两者还必须满足磁场穿入掌心、四指伸直并拢、拇指外展且近似垂直于四指。
 * 物理方向依据：https://openstax.org/books/university-physics-volume-2/pages/13-3-motional-emf
 */
export function evaluateHandRuleFrame(
  config: HandRuleConfig,
  frame: HandGestureFrame | null
): HandRuleEvaluation {
  const vectors = computeRuleVectors(config);
  const { requiredHand, knownFieldDir, targetVectorDir } = vectors;
  const handName = requiredHand === 'left' ? '左手' : '右手';
  const idle: HandRuleEvaluation = {
    ...vectors,
    mode: config.mode,
    detectedHand: null,
    sourceHand: null,
    status: 'idle',
    alignmentScore: 0,
    isMatched: false,
    thumbDir: null,
    fourFingersDir: null,
    fingerCurlRatio: 0,
    statusLabel: !config.gestureEnabled ? '手势交互未开启'
      : config.mode === 'right-hand-screw' ? `请将右手大拇指沿电流${targetVectorDir.y > 0 ? '向上' : '向下'}`
      : `请伸出${handName}进行定则比划`,
  };
  if (!config.gestureEnabled || !frame?.hasHand) return idle;

  if (config.mode === 'right-hand-screw') {
    // 先确认右手；手型仅使用拇指 MCP(2) → TIP(4) 的朝向，不要求掌面或四指姿态。
    // 25° 容差允许自然手抖；零长或缺失的拇指方向仍返回 idle，不补造默认向量。
    const sources = ['rightHand', 'leftHand'] as const;
    const candidates = sources.flatMap(sourceHand => {
      const hand = frame[sourceHand];
      const mcp = hand?.landmarks?.[2];
      const tip = hand?.landmarks?.[4];
      if (!hand || !mcp || !tip || ![mcp.x, mcp.y, mcp.z, tip.x, tip.y, tip.z].every(Number.isFinite)) return [];
      const direction = subtractVec3(landmarkToMirroredWorld(tip), landmarkToMirroredWorld(mcp));
      if (lengthVec3(direction) < 1e-6) return [];
      const thumbDir = normalizeVec3(direction);
      return [{ hand, sourceHand, thumbDir, dot: dotVec3(thumbDir, targetVectorDir) }];
    });
    // 两只手同时可见时也只使用右手，左手不能替右手完成方向匹配。
    const selected = candidates.find(candidate => candidate.hand.handedness === 'right') ?? candidates[0];
    if (!selected) return { ...idle, statusLabel: '请将右手大拇指完整移入镜头视野' };
    const isRightHand = selected.hand.handedness === 'right';
    const isMatched = isRightHand && selected.dot >= Math.cos(25 * Math.PI / 180);
    return {
      ...idle,
      detectedHand: selected.hand.handedness,
      sourceHand: selected.sourceHand,
      thumbDir: selected.thumbDir,
      alignmentScore: isRightHand ? clamp01(selected.dot) : 0,
      isMatched,
      status: !isRightHand ? 'wrong-hand' : isMatched ? 'matched' : 'adjusting',
      statusLabel: !isRightHand ? '当前为左手，请换用右手，大拇指沿电流方向'
        : isMatched ? '右手拇指朝向匹配成功：环绕磁场 B 已点亮'
        : `请将右手大拇指沿电流${targetVectorDir.y > 0 ? '向上' : '向下'}，避免横指、反向或指向镜头`,
    };
  }

  const sourceHands = requiredHand === 'left' ? ['leftHand', 'rightHand'] as const : ['rightHand', 'leftHand'] as const;
  const candidates = sourceHands.flatMap(sourceHand => {
    const hand = frame[sourceHand];
    return isUsableHand(hand, config.mode)
      ? [{ hand, sourceHand, detectedHand: hand.handedness }]
      : [];
  });
  const selected = candidates.find(candidate => candidate.detectedHand === requiredHand) ?? candidates[0];
  if (!selected) return { ...idle, statusLabel: '手部关键点不完整或置信度不足，请将整只手移入镜头视野' };
  const { hand, detectedHand } = selected;
  const kin = extractHandKinematics(hand.landmarks, detectedHand);
  const measured = {
    ...idle,
    detectedHand,
    sourceHand: selected.sourceHand,
    thumbDir: kin.thumbDir,
    fourFingersDir: kin.fourFingersDir,
    fingerCurlRatio: kin.fingerCurlRatio,
  };
  if (detectedHand !== requiredHand) {
    return { ...measured, status: 'wrong-hand', statusLabel: `当前为${detectedHand === 'left' ? '左手' : '右手'}，请换用${handName}` };
  }

  const isLeftRule = config.mode === 'left-hand-rule';
  const minDirectionDot = isLeftRule ? 0.75 : 0.8;
  // 左手定则以掌骨的拇指侧轴表达受力方向，并检查拇指向外张开。
  // 自然张开的拇指末节常斜向上，不能把末节必须水平、四指必须贴紧作为额外物理条件。
  const thumbExtended = isLeftRule
    ? kin.thumbStraightness >= 0.8 && kin.thumbExtensionRatio >= 0.25 && kin.thumbSpreadRatio >= 0.18
    : kin.thumbStraightness >= 0.9 && kin.thumbExtensionRatio >= 0.35;
  const thumbTarget = config.mode === 'left-hand-rule' ? targetVectorDir : vectors.knownMotionDir!;
  const fingersTarget = config.mode === 'left-hand-rule' ? vectors.knownCurrentDir! : targetVectorDir;
  const thumbDot = dotVec3(isLeftRule ? kin.palmRadialDir : kin.thumbDir, thumbTarget);
  const fingersDot = Math.min(...kin.fingers.map(finger => dotVec3(finger.direction, fingersTarget)));
  // 掌心外法向与 B 反向，才能表达“磁感线穿入掌心”。
  const fieldEnteringPalm = -dotVec3(kin.palmNormal, knownFieldDir!);
  const perpendicular = Math.abs(dotVec3(kin.thumbDir, kin.fourFingersDir));
  const allExtended = kin.fingers.every(finger =>
    finger.straightness >= (isLeftRule ? 0.85 : 0.9) && finger.extensionRatio >= (isLeftRule ? 0.35 : 0.45));
  const fingerCoherence = Math.min(...kin.fingers.map(finger => dotVec3(finger.direction, kin.fourFingersDir)));
  const fingersTogether = isLeftRule || fingerCoherence >= 0.94;
  const crossAlignment = config.mode === 'left-hand-rule'
    ? dotVec3(normalizeVec3(crossVec3(kin.fourFingersDir, knownFieldDir!)), kin.palmRadialDir)
    : dotVec3(normalizeVec3(crossVec3(kin.thumbDir, knownFieldDir!)), kin.fourFingersDir);
  const isMatched = thumbExtended && allExtended && fingersTogether && thumbDot >= minDirectionDot && fingersDot >= minDirectionDot &&
    fieldEnteringPalm >= (isLeftRule ? 0.65 : minDirectionDot) && (isLeftRule || perpendicular <= 0.35) && crossAlignment >= minDirectionDot;
  const alignmentScore = Math.min(clamp01(thumbDot), clamp01(fingersDot), clamp01(fieldEnteringPalm),
    clamp01(crossAlignment), isLeftRule ? clamp01(kin.thumbSpreadRatio / 0.35) : clamp01(1 - perpendicular), thumbExtended ? 1 : 0.2,
    allExtended ? 1 : 0.2, clamp01(fingerCoherence));
  let statusLabel: string;
  if (isMatched) {
    statusLabel = config.mode === 'left-hand-rule'
      ? `左手定则判定正确：安培力 F 指向${targetVectorDir.x > 0 ? '右' : '左'}`
      : `右手定则判定正确：感应电动势的正方向沿导体向${targetVectorDir.y > 0 ? '上' : '下'}（闭合回路中为约定电流方向）`;
  } else if (!allExtended || !fingersTogether) {
    statusLabel = isLeftRule ? '请将左手四指沿电流方向自然伸直' : `请平展${handName}，四根手指全部伸直并拢`;
  } else if (!thumbExtended || (!isLeftRule && perpendicular > 0.35)) {
    statusLabel = isLeftRule ? '请将左手拇指向手掌外侧张开，避免扣在掌心' : '请伸直并张开大拇指，使大拇指与四指近似垂直';
  } else if (fieldEnteringPalm < (isLeftRule ? 0.65 : minDirectionDot)) {
    statusLabel = '请翻转或调整手掌，使磁感线穿入掌心，而非穿入手背';
  } else if (thumbDot < minDirectionDot) {
    statusLabel = isLeftRule
      ? '请转动左手，使四指沿电流方向、磁场穿入掌心，并向侧面张开拇指'
      : `请使大拇指指向导体运动 v 方向（${thumbTarget.x > 0 ? '向右' : '向左'}）`;
  } else {
    statusLabel = `请使四指沿${config.mode === 'left-hand-rule' ? '约定电流 I' : '感应电动势正方向'}${fingersTarget.y > 0 ? '向上' : '向下'}，并保持磁场穿入掌心`;
  }
  return { ...measured, status: isMatched ? 'matched' : 'adjusting', isMatched, alignmentScore, statusLabel };
}
