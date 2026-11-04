import * as THREE from 'three';
import {
  anodizedAluminum,
  dialTexture,
  labGlow,
  letterTexture,
  polishedGold,
  paintTexture,
} from './labKit.ts';
import { disposeObjectTree } from './disposeObject.ts';
import {
  AxialChargeFlow,
  brushedCopper,
  createContactCollar,
  createConductorRodGeometry,
  createGuideShaftGeometry,
  terminalBrass,
} from './conductorRod.ts';
import { ArticulatedHandSkeletonMesh } from './ArticulatedHandSkeletonMesh.ts';
import { FloatingConductorMesh, createPrecisionRodGeometry } from './FloatingConductorMesh.ts';
import type {
  HandRuleConfig,
  HandRuleEvaluation,
  HandRuleMode,
  Polarity,
} from '../../physics/em/handRulesSolver.ts';
import type { HandGestureFrame } from '../../vision/types.ts';

/**
 * 创建带真实机械圆角与倒角的工业级实体几何体（严禁无倒角简单 BoxGeometry）
 */
function createChamferedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius = 0.008,
  bevel = 0.002
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.001, Math.min(radius, width * 0.4, depth * 0.4));
  const w = width * 0.5 - rx;
  const d = depth * 0.5 - rx;

  shape.moveTo(-w, -d - rx);
  shape.lineTo(w, -d - rx);
  shape.quadraticCurveTo(w + rx, -d - rx, w + rx, -d);
  shape.lineTo(w + rx, d);
  shape.quadraticCurveTo(w + rx, d + rx, w, d + rx);
  shape.lineTo(-w, d + rx);
  shape.quadraticCurveTo(-w - rx, d + rx, -w - rx, d);
  shape.lineTo(-w - rx, -d);
  shape.quadraticCurveTo(-w - rx, -d - rx, -w, -d - rx);

  const bSize = Math.min(rx * 0.6, bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.001, height - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height * 0.5, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建一体车削成型的高精度 3D 方向箭头几何体（沿 +Y 轴指向，起点在 y = -length/2，尖端在 y = +length/2）
 */
function createSculptedArrowGeometry(
  length = 0.12,
  shaftRadius = 0.0042,
  headRadius = 0.012,
  headLength = 0.032
): THREE.BufferGeometry {
  const half = length * 0.5;
  const neckY = half - headLength;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -half),
    new THREE.Vector2(shaftRadius * 1.35, -half + 0.003),
    new THREE.Vector2(shaftRadius, -half + 0.008),
    new THREE.Vector2(shaftRadius, neckY),
    new THREE.Vector2(headRadius, neckY),
    new THREE.Vector2(0.0, half),
  ];
  const geo = new THREE.LatheGeometry(profile, 24);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建与右手螺旋法则直导线完全相同的精密矢量指示箭头几何体（标准圆柱杆 + 圆锥头，沿 +Y 轴，中心在原点）
 */
function createScrewStyleArrowGeometry(
  shaftLength = 0.026,
  shaftRadius = 0.0020,
  headLength = 0.016,
  headRadius = 0.0055
): THREE.BufferGeometry {
  const half = (shaftLength + headLength) * 0.5;
  const neckY = half - headLength;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, -half),
    new THREE.Vector2(shaftRadius, -half),
    new THREE.Vector2(shaftRadius, neckY),
    new THREE.Vector2(headRadius, neckY),
    new THREE.Vector2(0, half),
  ];
  const geo = new THREE.LatheGeometry(profile, 24);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建防振调平底座脚垫（沿 Y 轴）
 */
function createIsolationFootGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.022, 0.0),
    new THREE.Vector2(0.020, 0.006),
    new THREE.Vector2(0.014, 0.010),
    new THREE.Vector2(0.014, 0.018),
    new THREE.Vector2(0.0, 0.018),
  ];
  const geo = new THREE.LatheGeometry(profile, 24);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建正对操作者 (+Z) 的激光蚀刻毫米标尺纹理
 */
function createFrontScaleTexture(): THREE.CanvasTexture {
  return paintTexture(1024, 96, (ctx, w, h) => {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(2, 2, w - 4, h - 4);
    }

    const totalTicks = 40;
    for (let i = 0; i <= totalTicks; i++) {
      const x = 32 + ((w - 64) * i) / totalTicks;
      const isMajor = i % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(x, h - 6);
      ctx.lineTo(x, isMajor ? 22 : 46);
      ctx.strokeStyle = isMajor ? '#1e293b' : '#475569';
      ctx.lineWidth = isMajor ? 2.5 : 1.5;
      ctx.stroke();

      if (isMajor && typeof ctx.fillText === 'function') {
        const mmVal = (i - 20) * 10;
        ctx.fillStyle = mmVal === 0 ? '#0284c7' : '#334155';
        ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "SF Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${mmVal > 0 ? '+' : ''}${mmVal}`, x, 4);
      }
    }
  });
}

/**
 * 生成正对操作者的清晰 "速度 v" 标识纹理（与右手螺旋法则同款规格与排版）
 */
function createVelocityLabelTexture(): THREE.CanvasTexture {
  return paintTexture(512, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    if (typeof ctx.fillText !== 'function') return;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const cy = h * 0.5;

    // 白色高对比度衬底微光描边，确保在任何 3D 背景及视角下均清晰无眩光
    if (typeof ctx.strokeText === 'function') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 12;
      ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.strokeText('速度', 36, cy);
      ctx.font = 'italic 900 112px "Times New Roman", STSong, Georgia, serif';
      ctx.strokeText('v', 246, cy - 3);
    }

    // 紫晶速度主题色
    ctx.fillStyle = '#9333ea';
    ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('速度', 36, cy);

    ctx.font = 'italic 900 112px "Times New Roman", STSong, Georgia, serif';
    ctx.fillText('v', 246, cy - 3);
  });
}

/**
 * 生成正对操作者的清晰红底白边 "电流 I" 激光蚀刻与 HUD 铭牌纹理（与右手螺旋法则保持完全一致）
 */
function createInducedCurrentLabelTexture(): THREE.CanvasTexture {
  return paintTexture(512, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    if (typeof ctx.fillText !== 'function') return;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const cy = h * 0.5;

    // 白色高对比度衬底微光描边，确保在任何 3D 背景及视角下均清晰无眩光
    if (typeof ctx.strokeText === 'function') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 12;
      ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.strokeText('电流', 36, cy);
      ctx.font = 'italic 900 112px "Times New Roman", STSong, Georgia, serif';
      ctx.strokeText('I', 246, cy - 3);
    }

    // 鲜红饱和主题色（与右手螺旋法则电流保持完全一致）
    ctx.fillStyle = '#dc2626';
    ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('电流', 36, cy);

    ctx.font = 'italic 900 112px "Times New Roman", STSong, Georgia, serif';
    ctx.fillText('I', 246, cy - 3);
  });
}

/**
 * 生成正对操作者的清晰 "安培力 F" 标识纹理
 */
function createAmpereForceLabelTexture(): THREE.CanvasTexture {
  return paintTexture(512, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    if (typeof ctx.fillText !== 'function') return;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const cy = h * 0.5;

    // 白色高对比度衬底微光描边，确保在任何 3D 背景及视角下均清晰无眩光
    if (typeof ctx.strokeText === 'function') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 12;
      ctx.font = '900 82px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.strokeText('安培力', 28, cy);
      ctx.font = 'italic 900 110px "Times New Roman", STSong, Georgia, serif';
      ctx.strokeText('F', 286, cy - 3);
    }

    // 翠绿饱和主题色
    ctx.fillStyle = '#059669';
    ctx.font = '900 82px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('安培力', 28, cy);

    ctx.font = 'italic 900 110px "Times New Roman", STSong, Georgia, serif';
    ctx.fillText('F', 286, cy - 3);
  });
}

/**
 * 生成正对操作者的清晰 "磁场 B" 标识纹理
 */
function createFieldBLabelTexture(): THREE.CanvasTexture {
  return paintTexture(512, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    if (typeof ctx.fillText !== 'function') return;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const cy = h * 0.5;

    if (typeof ctx.strokeText === 'function') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 12;
      ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.strokeText('磁场', 36, cy);
      ctx.font = 'italic 900 112px "Times New Roman", STSong, Georgia, serif';
      ctx.strokeText('B', 246, cy - 3);
    }

    // 冰海青主题色
    ctx.fillStyle = '#0284c7';
    ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('磁场', 36, cy);

    ctx.font = 'italic 900 112px "Times New Roman", STSong, Georgia, serif';
    ctx.fillText('B', 246, cy - 3);
  });
}

/**
 * 生成穿入平面的标准磁场 2D 符号 ⊗ (Into the screen)
 */
function createFieldInwardTexture(): THREE.CanvasTexture {
  return paintTexture(256, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    const center = w * 0.5;
    const radius = w * 0.38;

    if (typeof ctx.beginPath === 'function') {
      // 柔和外发光底衬
      if (typeof ctx.createRadialGradient === 'function' && typeof ctx.arc === 'function') {
        const grad = ctx.createRadialGradient(center, center, radius * 0.5, center, center, radius * 1.15);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(center, center, radius * 1.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // 外层冰海青发光圆环
      if (typeof ctx.arc === 'function') {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 内部高亮十字叉 "×"
      const arm = radius * 0.54;
      if (typeof ctx.moveTo === 'function' && typeof ctx.lineTo === 'function') {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(center - arm, center - arm);
        ctx.lineTo(center + arm, center + arm);
        ctx.moveTo(center + arm, center - arm);
        ctx.lineTo(center - arm, center + arm);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    }
  });
}

/**
 * 生成穿出平面的标准磁场 2D 符号 ⊙ (Out of the screen)
 */
function createFieldOutwardTexture(): THREE.CanvasTexture {
  return paintTexture(256, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    const center = w * 0.5;
    const radius = w * 0.38;

    if (typeof ctx.beginPath === 'function' && typeof ctx.arc === 'function') {
      // 柔和外发光底衬
      if (typeof ctx.createRadialGradient === 'function') {
        const grad = ctx.createRadialGradient(center, center, radius * 0.5, center, center, radius * 1.15);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(center, center, radius * 1.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // 外层冰海青发光圆环
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 中心实心高亮圆点 "·"
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.42, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * 动态磁通波纹环纹理
 */
function createFieldRippleTexture(): THREE.CanvasTexture {
  return paintTexture(256, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    const center = w * 0.5;
    const radius = w * 0.40;

    if (typeof ctx.beginPath === 'function' && typeof ctx.arc === 'function') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

const _UP = new THREE.Vector3(0, 1, 0);
const _QUAT = new THREE.Quaternion();

interface LeftFieldSymbol {
  group: THREE.Group;
  mesh: THREE.Mesh;
  ripple: THREE.Mesh;
  ripple2?: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  rippleMat: THREE.MeshBasicMaterial;
  ripple2Mat?: THREE.MeshBasicMaterial;
  bx: number;
  by: number;
  basePhase: number;
}

interface FlowingStreamlinePacket {
  group: THREE.Group;
  orbMesh: THREE.Mesh;
  trailMesh: THREE.Mesh;
  trailMat: THREE.MeshBasicMaterial;
  orbMat: THREE.MeshBasicMaterial;
  bx: number;
  by: number;
  offsetPhase: number;
}

/**
 * 电磁学手势定则（右手螺旋法则、左手定则、右手定则）纯 3D 导体与磁场实验台
 * 严格遵循零弹窗、纯导体/磁场实体建模、发光目标感应区与方向箭头引导规范
 */
export class HandRulesBenchMesh {
  public readonly group = new THREE.Group();
  public readonly handSkeleton: ArticulatedHandSkeletonMesh;

  // 定则独立 3D 机械总成
  private get screwGroup(): THREE.Group { return this.floatingConductor.group; }
  private readonly leftRuleGroup = new THREE.Group();
  private readonly rightRuleGroup = new THREE.Group();

  // 导体周围发光目标引导区域
  private readonly targetZoneGroup = new THREE.Group();
  private targetRingMat!: THREE.MeshStandardMaterial;
  private targetInnerDiscMat!: THREE.MeshStandardMaterial;

  public readonly floatingConductor = new FloatingConductorMesh();
  private readonly isolationBase = new THREE.Group();

  // 2. 左手定则组件：与右手螺旋法则同款纯净独立导体棒、动态流光 2D 符号匀强磁场与安培力指示
  private leftRodGroup = new THREE.Group();
  private leftCurrentArrow!: THREE.Group;
  private leftCurrentLabel!: THREE.Mesh;
  private leftCurrentMat!: THREE.MeshStandardMaterial;
  private leftForceArrow!: THREE.Group;
  private leftForceLabel!: THREE.Mesh;
  private leftForceMat!: THREE.MeshStandardMaterial;
  private leftForceLabelMat!: THREE.MeshBasicMaterial;
  private leftForceRevealProgress = 0;
  private leftFieldGroup!: THREE.Group;
  private leftFieldSymbols: LeftFieldSymbol[] = [];
  private leftFieldPackets: FlowingStreamlinePacket[] = [];
  private leftFieldFlowPhase = 0;
  private leftFieldPhotonPhase = 0;
  private leftFieldGuideMat!: THREE.MeshStandardMaterial;
  private leftFieldLabel!: THREE.Mesh;
  private leftCurrent!: AxialChargeFlow;
  private leftRodVelocity = 0;
  private readonly texFieldIn = createFieldInwardTexture();
  private readonly texFieldOut = createFieldOutwardTexture();
  private readonly texFieldRipple = createFieldRippleTexture();

  // 3. 右手定则组件：严格遵循极简纯净物理台面规范，只保留运动导体棒与矢量指示
  private rightRodGroup = new THREE.Group();
  private rightMotionArrow!: THREE.Group;
  private rightMotionLabel!: THREE.Mesh;
  private rightInducedArrow!: THREE.Group;
  private rightInducedMat!: THREE.MeshStandardMaterial;
  private rightInducedLabelMat!: THREE.MeshBasicMaterial;
  private rightInducedLabel!: THREE.Mesh;
  private rightCurrent!: AxialChargeFlow;
  private rightCutPhase = 0;

  // 共用高规格实验室材质
  private readonly satinSilverMat = anodizedAluminum(0xf1f5f9, 0.22);
  private readonly brushedSlateMat = anodizedAluminum(0xcbd5e1, 0.28);
  private readonly liquidChromeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.96,
    roughness: 0.08,
  });
  private readonly champagneBrassMat = polishedGold(0xc4cbd4); // 银灰钛金五金，杜绝亮黄
  private readonly knownCurrentMat = labGlow(0xf59e0b, 0.68); // 琥珀金：已知电流 I
  private readonly knownFieldMat = labGlow(0x38bdf8, 0.62);   // 冰海青：已知磁场 B
  private readonly knownMotionMat = new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    emissive: 0x9333ea,
    emissiveIntensity: 0.85,
    roughness: 0.22,
    metalness: 0.15,
  });
  private readonly texN = letterTexture('N', '#fecaca');
  private readonly texS = letterTexture('S', '#bfdbfe');

  private animClock = 0;

  constructor() {
    this.group.name = 'HandRulesBenchMesh';

    this.buildIsolationBase();
    this.buildTargetGuidanceZone();
    this.buildRightHandScrewApparatus();
    this.buildLeftHandRuleApparatus();
    this.buildRightHandRuleApparatus();

    this.handSkeleton = new ArticulatedHandSkeletonMesh();
    this.group.add(this.handSkeleton.group);

    this.setMode('right-hand-screw');
  }

  /**
   * 1. 构建航天级喷砂银铝减振实验底座与正前方 (+Z) 激光蚀刻标尺
   */
  private buildIsolationBase(): void {
    const baseGroup = this.isolationBase;

    // 主承载台板（倒角铝板）
    const deckGeo = createChamferedBoxGeometry(0.62, 0.028, 0.38, 0.018, 0.003);
    const deckMesh = new THREE.Mesh(deckGeo, this.satinSilverMat);
    deckMesh.position.y = 0.018;
    deckMesh.receiveShadow = true;
    deckMesh.castShadow = true;
    baseGroup.add(deckMesh);

    // 上层精密内嵌绝缘平台
    const upperPadGeo = createChamferedBoxGeometry(0.54, 0.010, 0.30, 0.012, 0.0018);
    const upperPadMesh = new THREE.Mesh(upperPadGeo, this.brushedSlateMat);
    upperPadMesh.position.y = 0.044;
    upperPadMesh.receiveShadow = true;
    baseGroup.add(upperPadMesh);

    // 四角精密黄铜套环调平防振脚垫
    const footGeo = createIsolationFootGeometry();
    const footCoords: Array<[number, number]> = [
      [-0.26, -0.14],
      [0.26, -0.14],
      [-0.26, 0.14],
      [0.26, 0.14],
    ];
    for (const [fx, fz] of footCoords) {
      const foot = new THREE.Mesh(footGeo, this.brushedSlateMat);
      foot.position.set(fx, 0, fz);
      const brassRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.016, 0.002, 12, 24),
        this.champagneBrassMat
      );
      brassRing.rotation.x = Math.PI / 2;
      brassRing.position.set(fx, 0.009, fz);
      baseGroup.add(foot, brassRing);
    }

    // 正对操作者 (+Z) 的高精度激光蚀刻毫米刻度条
    const scalePlateGeo = createChamferedBoxGeometry(0.46, 0.014, 0.008, 0.002, 0.001);
    const scaleBezel = new THREE.Mesh(scalePlateGeo, this.champagneBrassMat);
    scaleBezel.position.set(0, 0.024, 0.191);
    baseGroup.add(scaleBezel);

    const scaleFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.011),
      new THREE.MeshBasicMaterial({ map: createFrontScaleTexture() })
    );
    scaleFace.position.set(0, 0.031, 0.196);
    baseGroup.add(scaleFace);

    baseGroup.visible = false;
    this.group.add(baseGroup);
  }

  /**
   * 2. 构建导体周围的发光目标感应区域（引导手部骨骼靠近并摆出定则手势）
   */
  private buildTargetGuidanceZone(): void {
    this.targetZoneGroup.visible = false;
    this.targetRingMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      metalness: 0.3,
      roughness: 0.2,
      transparent: true,
      opacity: 0.78,
    });

    this.targetInnerDiscMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 外层精密双道发光感应环
    const outerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.0024, 16, 64),
      this.targetRingMat
    );
    const innerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.0014, 12, 48),
      this.targetRingMat
    );
    const discHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.025, 0.112, 48),
      this.targetInnerDiscMat
    );

    // 四个象限的精密倒角定位游标结节
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.0045, 16, 12),
        this.targetRingMat
      );
      node.position.set(Math.cos(angle) * 0.115, Math.sin(angle) * 0.115, 0);
      this.targetZoneGroup.add(node);
    }

    this.targetZoneGroup.add(outerHalo, innerHalo, discHalo);
    this.targetZoneGroup.position.set(0, 0.23, 0);
    this.group.add(this.targetZoneGroup);
  }

  private buildRightHandScrewApparatus(): void {
    this.group.add(this.floatingConductor.group);
  }

  /**
   * 构建「左手定则（通电导体在磁场中受安培力）」3D 独立装置总成
   * 严格遵循物理台面规范：与右手螺旋法则完全相同的纯净独立导体棒（无额外导轨与立柱），搭配动态流光匀强磁场
   */
  private buildLeftHandRuleApparatus(): void {
    this.leftRuleGroup.name = 'LeftHandRuleApparatus';

    // 1) 竖直航天银铝运动导体棒（与右手螺旋法则完全相同的精密模型：全长 0.38m，半径 0.0092m，两端车削黄铜端子与端盖）
    const rodRadius = 0.0092;
    const rodLength = 0.38;
    const half = rodLength * 0.5;

    const shankGeo = createPrecisionRodGeometry(rodLength, rodRadius);
    const vRodMesh = new THREE.Mesh(shankGeo, this.satinSilverMat);
    vRodMesh.castShadow = true;
    vRodMesh.receiveShadow = true;
    vRodMesh.name = 'LeftConductorRod';
    this.leftRodGroup.add(vRodMesh);

    // 导体棒两端精密车削黄铜接线端子与端盖（与右手螺旋法则完全相同）
    for (const sign of [-1, 1] as const) {
      const cap = new THREE.Group();
      cap.position.y = sign * (half - 0.006);
      if (sign < 0) cap.rotation.x = Math.PI;

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(rodRadius * 1.05, rodRadius * 1.05, 0.010, 32),
        this.champagneBrassMat
      );
      collar.castShadow = true;

      const endCap = new THREE.Mesh(
        new THREE.CylinderGeometry(rodRadius * 0.88, rodRadius * 1.02, 0.004, 32),
        this.satinSilverMat
      );
      endCap.position.y = 0.007;
      endCap.castShadow = true;

      cap.add(collar, endCap);
      this.leftRodGroup.add(cap);
    }

    // 导体内电荷流动模拟通道（沿直导线 Y 轴，与右手螺旋法则完全相同）
    this.leftCurrent = new AxialChargeFlow({ travel: 0.32, axis: 'y', radial: 0.0098, speed: 0.32 });
    this.leftCurrent.bed.visible = false;
    this.leftCurrent.setFlowVisible(true);
    this.leftRodGroup.add(this.leftCurrent.group);

    // 2) 矢量指示系统
    const arrowGeo = createScrewStyleArrowGeometry(0.026, 0.0020, 0.016, 0.0055);

    // 电流方向矢量指示箭头 I
    this.leftCurrentMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.85,
      metalness: 0.15,
      roughness: 0.22,
      opacity: 1.0,
    });
    this.leftCurrentArrow = new THREE.Group();
    this.leftCurrentArrow.name = 'LeftCurrentArrow';
    const iArrowMesh = new THREE.Mesh(arrowGeo, this.leftCurrentMat);
    iArrowMesh.castShadow = true;
    this.leftCurrentArrow.add(iArrowMesh);
    this.leftRodGroup.add(this.leftCurrentArrow);

    // 独立 3D "电流 I" 标识看板
    const iTex = createInducedCurrentLabelTexture();
    const iLabelMat = new THREE.MeshBasicMaterial({
      map: iTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 1.0,
    });
    this.leftCurrentLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.029), iLabelMat);
    this.leftCurrentLabel.position.set(-0.052, 0.065, rodRadius + 0.0035);
    this.leftRodGroup.add(this.leftCurrentLabel);

    // 安培力矢量指示箭头 F（初始隐藏，仅当手势正确时浮现）
    this.leftForceMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.85,
      metalness: 0.15,
      roughness: 0.22,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.leftForceArrow = new THREE.Group();
    this.leftForceArrow.name = 'AmpereForceArrow';
    this.leftForceArrow.visible = false;
    this.leftForceArrow.scale.set(0, 0, 0);
    const fArrowMesh = new THREE.Mesh(arrowGeo, this.leftForceMat);
    fArrowMesh.castShadow = true;
    this.leftForceArrow.add(fArrowMesh);
    this.leftRodGroup.add(this.leftForceArrow);

    // 独立 3D "安培力 F" 标识看板（初始隐藏）
    const fTex = createAmpereForceLabelTexture();
    this.leftForceLabelMat = new THREE.MeshBasicMaterial({
      map: fTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.leftForceLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.029), this.leftForceLabelMat);
    this.leftForceLabel.position.set(0.052, 0.028, rodRadius + 0.0035);
    this.leftForceLabel.visible = false;
    this.leftForceLabel.scale.set(0, 0, 0);
    this.leftRodGroup.add(this.leftForceLabel);

    this.leftRodGroup.name = 'LeftConductorRodAssembly';
    this.leftRodGroup.position.set(0, 0.22, 0);
    this.leftRuleGroup.add(this.leftRodGroup);

    // 3) 匀强磁场 B 规范 2D 符号阵列（拒绝 3D 锥体箭头，严格使用教科书 2D 符号与动态能量流）
    this.buildDynamicMagneticField();

    this.group.add(this.leftRuleGroup);
  }

  /**
   * 构建左手定则规范 2D 磁场符号阵列与动态空间光量子流光束（彻底消除 3D 锥体/飞镖箭头）
   * 12 组正对操作者视线的标准磁场符号（穿入 ⊗ / 穿出 ⊙），伴随微光起伏能量波、双相位收缩/扩散波纹，
   * 以及沿着 Z 轴在磁感线通道中顺滑穿梭的高能光子彗星流光，呈现灵动绚丽的高级实验室微观物理流动
   */
  private buildDynamicMagneticField(): void {
    this.leftFieldGroup = new THREE.Group();
    this.leftFieldGroup.name = 'LeftFieldIndicators';

    // 独立 3D "磁场 B" 标识看板
    const bTex = createFieldBLabelTexture();
    const bLabelMat = new THREE.MeshBasicMaterial({
      map: bTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 1.0,
    });
    this.leftFieldLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.029), bLabelMat);
    this.leftFieldLabel.position.set(0, 0.35, 0.02);
    this.leftRuleGroup.add(this.leftFieldLabel);

    // 12 个对称排布在两翼的磁场符号网格点位 (bx, by)
    const symbolCoords: Array<[number, number]> = [
      [-0.18, 0.11], [-0.10, 0.11], [0.10, 0.11], [0.18, 0.11],
      [-0.18, 0.22], [-0.10, 0.22], [0.10, 0.22], [0.18, 0.22],
      [-0.18, 0.33], [-0.10, 0.33], [0.10, 0.33], [0.18, 0.33],
    ];

    const planeGeo = new THREE.PlaneGeometry(0.048, 0.048);
    const rippleGeo = new THREE.PlaneGeometry(0.048, 0.048);
    const guideGeo = new THREE.CylinderGeometry(0.00035, 0.00035, 0.30, 8);
    const orbGeo = new THREE.SphereGeometry(0.0028, 14, 10);
    const trailGeo = new THREE.CylinderGeometry(0.0004, 0.0024, 0.042, 8);

    this.leftFieldSymbols = [];
    this.leftFieldPackets = [];

    for (let i = 0; i < symbolCoords.length; i++) {
      const [bx, by] = symbolCoords[i];

      // 1) 沿 Z 轴的极细微光磁力线导向束（绝非粗大箭头，呈现精密微光丝质感）
      const guideMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      });
      const guideMesh = new THREE.Mesh(guideGeo, guideMat);
      guideMesh.rotation.x = Math.PI / 2;
      guideMesh.position.set(bx, by, 0);
      this.leftFieldGroup.add(guideMesh);

      // 2) 2D 规范磁场符号看板（正对操作者，包含多重动态向内/向外收缩扩散环）
      const symbolGroup = new THREE.Group();
      symbolGroup.position.set(bx, by, -0.005);

      // 双重多相位动态波纹层
      const rippleMat = new THREE.MeshBasicMaterial({
        map: this.texFieldRipple,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0.35,
      });
      const rippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
      symbolGroup.add(rippleMesh);

      const ripple2Mat = new THREE.MeshBasicMaterial({
        map: this.texFieldRipple,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0.25,
      });
      const ripple2Mesh = new THREE.Mesh(rippleGeo, ripple2Mat);
      symbolGroup.add(ripple2Mesh);

      // 主符号层（初始为穿入符号 ⊗）
      const mat = new THREE.MeshBasicMaterial({
        map: this.texFieldIn,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0.90,
      });
      const mesh = new THREE.Mesh(planeGeo, mat);
      symbolGroup.add(mesh);

      this.leftFieldGroup.add(symbolGroup);
      this.leftFieldSymbols.push({
        group: symbolGroup,
        mesh,
        ripple: rippleMesh,
        ripple2: ripple2Mesh,
        mat,
        rippleMat,
        ripple2Mat,
        bx,
        by,
        basePhase: i / symbolCoords.length,
      });

      // 3) 沿 Z 轴动态穿行的微型高能光子流光能量包（每个通道 2 组交替穿梭）
      for (let p = 0; p < 2; p++) {
        const packetGroup = new THREE.Group();
        packetGroup.position.set(bx, by, 0);

        const orbMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        const orbMesh = new THREE.Mesh(orbGeo, orbMat);

        const trailMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        });
        const trailMesh = new THREE.Mesh(trailGeo, trailMat);
        trailMesh.rotation.x = Math.PI / 2;

        packetGroup.add(orbMesh, trailMesh);
        this.leftFieldGroup.add(packetGroup);

        this.leftFieldPackets.push({
          group: packetGroup,
          orbMesh,
          trailMesh,
          orbMat,
          trailMat,
          bx,
          by,
          offsetPhase: p * 0.5,
        });
      }
    }

    this.leftRuleGroup.add(this.leftFieldGroup);
  }

  /**
   * 2. 构建「右手定则（电磁感应切割磁感线）」独立导体棒总成
   * 严格遵循极简纯净物理台面规范：只保留导体棒，删除所有磁极板、底座、看板与额外器材
   */
  private buildRightHandRuleApparatus(): void {
    this.rightRuleGroup.name = 'RightHandRuleApparatus';

    // 竖直航天银铝运动导体棒（右手螺旋法则同款精密模型：全长 0.38m，半径 0.0092m，两端车削黄铜端子与端盖）
    const rodRadius = 0.0092;
    const rodLength = 0.38;
    const half = rodLength * 0.5;

    // 恒定高质感喷砂银铝中央导电金属长棒
    const shankGeo = createPrecisionRodGeometry(rodLength, rodRadius);
    const vRodMesh = new THREE.Mesh(shankGeo, this.satinSilverMat);
    vRodMesh.castShadow = true;
    vRodMesh.receiveShadow = true;
    vRodMesh.name = 'RightConductorRod';
    this.rightRodGroup.add(vRodMesh);

    // 两端精密车削黄铜接线端子与端盖（右手螺旋法则同款端子）
    for (const sign of [-1, 1] as const) {
      const cap = new THREE.Group();
      cap.position.y = sign * (half - 0.006);
      if (sign < 0) cap.rotation.x = Math.PI;

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(rodRadius * 1.05, rodRadius * 1.05, 0.010, 32),
        this.champagneBrassMat
      );
      collar.castShadow = true;

      const endCap = new THREE.Mesh(
        new THREE.CylinderGeometry(rodRadius * 0.88, rodRadius * 1.02, 0.004, 32),
        this.satinSilverMat
      );
      endCap.position.y = 0.007;
      endCap.castShadow = true;

      cap.add(collar, endCap);
      this.rightRodGroup.add(cap);
    }

    // 导体内电荷流动模拟通道（沿直导线 Y 轴，无暗色观察镜片色偏）
    this.rightCurrent = new AxialChargeFlow({ travel: 0.32, axis: 'y', radial: 0.0098, speed: 0.32 });
    this.rightCurrent.bed.visible = false;
    this.rightCurrent.setFlowVisible(false);
    this.rightRodGroup.add(this.rightCurrent.group);

    // 3) 速度与电流矢量指示系统（与右手螺旋法则使用完全相同的箭头几何造型与文字标识规格）
    const arrowGeo = createScrewStyleArrowGeometry(0.026, 0.0020, 0.016, 0.0055);

    // 切割运动速度方向 v 的发光矢量箭头
    this.rightMotionArrow = new THREE.Group();
    this.rightMotionArrow.name = 'VelocityDirectionArrow';

    const vArrowMesh = new THREE.Mesh(arrowGeo, this.knownMotionMat);
    vArrowMesh.castShadow = true;
    this.rightMotionArrow.add(vArrowMesh);
    this.rightRodGroup.add(this.rightMotionArrow);

    // 独立 3D "速度 v" 标识看板（与右手螺旋法则同款规格：512x256，高对比白边描边，PlaneGeometry 0.058x0.029）
    const vTex = createVelocityLabelTexture();
    const vLabelMat = new THREE.MeshBasicMaterial({
      map: vTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.rightMotionLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.029), vLabelMat);
    this.rightMotionLabel.position.set(0.052, 0.028, rodRadius + 0.0035);
    this.rightRodGroup.add(this.rightMotionLabel);

    // 所求的电流方向高精度矢量箭头 I（与右手螺旋法则保持完全一致的鲜艳红箭造型与材质）
    this.rightInducedMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.85,
      metalness: 0.15,
      roughness: 0.22,
      opacity: 1.0,
    });
    this.rightInducedArrow = new THREE.Group();
    this.rightInducedArrow.name = 'InducedCurrentArrow';

    const indArrowMesh = new THREE.Mesh(arrowGeo, this.rightInducedMat);
    indArrowMesh.castShadow = true;
    this.rightInducedArrow.add(indArrowMesh);
    this.rightRodGroup.add(this.rightInducedArrow);

    // 独立 3D "电流 I" 标识看板（与右手螺旋法则同款红底白边，PlaneGeometry 0.058x0.029）
    const indTex = createInducedCurrentLabelTexture();
    this.rightInducedLabelMat = new THREE.MeshBasicMaterial({
      map: indTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 1.0,
    });
    this.rightInducedLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.029), this.rightInducedLabelMat);
    this.rightInducedLabel.position.set(-0.052, 0.065, rodRadius + 0.0035);
    this.rightRodGroup.add(this.rightInducedLabel);

    this.rightRodGroup.name = 'RightConductorRodAssembly';
    this.rightRodGroup.position.set(-0.12, 0.22, 0);
    this.rightRuleGroup.add(this.rightRodGroup);

    this.group.add(this.rightRuleGroup);
  }

  public setMode(mode: HandRuleMode): void {
    this.screwGroup.visible = mode === 'right-hand-screw';
    this.leftRuleGroup.visible = mode === 'left-hand-rule';
    this.rightRuleGroup.visible = mode === 'right-hand-rule';

    this.isolationBase.visible = false;
    this.targetZoneGroup.visible = false;
    this.floatingConductor.reset();

    if (mode === 'right-hand-screw') {
      this.targetZoneGroup.position.set(0, 0.30, 0);
    } else if (mode === 'left-hand-rule') {
      this.targetZoneGroup.position.set(0, 0.22, 0);
      this.targetZoneGroup.rotation.set(0, 0, 0);
      this.leftRodVelocity = 0;
      this.leftForceRevealProgress = 0;
      this.leftFieldFlowPhase = 0;
      this.leftFieldPhotonPhase = 0;
      if (this.leftForceMat) this.leftForceMat.opacity = 0;
      if (this.leftForceLabelMat) this.leftForceLabelMat.opacity = 0;
      if (this.leftForceArrow) {
        this.leftForceArrow.visible = false;
        this.leftForceArrow.scale.set(0, 0, 0);
      }
      if (this.leftForceLabel) {
        this.leftForceLabel.visible = false;
        this.leftForceLabel.scale.set(0, 0, 0);
      }
      this.leftRodGroup.position.x = 0;
    } else {
      this.targetZoneGroup.position.set(0, 0.22, 0);
      this.targetZoneGroup.rotation.set(0, 0, 0);
      this.rightCutPhase = 0;
    }
  }

  public resetMotion(): void {
    this.leftRodVelocity = 0;
    this.leftForceRevealProgress = 0;
    this.leftFieldFlowPhase = 0;
    this.leftFieldPhotonPhase = 0;
    if (this.leftForceMat) this.leftForceMat.opacity = 0;
    if (this.leftForceLabelMat) this.leftForceLabelMat.opacity = 0;
    if (this.leftForceArrow) {
      this.leftForceArrow.visible = false;
      this.leftForceArrow.scale.set(0, 0, 0);
    }
    if (this.leftForceLabel) {
      this.leftForceLabel.visible = false;
      this.leftForceLabel.scale.set(0, 0, 0);
    }
    this.leftRodGroup.position.x = 0;
    this.rightCutPhase = 0;
    this.floatingConductor.reset();
  }

  /**
   * 每帧更新实验台三维物理动画、方向箭头与手部骨骼
   */
  public update(
    delta: number,
    config: HandRuleConfig,
    evaluation: HandRuleEvaluation,
    frame: HandGestureFrame | null
  ): void {
    const dt = Math.max(0.001, Math.min(0.05, delta));
    this.animClock += dt;

    // 1. 更新 3D 素雅手部骨骼
    this.handSkeleton.update(dt, frame, evaluation);

    // 2. 更新导体周围的发光目标感应区域颜色与呼吸脉动
    const pulse = 0.5 + 0.5 * Math.sin(this.animClock * 4.2);
    const scalePulse = 1.0 + 0.035 * Math.sin(this.animClock * 3.2);
    this.targetZoneGroup.scale.set(scalePulse, scalePulse, 1);

    if (evaluation.status === 'wrong-hand') {
      this.targetRingMat.color.setHex(0xfbbf24);
      this.targetRingMat.emissive.setHex(0xf59e0b);
      this.targetRingMat.emissiveIntensity = 0.65 + pulse * 0.25;
      this.targetInnerDiscMat.color.setHex(0xf59e0b);
      this.targetInnerDiscMat.opacity = 0.22;
    } else if (evaluation.isMatched) {
      this.targetRingMat.color.setHex(0x34d399);
      this.targetRingMat.emissive.setHex(0x10b981);
      this.targetRingMat.emissiveIntensity = 0.78 + pulse * 0.22;
      this.targetInnerDiscMat.color.setHex(0x34d399);
      this.targetInnerDiscMat.opacity = 0.24;
    } else {
      this.targetRingMat.color.setHex(0x38bdf8);
      this.targetRingMat.emissive.setHex(0x0284c7);
      this.targetRingMat.emissiveIntensity = 0.45 + evaluation.alignmentScore * 0.35 + pulse * 0.15;
      this.targetInnerDiscMat.color.setHex(0x38bdf8);
      this.targetInnerDiscMat.opacity = 0.12 + evaluation.alignmentScore * 0.1;
    }

    // 3. 更新当前激活定则的 3D 物理组件
    if (config.mode === 'right-hand-screw') {
      this.updateRightHandScrew(dt, config.currentPolarity, evaluation);
      const rod = this.floatingConductor.assembly.position;
      this.handSkeleton.group.position.set(rod.x, rod.y - 0.30, rod.z);
    } else if (config.mode === 'left-hand-rule') {
      this.handSkeleton.group.position.set(0, 0, 0);
      this.updateLeftHandRule(dt, config, evaluation);
    } else {
      this.handSkeleton.group.position.set(0, 0, 0);
      this.updateRightHandRule(dt, config, evaluation);
    }
  }

  private updateRightHandScrew(
    dt: number,
    currentPolarity: Polarity,
    evaluation: HandRuleEvaluation
  ): void {
    this.floatingConductor.update(dt, currentPolarity, evaluation);
  }

  private updateLeftHandRule(
    dt: number,
    config: HandRuleConfig,
    evaluation: HandRuleEvaluation
  ): void {
    const iy = config.currentPolarity;
    const bz = -config.fieldPolarity;
    const fx = (iy * bz) as Polarity;

    // 1) 匀强磁场 B (沿 Z 轴穿入 -Z 对应 ⊗，穿出 +Z 对应 ⊙)，采用规范 2D 符号与动态能量流动
    const isEntering = bz < 0; // -Z 穿入屏幕 (⊗)，+Z 穿出屏幕 (⊙)
    const targetMap = isEntering ? this.texFieldIn : this.texFieldOut;

    if (this.leftFieldLabel) {
      this.leftFieldLabel.position.set(0, 0.35, 0.02);
    }

    // 动态波纹与能量流光推进
    const flowSpeed = 2.4;
    this.leftFieldFlowPhase = (this.leftFieldFlowPhase + dt * flowSpeed) % (Math.PI * 2);

    for (const sym of this.leftFieldSymbols) {
      if (sym.mat.map !== targetMap) {
        sym.mat.map = targetMap;
        sym.mat.needsUpdate = true;
      }

      // 空间能量流光扫掠波：各节点起伏呼吸流动
      const wave = 0.5 + 0.5 * Math.sin(this.leftFieldFlowPhase + sym.bx * 14 + sym.by * 10);
      sym.mat.opacity = 0.65 + 0.35 * wave;

      // 磁通汇入/涌出动态波纹：穿入时向内收缩流动（汇入漩涡），穿出时向外扩散流动（向外涌现）
      const p1 = (this.leftFieldFlowPhase / (Math.PI * 2) + sym.basePhase) % 1.0;
      const p2 = (p1 + 0.5) % 1.0;

      const scale1 = isEntering ? (1.35 - p1 * 0.90) : (0.42 + p1 * 0.90);
      const scale2 = isEntering ? (1.35 - p2 * 0.90) : (0.42 + p2 * 0.90);
      sym.ripple.scale.set(scale1, scale1, 1);
      sym.rippleMat.opacity = Math.sin(p1 * Math.PI) * 0.55 * wave;

      if (sym.ripple2 && sym.ripple2Mat) {
        sym.ripple2.scale.set(scale2, scale2, 1);
        sym.ripple2Mat.opacity = Math.sin(p2 * Math.PI) * 0.40 * wave;
      }
    }

    // 空间高能光子流光沿 Z 轴动态穿梭（流速 ~0.42 m/s，全程无 3D 箭头，纯粹纯净的光量子流动）
    const zSpan = 0.30;
    const halfSpan = zSpan * 0.5;
    const photonSpeed = 0.42;
    this.leftFieldPhotonPhase = (this.leftFieldPhotonPhase + dt * (photonSpeed / zSpan)) % 1.0;

    for (const pkt of this.leftFieldPackets) {
      const u = (this.leftFieldPhotonPhase + pkt.offsetPhase + (pkt.bx + 0.2) * 1.5 + (pkt.by - 0.1) * 2.0) % 1.0;
      const normalizedU = (u + 1.0) % 1.0;

      // 沿 Z 轴平滑连续位移：穿入为 +Z 到 -Z，穿出为 -Z 到 +Z
      const zPos = isEntering
        ? (halfSpan - normalizedU * zSpan)
        : (-halfSpan + normalizedU * zSpan);

      pkt.orbMesh.position.set(0, 0, zPos);

      // 彗星拖尾位于光子身后，且拖尾方向跟随流动方向
      const trailOffset = isEntering ? 0.021 : -0.021;
      pkt.trailMesh.position.set(0, 0, zPos + trailOffset);
      pkt.trailMesh.rotation.x = isEntering ? (Math.PI / 2) : (-Math.PI / 2);

      // 两端进出平滑渐隐渐现，杜绝突兀闪烁 (sin(normalizedU * PI) 形成完美的平滑钟形渐变曲线)
      const fade = Math.sin(normalizedU * Math.PI);
      const wave = 0.5 + 0.5 * Math.sin(this.leftFieldFlowPhase + pkt.bx * 14 + pkt.by * 10);

      pkt.orbMat.opacity = Math.max(0, fade * 0.95 * (0.75 + 0.25 * wave));
      pkt.trailMat.opacity = Math.max(0, fade * 0.58 * (0.75 + 0.25 * wave));
    }

    // 2) 电流方向 I (沿导线棒 +Y 向上 或 -Y 向下)
    _QUAT.setFromUnitVectors(_UP, new THREE.Vector3(0, iy, 0));
    this.leftCurrentArrow.quaternion.copy(_QUAT);
    this.leftCurrentArrow.position.set(-fx * 0.018, iy * 0.065, 0.0092 + 0.0025);

    if (this.leftCurrentLabel) {
      this.leftCurrentLabel.position.set(-fx * 0.052, iy * 0.065, 0.0092 + 0.0035);
    }
    this.leftCurrent.update(dt, iy);

    // 3) 安培力方向 F (沿导轨水平 +X 向右 或 -X 向左)
    _QUAT.setFromUnitVectors(_UP, new THREE.Vector3(fx, 0, 0));
    this.leftForceArrow.quaternion.copy(_QUAT);
    this.leftForceArrow.position.set(fx * 0.042, 0, 0.0092 + 0.0025);

    if (this.leftForceLabel) {
      this.leftForceLabel.position.set(fx * 0.052, 0.028, 0.0092 + 0.0035);
    }

    // 力的揭示与导体棒运动共用手势判定，失配后立即停止演示并隐藏待求方向。
    const isCorrect = evaluation.isMatched;
    const reveal = isCorrect ? 1 : 0;
    const ease = 1 - Math.exp(-dt * 9);
    if (!isCorrect) {
      this.leftForceRevealProgress = 0;
      this.leftForceMat.opacity = 0;
    }
    this.leftForceRevealProgress += (reveal - this.leftForceRevealProgress) * (1 - Math.exp(-dt * 7));
    this.leftForceMat.opacity += (reveal * 1.0 - this.leftForceMat.opacity) * ease;
    this.leftForceLabelMat.opacity = this.leftForceMat.opacity;

    const visible = isCorrect && this.leftForceMat.opacity > 0.005;
    this.leftForceArrow.visible = visible;
    this.leftForceLabel.visible = visible;

    const fScale = THREE.MathUtils.lerp(
      0.18,
      1,
      THREE.MathUtils.smoothstep(this.leftForceRevealProgress, 0, 1)
    );
    this.leftForceArrow.scale.set(fScale, fScale, fScale);
    this.leftForceLabel.scale.set(fScale, fScale, fScale);

    const targetEmissive = isCorrect ? 1.35 : 0.85;
    this.leftForceMat.emissiveIntensity +=
      (targetEmissive - this.leftForceMat.emissiveIntensity) * Math.min(1, dt * 8);

    // 4) 正确手势持续时循环演示；失配时冻结运动状态，恢复后从同一位置和运动阶段继续。
    if (!isCorrect) return;
    const strokeLimit = 0.12;
    const acceleration = 0.22;
    // 沿 F 建立有向坐标，保证电流或磁场反转后运动镜像一致。
    const position = this.leftRodGroup.position.x * fx;
    const velocity = this.leftRodVelocity * fx;
    let nextPosition = position + velocity * dt + 0.5 * acceleration * dt * dt;
    let nextVelocity = velocity + acceleration * dt;
    if (nextPosition > strokeLimit) {
      // 展示边界作理想弹性回弹；按实际碰撞时刻积分余下时间，避免帧率导致能量漂移。
      // 回程速度与 F 相反，仍受同向 F 减速，随后再次沿 F 加速，形成连续循环。
      const distance = Math.max(0, strokeLimit - position);
      const impactVelocity = Math.sqrt(velocity * velocity + 2 * acceleration * distance);
      const impactTime = (impactVelocity - velocity) / acceleration;
      const remainingTime = THREE.MathUtils.clamp(dt - impactTime, 0, dt);
      nextPosition = strokeLimit - impactVelocity * remainingTime + 0.5 * acceleration * remainingTime * remainingTime;
      nextVelocity = -impactVelocity + acceleration * remainingTime;
    }
    this.leftRodGroup.position.x = nextPosition * fx;
    this.leftRodVelocity = nextVelocity * fx;
  }

  private updateRightHandRule(
    dt: number,
    config: HandRuleConfig,
    evaluation: HandRuleEvaluation
  ): void {
    // 1) 导体棒在台面中心平稳重复运动 (切割行程在 -0.12m 与 +0.12m 之间)
    const vx = config.motionPolarity;
    // 速度矢量指示箭头：精密指向切割运动方向 (+X 或 -X)
    _QUAT.setFromUnitVectors(_UP, new THREE.Vector3(vx, 0, 0));
    this.rightMotionArrow.quaternion.copy(_QUAT);
    this.rightMotionArrow.position.set(vx * 0.042, 0, 0.0092 + 0.0025);

    // 速度 3D 文字标签位置动态定位，文字本身永远保持端正水平面向操作者
    if (this.rightMotionLabel) {
      this.rightMotionLabel.position.set(vx * 0.052, 0.028, 0.0092 + 0.0035);
    }

    const strokeStart = vx > 0 ? -0.12 : 0.12;
    const strokeEnd = vx > 0 ? 0.12 : -0.12;
    const strokeLen = strokeEnd - strokeStart;

    // 周期 2.4 秒：前 82% 时间稳定匀速切割，后 18% 平滑余弦快速回位，循环重复
    this.rightCutPhase = (this.rightCutPhase + dt / 2.4) % 1;
    let u: number;
    if (this.rightCutPhase < 0.82) {
      u = this.rightCutPhase / 0.82;
    } else {
      const r = (this.rightCutPhase - 0.82) / 0.18;
      u = 0.5 + 0.5 * Math.cos(r * Math.PI);
    }
    this.rightRodGroup.position.x = strokeStart + u * strokeLen;

    // 2) 电流方向矢量箭头 I (+Y 向上 或 -Y 向下)
    const indY = (config.motionPolarity * config.fieldPolarity) as Polarity;
    _QUAT.setFromUnitVectors(_UP, new THREE.Vector3(0, indY, 0));
    this.rightInducedArrow.quaternion.copy(_QUAT);
    this.rightInducedArrow.position.set(-vx * 0.018, indY * 0.065, 0.0092 + 0.0025);

    // 独立 3D "电流 I" 标识看板：随电流方向在 Y 轴自适应平移，并与速度标识错开 X 轴，永不重叠
    if (this.rightInducedLabel) {
      this.rightInducedLabel.position.set(-vx * 0.052, indY * 0.065, 0.0092 + 0.0035);
    }

    const isCorrect = evaluation.isMatched;
    const targetEmissive = isCorrect ? 1.35 : 0.85;
    this.rightInducedMat.emissiveIntensity +=
      (targetEmissive - this.rightInducedMat.emissiveIntensity) * Math.min(1, dt * 8);
    this.rightInducedMat.opacity = 1.0;
    this.rightInducedLabelMat.opacity = 1.0;
    this.rightCurrent.setFlowVisible(true);
    this.rightCurrent.update(dt, indY);
  }

  public dispose(): void {
    this.handSkeleton.dispose();
    this.floatingConductor.dispose();
    this.texFieldIn.dispose();
    this.texFieldOut.dispose();
    this.texFieldRipple.dispose();
    this.texN.dispose();
    this.texS.dispose();
    disposeObjectTree(this.group);
  }
}
