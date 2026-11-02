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

const _UP = new THREE.Vector3(0, 1, 0);
const _QUAT = new THREE.Quaternion();

/**
 * 电磁学手势定则（右手螺旋法则、右手定则）纯 3D 导体与磁铁实验台
 * 严格遵循零弹窗、纯导体/磁铁实体建模、发光目标感应区与方向箭头引导规范
 */
export class HandRulesBenchMesh {
  public readonly group = new THREE.Group();
  public readonly handSkeleton: ArticulatedHandSkeletonMesh;

  // 定则独立 3D 机械总成
  private get screwGroup(): THREE.Group { return this.floatingConductor.group; }
  private readonly rightRuleGroup = new THREE.Group();

  // 导体周围发光目标引导区域
  private readonly targetZoneGroup = new THREE.Group();
  private targetRingMat!: THREE.MeshStandardMaterial;
  private targetInnerDiscMat!: THREE.MeshStandardMaterial;

  public readonly floatingConductor = new FloatingConductorMesh();
  private readonly isolationBase = new THREE.Group();

  // 2. 右手定则组件：严格遵循极简纯净物理台面规范，只保留运动导体棒与矢量指示
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

    // 所求的电流方向高精度矢量箭头 I（与右手螺旋法则保持完全一致的红箭造型与材质）
    this.rightInducedMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.85,
      metalness: 0.15,
      roughness: 0.22,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
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
      opacity: 0.15,
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
    this.rightRuleGroup.visible = mode === 'right-hand-rule';

    this.isolationBase.visible = false;
    this.targetZoneGroup.visible = false;
    this.floatingConductor.reset();

    if (mode === 'right-hand-screw') {
      this.targetZoneGroup.position.set(0, 0.30, 0);
    } else {
      this.targetZoneGroup.position.set(0, 0.22, 0);
      this.targetZoneGroup.rotation.set(0, 0, 0);
      this.rightCutPhase = 0;
    }
  }

  public resetMotion(): void {
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
      this.handSkeleton.group.position.set(rod.x, rod.y - 0.25, rod.z);
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
    const targetIndOpacity = isCorrect
      ? 0.96
      : 0.15 + evaluation.alignmentScore * 0.45;
    this.rightInducedMat.opacity += (targetIndOpacity - this.rightInducedMat.opacity) * Math.min(1, dt * 8);
    this.rightInducedLabelMat.opacity = this.rightInducedMat.opacity;
    this.rightCurrent.setFlowVisible(isCorrect && this.rightInducedMat.opacity > 0.3);
    if (isCorrect) {
      this.rightCurrent.update(dt, indY);
    }
  }

  public dispose(): void {
    this.handSkeleton.dispose();
    this.floatingConductor.dispose();
    this.texN.dispose();
    this.texS.dispose();
    disposeObjectTree(this.group);
  }
}
