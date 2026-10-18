import * as THREE from 'three';
import {
  labMetal,
  labGlow,
  anodizedAluminum,
  polishedGold,
  paintTexture,
} from './labKit.ts';
import { disposeObjectTree } from './disposeObject.ts';
import type { SwitchPosition, CapacitorTelemetry, WaveformSample } from '../../physics/em/capacitorDischarge.ts';

export interface CapacitorDischargeBenchMeshOptions {
  voltageSupply?: number;
  capacitanceUf?: number;
  resistanceOhm?: number;
  showLabels?: boolean;
}

/**
 * 真实物理实验室：圆锥宝塔螺旋压缩弹簧参数曲线
 */
class ConicalSpringCurve extends THREE.Curve<THREE.Vector3> {
  private rBase: number;
  private rTop: number;
  private length: number;
  private turns: number;

  constructor(
    rBase: number,
    rTop: number,
    length: number,
    turns: number
  ) {
    super();
    this.rBase = rBase;
    this.rTop = rTop;
    this.length = length;
    this.turns = turns;
  }
  override getPoint(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const r = this.rBase + (this.rTop - this.rBase) * t;
    const phi = t * Math.PI * 2 * this.turns;
    const x = t * this.length;
    const y = Math.sin(phi) * r;
    const z = Math.cos(phi) * r;
    return optionalTarget.set(x, y, z);
  }
}

/**
 * 经典力学与电磁学实验室：电容器充放电与RC暂态电路实验台
 * 纯物理实验器材真实高精度 3D 建模，杜绝虚假数显底座与教学文字标牌
 */
export class CapacitorDischargeBenchMesh {
  public group: THREE.Group;

  // 可交互 3D 目标（用于射线检测拾取与点击）
  public switchKnifeMesh!: THREE.Mesh;
  public switchLeftContactMesh!: THREE.Mesh;
  public switchRightContactMesh!: THREE.Mesh;
  public switchHandleMesh!: THREE.Mesh;
  public powerKnobMesh!: THREE.Mesh;
  public powerSwitchMesh!: THREE.Mesh;
  public batteryPackGroup!: THREE.Group;

  // 单刀双掷开关动触刀组件（围绕铰链轴平滑旋转）
  private switchLeverGroup!: THREE.Group;
  private currentBladeAngle = 0; // 弧度
  private targetBladeAngle = 0;

  // 动态数显纹理与画布（仅保留电流测量仪器的真实表头与电池高精标签）
  private batteryLabelTexture?: THREE.CanvasTexture;
  private powerDisplayTexture?: THREE.CanvasTexture;
  private powerDisplayCanvas?: HTMLCanvasElement;
  private sensorDisplayTexture!: THREE.CanvasTexture;
  private sensorDisplayCanvas!: HTMLCanvasElement;

  // 电容器静电场物理光晕（随端电压平滑增强，纯物理微光，无文字）
  private capFieldHaloMesh!: THREE.Mesh;
  private capFieldHaloMaterial!: THREE.MeshStandardMaterial;

  // 传感器采样指示灯
  private sensorLedMaterial!: THREE.MeshStandardMaterial;

  // 桌面台式数字存储示波器
  public scopeScreenMesh!: THREE.Mesh;
  public scopeChassisMesh!: THREE.Mesh;
  public scopeClearBtnMesh!: THREE.Mesh;
  public scopeRunBtnMesh!: THREE.Mesh;
  private scopeDisplayTexture!: THREE.CanvasTexture;
  private scopeDisplayCanvas!: HTMLCanvasElement;
  private scopeLastSampleCount = -1;
  private scopeLastCurrent = -99999;
  private scopeLastPos: SwitchPosition = 'neutral';

  // 导线粒子流动态系统
  private chargeParticles!: THREE.Points;
  private dischargeParticles!: THREE.Points;
  private chargeParticleGeometry!: THREE.BufferGeometry;
  private dischargeParticleGeometry!: THREE.BufferGeometry;
  private chargeWireSplines: THREE.CatmullRomCurve3[] = [];
  private dischargeWireSplines: THREE.CatmullRomCurve3[] = [];
  private chargeParticleProgress: Float32Array = new Float32Array(0);
  private dischargeParticleProgress: Float32Array = new Float32Array(0);

  // 标牌组（已清空所有文字标签）
  private labelsGroup: THREE.Group = new THREE.Group();
  private showLabels = false;

  // 触点瞬态火花点光源
  private sparkLight!: THREE.PointLight;
  private sparkTimer = 0;

  // 状态缓存（降低无谓的纹理重绘）
  private lastRenderedCurrent = -99999;
  private lastRenderedSupply = -99999;
  private lastSwitchPos: SwitchPosition = 'neutral';
  private pulsePhase = 0;

  constructor(options: CapacitorDischargeBenchMeshOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'CapacitorDischargeBenchMesh';
    this.showLabels = options.showLabels ?? false;

    this.buildBaseboard();
    this.buildPowerSupply(options.voltageSupply ?? 10.0);
    this.buildSpdtSwitch();
    this.buildCapacitor(options.capacitanceUf ?? 1000.0);
    this.buildResistor(options.resistanceOhm ?? 1000.0);
    this.buildCurrentSensor();
    this.buildOscilloscope();
    this.buildWiresAndParticles();
    this.buildLabels();

    // 默认掷向中立断开档位
    this.setSwitchPosition('neutral', true);
  }

  // ================= 1. 真实物理实验工作台底板 (无任何文字标签) =================
  private buildBaseboard(): void {
    // 实验室高强度防静电绝缘操作底台（微倒角平整台面，原点严格对称居中）
    const baseWidth = 0.96;
    const baseHeight = 0.022;
    const baseDepth = 0.52;

    const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, baseDepth);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.12,
      roughness: 0.35,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, baseHeight * 0.5, 0);
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // 四角减震防滑硅胶底脚
    const footGeo = new THREE.CylinderGeometry(0.018, 0.020, 0.012, 16);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
    const footOffsets = [
      [-baseWidth * 0.45, 0.006, -baseDepth * 0.44],
      [baseWidth * 0.45, 0.006, -baseDepth * 0.44],
      [-baseWidth * 0.45, 0.006, baseDepth * 0.44],
      [baseWidth * 0.45, 0.006, baseDepth * 0.44],
    ];
    for (const [fx, fy, fz] of footOffsets) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, fy, fz);
      this.group.add(foot);
    }
  }

  /**
   * 绘制 1024x512 超高分辨率工业级高能碱性电池（黑金工业配色）真实包装贴图
   */
  private createBatteryLabelTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    const w = 1024;
    const h = 512;
    const goldWidth = w * 0.32;

    // 1. 哑光高聚物深曜石黑底
    ctx.fillStyle = '#090a0f';
    ctx.fillRect(0, 0, w, h);

    // 2. 正极端拉丝高光金属金色渐变区
    const goldGrad = ctx.createLinearGradient(0, 0, goldWidth, 0);
    goldGrad.addColorStop(0, '#ca8a04');
    goldGrad.addColorStop(0.25, '#eab308');
    goldGrad.addColorStop(0.55, '#fef08a');
    goldGrad.addColorStop(0.85, '#ca8a04');
    goldGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, 0, goldWidth, h);

    // 金黑交界处立体光反边线
    ctx.fillStyle = '#fde047';
    ctx.fillRect(goldWidth - 4, 0, 2, h);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(goldWidth - 2, 0, 2, h);

    // 金属横向拉丝发丝纹
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, goldWidth, 1.5);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let y = 0; y < h; y += 6) {
      ctx.fillRect(goldWidth, y, w - goldWidth, 1.5);
    }

    // 3. 正极端醒目标记 (在金色区)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(goldWidth * 0.45, h * 0.28, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', goldWidth * 0.45, h * 0.28 - 2);

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 38px "Arial Black", Impact, sans-serif';
    ctx.fillText('ALKALINE', goldWidth * 0.45, h * 0.58);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('1.5V · SIZE D', goldWidth * 0.45, h * 0.74);

    // 4. 黑色工业主体文字与标牌
    const bodyX = goldWidth + 35;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'italic 900 46px "Arial Black", sans-serif';
    ctx.fillText('HoloGrip', bodyX, h * 0.25);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 22px monospace';
    ctx.fillText('LABORATORY STANDARD', bodyX + 225, h * 0.25);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('SUPER HEAVY DUTY LR20 CELL', bodyX, h * 0.42);

    // 能量刻度指示槽
    const barW = 380;
    const barH = 14;
    const barY = h * 0.52;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(bodyX, barY, barW, barH);
    const pGrad = ctx.createLinearGradient(bodyX, 0, bodyX + barW, 0);
    pGrad.addColorStop(0, '#10b981');
    pGrad.addColorStop(0.5, '#38bdf8');
    pGrad.addColorStop(1, '#facc15');
    ctx.fillStyle = pGrad;
    ctx.fillRect(bodyX + 2, barY + 2, barW - 4, barH - 4);

    // 安全警告与环保小字
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px monospace';
    ctx.fillText('0.00% MERCURY & CADMIUM · HIGH CAPACITY', bodyX, h * 0.68);
    ctx.fillText('CAUTION: DO NOT CONNECT IMPROPERLY OR DISPOSE IN FIRE.', bodyX, h * 0.78);
    ctx.fillText('MADE FOR HIGH-PRECISION PHYSICS CIRCUIT WORKSTATION', bodyX, h * 0.88);

    // 条形码
    const bcX = w - 170;
    const bcY = h * 0.45;
    const bcH = 120;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bcX - 10, bcY - 10, 150, bcH + 35);
    ctx.fillStyle = '#000000';
    const barPatterns = [3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 4, 2, 2, 1, 3, 2, 4, 1, 2, 3, 1];
    let curBx = bcX;
    for (let i = 0; i < barPatterns.length; i++) {
      const bw = barPatterns[i];
      if (i % 2 === 0) {
        ctx.fillRect(curBx, bcY, bw * 2, bcH);
      }
      curBx += bw * 2.8;
    }
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('6901028804152', bcX + 65, bcY + bcH + 18);

    // 负极端大标 [-]
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 54px monospace';
    ctx.fillText('[-]', w - 60, h * 0.28);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }

  /**
   * 构建工业级 D 型干电池（真实冲压卷边、负极凹槽接触盘、收颈斜肩、正极排气凸钮，拒绝简陋拼接）
   */
  private createDetailedDCellBattery(
    parent: THREE.Group,
    centerPos: THREE.Vector3,
    isReversed: boolean,
    labelTexture: THREE.CanvasTexture,
    angleJitter = 0,
  ): void {
    const cellGroup = new THREE.Group();
    cellGroup.position.copy(centerPos);

    if (isReversed) {
      cellGroup.rotation.y = Math.PI;
    }
    cellGroup.rotation.x = angleJitter;

    const R = 0.016;       // 电池外壳外径半径 16mm (直径 32mm)
    const R_top = 0.0146;   // 正极收口斜肩上径 14.6mm
    const bodyL = 0.046;   // 贴纸圆柱筒身长 46mm

    // ================= A. 负极镀镍钢盖组合件 (-X 侧端面) =================
    const negX = -0.026;

    // 1. 负极端面外圈冲压卷边咬唇 (Rolled Outer Rim)
    const negRimGeo = new THREE.TorusGeometry(R - 0.0011, 0.0011, 12, 32);
    negRimGeo.rotateY(Math.PI / 2);
    const negRimMat = labMetal(0xf1f5f9, 0.95, 0.16);
    const negRim = new THREE.Mesh(negRimGeo, negRimMat);
    negRim.position.set(negX + 0.0011, 0, 0);
    cellGroup.add(negRim);

    // 2. 负极外围绝缘黑色缝隙环
    const negGasketGeo = new THREE.CylinderGeometry(R - 0.0006, R - 0.0006, 0.0012, 32);
    negGasketGeo.rotateZ(Math.PI / 2);
    const negGasketMat = new THREE.MeshStandardMaterial({ color: 0x090a0f, roughness: 0.85 });
    const negGasket = new THREE.Mesh(negGasketGeo, negGasketMat);
    negGasket.position.set(negX + 0.0008, 0, 0);
    cellGroup.add(negGasket);

    // 3. 负极冲压防漏液凹槽环 (Annular Safety Groove)
    const negGrooveGeo = new THREE.CylinderGeometry(R - 0.0022, R - 0.0022, 0.0015, 32);
    negGrooveGeo.rotateZ(Math.PI / 2);
    const negGrooveMat = labMetal(0x94a3b8, 0.92, 0.22);
    const negGroove = new THREE.Mesh(negGrooveGeo, negGrooveMat);
    negGroove.position.set(negX + 0.0004, 0, 0);
    cellGroup.add(negGroove);

    // 4. 负极中央镀镍平坦接触圆盘 (Central Flat Contact Disc - 紧压弹簧)
    const negDiscGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.0012, 24);
    negDiscGeo.rotateZ(Math.PI / 2);
    const negDiscMat = labMetal(0xffffff, 0.98, 0.10);
    const negDisc = new THREE.Mesh(negDiscGeo, negDiscMat);
    negDisc.position.set(negX, 0, 0);
    cellGroup.add(negDisc);

    // ================= B. 电池主体圆柱壳与高清黑金印刷覆膜 =================
    const bodyGeo = new THREE.CylinderGeometry(R, R, bodyL, 48);
    bodyGeo.rotateZ(-Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: labelTexture,
      roughness: 0.26,
      metalness: 0.14,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(-0.001, 0, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    cellGroup.add(bodyMesh);

    // ================= C. 正极端工业多段收颈与冲压凸钮 (+X 侧端面) =================
    const neckStartX = bodyL * 0.5 - 0.001;

    // 1. 冲压倒角收颈斜肩圆台 (Tapered Neck Shoulder)
    const shoulderGeo = new THREE.CylinderGeometry(R_top, R, 0.0028, 48);
    shoulderGeo.rotateZ(-Math.PI / 2);
    const shoulderMat = labMetal(0xe2e8f0, 0.95, 0.18);
    const shoulderMesh = new THREE.Mesh(shoulderGeo, shoulderMat);
    shoulderMesh.position.set(neckStartX + 0.0014, 0, 0);
    cellGroup.add(shoulderMesh);

    // 2. 金属外壳顶部向内收口卷唇 (Top Crimped Beaded Lip)
    const topLipGeo = new THREE.TorusGeometry(R_top - 0.001, 0.001, 12, 32);
    topLipGeo.rotateY(Math.PI / 2);
    const topLipMat = labMetal(0xf1f5f9, 0.96, 0.14);
    const topLipMesh = new THREE.Mesh(topLipGeo, topLipMat);
    topLipMesh.position.set(neckStartX + 0.0028, 0, 0);
    cellGroup.add(topLipMesh);

    // 3. 内嵌绝缘阻燃尼龙防爆垫圈 (Recessed Nylon Vent Ring)
    const washerGeo = new THREE.CylinderGeometry(R_top - 0.0014, R_top - 0.0014, 0.0015, 32);
    washerGeo.rotateZ(Math.PI / 2);
    const washerMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.85 });
    const washerMesh = new THREE.Mesh(washerGeo, washerMat);
    washerMesh.position.set(neckStartX + 0.003, 0, 0);
    cellGroup.add(washerMesh);

    // 4. 正极冲压紫铜镀黄铜凸台端子 (Positive Button Terminal Cap)
    const capGeo = new THREE.CylinderGeometry(0.0042, 0.0047, 0.0036, 24);
    capGeo.rotateZ(-Math.PI / 2);
    const capMat = labMetal(0xfef08a, 0.94, 0.15);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.set(neckStartX + 0.0048, 0, 0);
    cellGroup.add(capMesh);

    // 正极凸帽顶端倒圆角冲压封顶
    const capRimGeo = new THREE.TorusGeometry(0.0038, 0.0006, 8, 20);
    capRimGeo.rotateY(Math.PI / 2);
    const capRimMesh = new THREE.Mesh(capRimGeo, capMat);
    capRimMesh.position.set(neckStartX + 0.0066, 0, 0);
    cellGroup.add(capRimMesh);

    parent.add(cellGroup);
  }

  /**
   * 为槽位负极端添加 3D 圆锥宝塔螺旋压缩弹簧
   */
  private addConicalSpring(
    parent: THREE.Group,
    basePos: THREE.Vector3,
    direction: 1 | -1,
  ): void {
    const length = 0.011;
    const curve = new ConicalSpringCurve(0.0115, 0.0060, length, 3.5);
    const geo = new THREE.TubeGeometry(curve, 48, 0.0011, 8, false);
    if (direction === -1) {
      geo.rotateY(Math.PI);
    }
    const mat = labMetal(0xf8fafc, 0.96, 0.12);
    const springMesh = new THREE.Mesh(geo, mat);
    springMesh.position.copy(basePos);
    springMesh.castShadow = true;
    parent.add(springMesh);
  }

  /**
   * 为槽位正极端添加冲压紫铜接触片与接触触点
   */
  private addLeafContact(
    parent: THREE.Group,
    wallPos: THREE.Vector3,
    direction: 1 | -1,
  ): void {
    const contactGroup = new THREE.Group();
    contactGroup.position.copy(wallPos);
    if (direction === -1) {
      contactGroup.rotation.y = Math.PI;
    }

    const leafGeo = new THREE.BoxGeometry(0.0012, 0.018, 0.014);
    const leafMat = labMetal(0xd97706, 0.88, 0.25);
    const leafMesh = new THREE.Mesh(leafGeo, leafMat);
    leafMesh.position.set(0, 0.009, 0);
    contactGroup.add(leafMesh);

    const pipGeo = new THREE.SphereGeometry(0.0028, 12, 12);
    const pipMesh = new THREE.Mesh(pipGeo, leafMat);
    pipMesh.position.set(direction * 0.0012, 0.009, 0);
    contactGroup.add(pipMesh);

    parent.add(contactGroup);
  }

  // ================= 2. 真实四联工业大号干电池组与实验室电池盒 (替代原简陋稳压电源箱) =================
  private buildPowerSupply(_initialVoltage: number): void {
    const bGroup = new THREE.Group();
    bGroup.name = 'batteryPackGroup';
    this.batteryPackGroup = bGroup;

    // 端正放置在左后方仪器台面，向内微偏转面向操作者视界
    bGroup.position.set(-0.275, 0.022, -0.065);
    bGroup.rotation.y = 0.16;

    // 1. 实验室高强度绝缘工程电木/ABS底座外框 (带精密微倒角)
    const caddyWidth = 0.156;  // X轴：电池长度方向
    const caddyDepth = 0.138;  // Z轴：4槽并排方向
    const caddyHeight = 0.028; // Y轴：底座高

    const chassisGeo = new THREE.BoxGeometry(caddyWidth, caddyHeight, caddyDepth);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.06,
      roughness: 0.72,
    });
    const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    chassisMesh.position.set(0, caddyHeight * 0.5, 0);
    chassisMesh.castShadow = true;
    chassisMesh.receiveShadow = true;
    bGroup.add(chassisMesh);

    // 底座四角防滑硅胶底脚垫
    const footMat = new THREE.MeshStandardMaterial({ color: 0x090a0f, roughness: 0.9 });
    const footOffsets = [
      [-caddyWidth * 0.44, 0.002, -caddyDepth * 0.44],
      [caddyWidth * 0.44, 0.002, -caddyDepth * 0.44],
      [-caddyWidth * 0.44, 0.002, caddyDepth * 0.44],
      [caddyWidth * 0.44, 0.002, caddyDepth * 0.44],
    ];
    for (const [fx, fy, fz] of footOffsets) {
      const footGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12);
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, fy, fz);
      bGroup.add(foot);
    }

    // 四角不锈钢内六角固定螺栓沉孔
    const boltMat = labMetal(0xe2e8f0, 0.94, 0.22);
    for (const [fx, _, fz] of footOffsets) {
      const boltGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 12);
      const bolt = new THREE.Mesh(boltGeo, boltMat);
      bolt.position.set(fx, caddyHeight + 0.0005, fz);
      bGroup.add(bolt);
    }

    // 前端拉丝铝合金工业铭牌
    const plateGeo = new THREE.PlaneGeometry(0.120, 0.015);
    const plateMat = anodizedAluminum(0xf1f5f9, 0.22);
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(0, caddyHeight * 0.52, caddyDepth * 0.501);
    bGroup.add(plateMesh);

    // 2. 4个卧式半圆柱弧形电池托槽与注塑隔板
    const cradleR = 0.0172; // 槽内径，刚好承托 R=0.016 电池
    const slotZList = [-0.045, -0.015, 0.015, 0.045]; // 4槽位置
    const cradleLength = 0.076;

    // 槽底模压极性浮雕材质
    const posSignMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
    const negSignMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

    // 3. 生成 1024x512 超写实黑金电池标签贴纸
    this.batteryLabelTexture = this.createBatteryLabelTexture();

    // 4. 依次构建 4 节串联 D 型干电池及两端接触件
    const wallLeftX = -caddyWidth * 0.5 + 0.012;
    const wallRightX = caddyWidth * 0.5 - 0.012;
    const batteryY = caddyHeight * 0.72; // 电池中心高度约 20mm

    slotZList.forEach((sz, idx) => {
      // 弧形托槽内凹阴影面
      const cradleGeo = new THREE.CylinderGeometry(cradleR, cradleR, cradleLength, 24, 1, true, 0, Math.PI);
      cradleGeo.rotateZ(Math.PI / 2);
      const cradleMat = new THREE.MeshStandardMaterial({
        color: 0x111216,
        roughness: 0.85,
        side: THREE.DoubleSide,
      });
      const cradleMesh = new THREE.Mesh(cradleGeo, cradleMat);
      cradleMesh.position.set(0, batteryY, sz);
      bGroup.add(cradleMesh);

      // 槽内极性标志浮雕
      const isReversed = idx % 2 === 1; // 奇数槽极性反向（+在左侧）
      const leftIsPositive = isReversed;

      // 槽底极性符号
      const signXLeft = -0.024;
      const signXRight = 0.024;
      const signMatLeft = leftIsPositive ? posSignMat : negSignMat;
      const signMatRight = leftIsPositive ? negSignMat : posSignMat;

      const pSignGeo = new THREE.BoxGeometry(0.005, 0.001, 0.0016);
      const pSignLeft = new THREE.Mesh(pSignGeo, signMatLeft);
      pSignLeft.position.set(signXLeft, batteryY - cradleR + 0.002, sz);
      bGroup.add(pSignLeft);

      const pSignRight = new THREE.Mesh(pSignGeo, signMatRight);
      pSignRight.position.set(signXRight, batteryY - cradleR + 0.002, sz);
      bGroup.add(pSignRight);

      // 构建精密 D 型干电池实体
      const jitter = (idx === 1 ? 0.25 : idx === 2 ? -0.18 : 0.08);
      this.createDetailedDCellBattery(
        bGroup,
        new THREE.Vector3(0, batteryY, sz),
        isReversed,
        this.batteryLabelTexture!,
        jitter,
      );

      // 五金：宝塔弹簧与冲压片
      if (leftIsPositive) {
        this.addLeafContact(bGroup, new THREE.Vector3(wallLeftX, batteryY, sz), 1);
        this.addConicalSpring(bGroup, new THREE.Vector3(wallRightX, batteryY, sz), -1);
      } else {
        this.addConicalSpring(bGroup, new THREE.Vector3(wallLeftX, batteryY, sz), 1);
        this.addLeafContact(bGroup, new THREE.Vector3(wallRightX, batteryY, sz), -1);
      }
    });

    // 5. 电池间串联黄铜连接排 (Brass Series Busbars)
    const busbarMat = labMetal(0xd97706, 0.88, 0.22);
    // 左端跨接条：连接槽0与槽1
    const busbarLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.002, 0.014, Math.abs(slotZList[1] - slotZList[0]) + 0.006),
      busbarMat,
    );
    busbarLeft.position.set(wallLeftX - 0.003, batteryY, (slotZList[0] + slotZList[1]) * 0.5);
    bGroup.add(busbarLeft);

    // 右端跨接条：连接槽1与槽2
    const busbarRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.002, 0.014, Math.abs(slotZList[2] - slotZList[1]) + 0.006),
      busbarMat,
    );
    busbarRight.position.set(wallRightX + 0.003, batteryY, (slotZList[1] + slotZList[2]) * 0.5);
    bGroup.add(busbarRight);

    // 左端跨接条：连接槽2与槽3
    const busbarLeft2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.002, 0.014, Math.abs(slotZList[3] - slotZList[2]) + 0.006),
      busbarMat,
    );
    busbarLeft2.position.set(wallLeftX - 0.003, batteryY, (slotZList[2] + slotZList[3]) * 0.5);
    bGroup.add(busbarLeft2);

    // 6. 前侧面板红黑高规格香蕉插孔实验室接线柱 (Binding Posts)
    // 红色正极(+)由槽0引出，黑色负极(-)由槽3引出
    const posPostLocal = new THREE.Vector3(0.040, caddyHeight * 0.55, caddyDepth * 0.5);
    const negPostLocal = new THREE.Vector3(0.008, caddyHeight * 0.55, caddyDepth * 0.5);
    this.createBindingPost(bGroup, posPostLocal, 0xef4444, true); // (+) 正极红
    this.createBindingPost(bGroup, negPostLocal, 0x334155, true); // (-) 负极黑

    // 兼容占位 Mesh（确保外部引用安全）
    const dummyGeo = new THREE.BoxGeometry(0.001, 0.001, 0.001);
    const dummyMat = new THREE.MeshBasicMaterial({ visible: false });
    this.powerKnobMesh = new THREE.Mesh(dummyGeo, dummyMat);
    this.powerSwitchMesh = new THREE.Mesh(dummyGeo, dummyMat);
    bGroup.add(this.powerKnobMesh);
    bGroup.add(this.powerSwitchMesh);

    this.group.add(bGroup);
  }

  private renderPowerSupplyDisplay(_volts: number, _amps: number): void {
    // 电池组输出稳定电动势，无需数码管重绘
  }

  // ================= 3. 单刀双掷开关 (真实经典物理教学 J2354 胶木双掷闸刀开关 - 前排操作区) =================
  private buildSpdtSwitch(): void {
    const sGroup = new THREE.Group();
    // 端正放置在前排左侧交互操作区
    sGroup.position.set(-0.08, 0.022, 0.12);

    const baseW = 0.17;
    const baseH = 0.012;
    const baseD = 0.09;

    // 1. 经典绝缘电木（胶木，Bakelite）高质感底座
    const baseGeo = new THREE.BoxGeometry(baseW, baseH, baseD);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x221815, // 经典红棕深色电木胶木色
      metalness: 0.08,
      roughness: 0.28,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = baseH * 0.5;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    sGroup.add(baseMesh);

    // 四角沉头安装孔与金属紧固螺栓
    const boltGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.004, 12);
    const boltMat = anodizedAluminum(0x94a3b8);
    const boltOffsets = [
      [-baseW * 0.44, baseH + 0.001, -baseD * 0.40],
      [baseW * 0.44, baseH + 0.001, -baseD * 0.40],
      [-baseW * 0.44, baseH + 0.001, baseD * 0.40],
      [baseW * 0.44, baseH + 0.001, baseD * 0.40],
    ];
    for (const [bx, by, bz] of boltOffsets) {
      const bolt = new THREE.Mesh(boltGeo, boltMat);
      bolt.position.set(bx, by, bz);
      sGroup.add(bolt);
    }

    const brassMat = polishedGold(0xd4af37);

    // 2. 真实黄铜冲压导电板 (Brass Busbars)：将前置接线柱与后置触头/转轴机械与电气连通
    this.createBusbar(sGroup, new THREE.Vector2(-0.065, 0.022), new THREE.Vector2(-0.046, -0.015), baseH, brassMat);
    this.createBusbar(sGroup, new THREE.Vector2(0.065, 0.022), new THREE.Vector2(0.046, -0.015), baseH, brassMat);
    this.createBusbar(sGroup, new THREE.Vector2(0, 0.030), new THREE.Vector2(0, -0.015), baseH, brassMat);

    // 3. 三个前置实验室纯黄铜滚花接线柱 (带颜色绝缘防混垫圈与 4mm 香蕉插孔)
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(-0.065, baseH, 0.022), brassMat, 0xef4444); // 左极接线柱（红）
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(0.065, baseH, 0.022), brassMat, 0xf59e0b);  // 右极接线柱（黄）
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(0, baseH, 0.030), brassMat, 0x0284c7);     // 中间公共极（蓝）

    // 4. 左侧与右侧固定触刀夹 (U型双弹性黄铜片，夹片前后分布，与刀片摆动轨迹切线对齐)
    this.switchLeftContactMesh = this.createKnifeJaw(sGroup, new THREE.Vector3(-0.046, baseH, -0.015), brassMat);
    this.switchLeftContactMesh.name = 'switchLeftContact';

    this.switchRightContactMesh = this.createKnifeJaw(sGroup, new THREE.Vector3(0.046, baseH, -0.015), brassMat);
    this.switchRightContactMesh.name = 'switchRightContact';

    // 5. 中间双耳 U 型铰链座与横向枢轴销钉
    const hingeGroup = new THREE.Group();
    hingeGroup.position.set(0, baseH, -0.015);
    const earGeo = new THREE.BoxGeometry(0.003, 0.018, 0.014);
    const frontEar = new THREE.Mesh(earGeo, brassMat);
    frontEar.position.set(0, 0.009, 0.0035);
    hingeGroup.add(frontEar);

    const backEar = new THREE.Mesh(earGeo, brassMat);
    backEar.position.set(0, 0.009, -0.0035);
    hingeGroup.add(backEar);

    const pinGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.015, 16);
    pinGeo.rotateX(Math.PI / 2);
    const pin = new THREE.Mesh(pinGeo, brassMat);
    pin.position.set(0, 0.014, 0);
    hingeGroup.add(pin);
    sGroup.add(hingeGroup);

    // 6. 动触刀旋转总成（围绕 Z 轴摆动：负角充电压入左夹，正角放电压入右夹）
    this.switchLeverGroup = new THREE.Group();
    this.switchLeverGroup.position.set(0, baseH + 0.014, -0.015);

    // 纯黄铜刀身（厚度 0.0028，宽度 0.010，从销钉向外延伸 0.056）
    const bladeGeo = new THREE.BoxGeometry(0.0028, 0.056, 0.010);
    bladeGeo.translate(0, 0.026, 0);
    this.switchKnifeMesh = new THREE.Mesh(bladeGeo, brassMat);
    this.switchKnifeMesh.name = 'switchKnifeBlade';
    this.switchKnifeMesh.castShadow = true;
    this.switchLeverGroup.add(this.switchKnifeMesh);

    // 经典车削绝缘手柄（红木/红宝石高光胶木手柄）
    const handleGroup = new THREE.Group();
    handleGroup.position.set(0, 0.052, 0);

    const gripGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.034, 16);
    gripGeo.translate(0, 0.017, 0);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b, // 经典实验室深红胶木手柄
      roughness: 0.18,
      metalness: 0.12,
    });
    this.switchHandleMesh = new THREE.Mesh(gripGeo, handleMat);
    this.switchHandleMesh.name = 'switchHandle';
    this.switchHandleMesh.castShadow = true;
    handleGroup.add(this.switchHandleMesh);

    const tipGeo = new THREE.SphereGeometry(0.006, 16, 16);
    tipGeo.translate(0, 0.034, 0);
    handleGroup.add(new THREE.Mesh(tipGeo, handleMat));

    this.switchLeverGroup.add(handleGroup);
    sGroup.add(this.switchLeverGroup);

    // 触点瞬态微弱电弧闪烁点光源
    this.sparkLight = new THREE.PointLight(0x67e8f9, 0, 0.35);
    this.sparkLight.position.set(-0.046, baseH + 0.014, -0.015);
    sGroup.add(this.sparkLight);

    this.group.add(sGroup);
  }

  // 构造冲压 U 型前后双簧片触刀夹（顺应刀片旋转切线，真实夹紧刀身）
  private createKnifeJaw(parent: THREE.Group, pos: THREE.Vector3, mat: THREE.Material): THREE.Mesh {
    const jawGroup = new THREE.Group();
    jawGroup.position.copy(pos);

    // 底部固定底板
    const baseBlockGeo = new THREE.BoxGeometry(0.012, 0.004, 0.014);
    baseBlockGeo.translate(0, 0.002, 0);
    jawGroup.add(new THREE.Mesh(baseBlockGeo, mat));

    // 前后两片冲压高弹性黄铜簧片 (Spring Brass Leaves)
    const leafGeo = new THREE.BoxGeometry(0.010, 0.018, 0.0018);
    // 前簧片 (+Z)
    const frontLeaf = new THREE.Mesh(leafGeo, mat);
    frontLeaf.position.set(0, 0.011, 0.0022);
    jawGroup.add(frontLeaf);

    // 后簧片 (-Z)
    const backLeaf = new THREE.Mesh(leafGeo, mat);
    backLeaf.position.set(0, 0.011, -0.0022);
    jawGroup.add(backLeaf);

    // 顶部外翻喇叭导向口 (Flared entry lips)，便于刀片切入
    const lipGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 0.010, 8);
    lipGeo.rotateZ(Math.PI / 2);
    const frontLip = new THREE.Mesh(lipGeo, mat);
    frontLip.position.set(0, 0.020, 0.0030);
    jawGroup.add(frontLip);

    const backLip = new THREE.Mesh(lipGeo, mat);
    backLip.position.set(0, 0.020, -0.0030);
    jawGroup.add(backLip);

    // 整体可拾取碰撞体
    const hitGeo = new THREE.BoxGeometry(0.020, 0.028, 0.020);
    hitGeo.translate(0, 0.014, 0);
    const hitMesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    jawGroup.add(hitMesh);

    parent.add(jawGroup);
    return hitMesh;
  }

  // 构造黄铜冲压导电铜板 (Brass Busbar)
  private createBusbar(parent: THREE.Group, p1: THREE.Vector2, p2: THREE.Vector2, baseH: number, mat: THREE.Material): void {
    const dx = p2.x - p1.x;
    const dz = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);

    const barGeo = new THREE.BoxGeometry(0.010, 0.0016, len + 0.012);
    const barMesh = new THREE.Mesh(barGeo, mat);
    barMesh.position.set((p1.x + p2.x) * 0.5, baseH + 0.0008, (p1.y + p2.y) * 0.5);
    barMesh.rotation.y = angle;
    parent.add(barMesh);

    // 两端紧固黄铜螺钉
    const screwGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.002, 8);
    const screwMat = polishedGold(0xb45309);
    const s1 = new THREE.Mesh(screwGeo, screwMat);
    s1.position.set(p1.x, baseH + 0.0018, p1.y);
    parent.add(s1);

    const s2 = new THREE.Mesh(screwGeo, screwMat);
    s2.position.set(p2.x, baseH + 0.0018, p2.y);
    parent.add(s2);
  }

  // 构造纯黄铜滚花接线柱 (Knurled Brass Binding Post)
  private createKnurledTerminalPost(parent: THREE.Group, pos: THREE.Vector3, brassMat: THREE.Material, ringColor: number): void {
    const postGroup = new THREE.Group();
    postGroup.position.copy(pos);

    // 1. 颜色绝缘防混垫圈 (红/黄/蓝)
    const ringGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.0025, 16);
    ringGeo.translate(0, 0.0012, 0);
    const ringMat = new THREE.MeshStandardMaterial({ color: ringColor, roughness: 0.3 });
    postGroup.add(new THREE.Mesh(ringGeo, ringMat));

    // 2. 黄铜螺柱
    const studGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.018, 16);
    studGeo.translate(0, 0.009, 0);
    postGroup.add(new THREE.Mesh(studGeo, brassMat));

    // 3. 黄铜滚花旋钮螺母 (Knurled Nut)
    const nutGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.008, 20);
    nutGeo.translate(0, 0.010, 0);
    postGroup.add(new THREE.Mesh(nutGeo, brassMat));

    // 4. 4mm 香蕉插头插孔盲孔
    const holeGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, 12);
    holeGeo.translate(0, 0.016, 0);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    postGroup.add(new THREE.Mesh(holeGeo, holeMat));

    parent.add(postGroup);
  }

  // ================= 4. 真实储能电容器 (纯真实工业元件 - 中后排元件区居右，与前排电流传感器对齐) =================
  private buildCapacitor(initialUf: number): void {
    const cGroup = new THREE.Group();
    // 工整摆放在中后排右侧元件区，与前排电流传感器正对
    cGroup.position.set(0.08, 0.022, -0.07);

    // 1. 实验室器材专用安装固定底座（规整工程电木/黑色绝缘底座）
    const baseW = 0.11;
    const baseH = 0.012;
    const baseD = 0.11;
    const mountGeo = new THREE.BoxGeometry(baseW, baseH, baseD);
    const mountMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.1,
      roughness: 0.4,
    });
    const mount = new THREE.Mesh(mountGeo, mountMat);
    mount.position.y = baseH * 0.5;
    mount.castShadow = true;
    mount.receiveShadow = true;
    cGroup.add(mount);

    // 金属抱箍支架（冲压铝合金双耳抱箍，将圆柱电容紧紧箍紧在底座上）
    const clampGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.016, 32, 1, true, 0, Math.PI * 1.85);
    clampGeo.translate(0, baseH + 0.024, 0);
    const clampMat = anodizedAluminum(0x94a3b8);
    const clampMesh = new THREE.Mesh(clampGeo, clampMat);
    cGroup.add(clampMesh);

    // 2. 真实铝电解电容圆柱罐体 (EPCOS / Nichicon 经典高耐压工业蓝)
    const capRadius = 0.038;
    const capHeight = 0.095;
    const capGeo = new THREE.CylinderGeometry(capRadius, capRadius, capHeight, 32);
    capGeo.translate(0, baseH + capHeight * 0.5, 0);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0a2540, // 经典工业深海蓝
      metalness: 0.45,
      roughness: 0.32,
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.castShadow = true;
    cGroup.add(capMesh);

    // 3. 极真实工业丝印聚酯热缩套管（带白色负极条带和极精细规格参数喷码）
    const sleeveTexture = paintTexture(1024, 512, (ctx, w, h) => {
      ctx.fillStyle = '#0a2540';
      ctx.fillRect(0, 0, w, h);

      // 负极条带（白银色竖向条带，内含负极 '-' 连字符）
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(60, 0, 90, h);

      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 48px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let y = 60; y < h; y += 80) {
          ctx.fillText('—', 105, y);
        }
      }

      // 工业标准规格极简喷码
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.font = '700 44px monospace';
        ctx.fillText(`${initialUf.toFixed(0)} µF`, 200, 150);

        ctx.font = '600 34px monospace';
        ctx.fillText('25V  WV', 200, 205);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 24px monospace';
        ctx.fillText('-40°C ~ +105°C  (M)', 200, 255);
        ctx.fillText('VENT  SERIES CD293', 200, 295);

        ctx.font = '400 18px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText('ENERGY STORAGE CAPACITOR', 200, 335);
        ctx.fillText('LOT: 2439A-8X', 200, 365);
      }
    });

    const wrapGeo = new THREE.CylinderGeometry(capRadius + 0.0006, capRadius + 0.0006, capHeight * 0.88, 32, 1, true, -Math.PI * 0.6, Math.PI * 1.2);
    wrapGeo.translate(0, baseH + capHeight * 0.5, 0);
    const wrapMat = new THREE.MeshBasicMaterial({
      map: sleeveTexture,
      side: THREE.DoubleSide,
    });
    cGroup.add(new THREE.Mesh(wrapGeo, wrapMat));

    // 4. 电容器冲压铝金属防爆顶盖（刻有极具工业特征的十字防爆安全阀凹槽）
    const ventTexture = paintTexture(512, 512, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, w, h);

      // 外周密封圈
      if (typeof ctx.arc === 'function') {
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 冲压十字泄压凹槽 (Cross Vent)
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx - 100, cy);
      ctx.lineTo(cx + 100, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 100);
      ctx.lineTo(cx, cy + 100);
      ctx.stroke();

      // 凹槽高光边
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 100, cy + 3);
      ctx.lineTo(cx + 100, cy + 3);
      ctx.moveTo(cx + 3, cy - 100);
      ctx.lineTo(cx + 3, cy + 100);
      ctx.stroke();
    });

    const topVentGeo = new THREE.CylinderGeometry(capRadius * 0.98, capRadius * 0.98, 0.003, 32);
    topVentGeo.translate(0, baseH + capHeight, 0);
    const topVentMat = new THREE.MeshStandardMaterial({
      map: ventTexture,
      metalness: 0.65,
      roughness: 0.35,
    });
    cGroup.add(new THREE.Mesh(topVentGeo, topVentMat));

    // 5. 顶部引出两个标准物理教学红黑接线柱：(+) 正极红朝右前、(-) 负极黑朝左后
    this.createBindingPost(cGroup, new THREE.Vector3(0.016, baseH + capHeight, 0.010), 0xef4444);
    this.createBindingPost(cGroup, new THREE.Vector3(-0.016, baseH + capHeight, -0.010), 0x334155);

    // 6. 静电场微弱物理光晕（充放电时端电压越高，电容器周身微光凝聚，无任何假文字）
    const haloGeo = new THREE.CylinderGeometry(capRadius * 1.15, capRadius * 1.15, capHeight * 1.05, 24);
    haloGeo.translate(0, baseH + capHeight * 0.5, 0);
    this.capFieldHaloMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.0,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.capFieldHaloMesh = new THREE.Mesh(haloGeo, this.capFieldHaloMaterial);
    cGroup.add(this.capFieldHaloMesh);

    this.group.add(cGroup);
  }

  // ================= 5. 放电电阻 (真实黄金铝壳线绕功率电阻 - 中后排元件区居左，与前排开关对齐) =================
  private buildResistor(resistanceOhm: number): void {
    const rGroup = new THREE.Group();
    // 工整与前排单刀双掷开关并列对齐在中后排左侧元件区
    rGroup.position.set(-0.05, 0.022, -0.07);

    // 1. 实验室阻燃白陶瓷绝缘固定底座
    const mountGeo = new THREE.BoxGeometry(0.12, 0.012, 0.06);
    const mountMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.12,
      roughness: 0.25,
    });
    const mount = new THREE.Mesh(mountGeo, mountMat);
    mount.position.y = 0.006;
    mount.castShadow = true;
    mount.receiveShadow = true;
    rGroup.add(mount);

    // 2. 真实黄金阳极氧化铝外壳线绕大功率电阻 (Gold Aluminum Housed Wirewound Resistor RX24)
    const shellW = 0.082;
    const shellH = 0.022;
    const shellD = 0.030;

    const shellGeo = new THREE.BoxGeometry(shellW, shellH, shellD);
    shellGeo.translate(0, 0.014 + shellH * 0.5, 0);
    const shellMat = anodizedAluminum(0xf59e0b, 0.22); // 经典黄金铝壳色
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    shellMesh.castShadow = true;
    rGroup.add(shellMesh);

    // 纵向精密散热鳍片 (Heat sink fins)
    const finGeo = new THREE.BoxGeometry(0.003, 0.028, 0.034);
    for (let i = -6; i <= 6; i++) {
      const fin = new THREE.Mesh(finGeo, shellMat);
      fin.position.set(i * 0.0055, 0.014 + shellH * 0.5, 0);
      fin.castShadow = true;
      rGroup.add(fin);
    }

    // 两侧冲压金属安装耳片与紧固螺栓
    const earGeo = new THREE.BoxGeometry(0.014, 0.003, 0.024);
    const leftEar = new THREE.Mesh(earGeo, shellMat);
    leftEar.position.set(-shellW * 0.5 - 0.007, 0.015, 0);
    rGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, shellMat);
    rightEar.position.set(shellW * 0.5 + 0.007, 0.015, 0);
    rGroup.add(rightEar);

    // 3. 两端耐高温白陶瓷绝缘套管
    const bushGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.014, 16);
    bushGeo.rotateZ(Math.PI / 2);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35 });

    const leftBush = new THREE.Mesh(bushGeo, bushMat);
    leftBush.position.set(-shellW * 0.5 - 0.006, 0.014 + shellH * 0.5, 0);
    rGroup.add(leftBush);

    const rightBush = new THREE.Mesh(bushGeo, bushMat);
    rightBush.position.set(shellW * 0.5 + 0.006, 0.014 + shellH * 0.5, 0);
    rGroup.add(rightBush);

    // 4. 两端引出纯铜镀金接线端子与 4mm 香蕉插孔
    const termMat = polishedGold();
    const t1 = this.createResistorTerminal(rGroup, new THREE.Vector3(-shellW * 0.5 - 0.012, 0.014 + shellH * 0.5, 0), termMat);
    const t2 = this.createResistorTerminal(rGroup, new THREE.Vector3(shellW * 0.5 + 0.012, 0.014 + shellH * 0.5, 0), termMat);

    // 5. 真实工业激光微小打标（如小字 RX24-50W 1000Ω ±1%，低调真实工业质感）
    const markTexture = paintTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.clearRect(0, 0, w, h);
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#78350f';
        ctx.font = '700 22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`RX24-50W ${resistanceOhm.toFixed(0)}Ω ±1%`, w / 2, h / 2);
      }
    });
    const markGeo = new THREE.PlaneGeometry(0.05, 0.012);
    const markMat = new THREE.MeshBasicMaterial({
      map: markTexture,
      transparent: true,
    });
    const markMesh = new THREE.Mesh(markGeo, markMat);
    markMesh.position.set(0, 0.014 + shellH + 0.0005, 0);
    markMesh.rotation.x = -Math.PI / 2;
    rGroup.add(markMesh);

    this.group.add(rGroup);
  }

  private createResistorTerminal(parent: THREE.Group, pos: THREE.Vector3, mat: THREE.Material): THREE.Mesh {
    const postGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.018, 16);
    postGeo.translate(0, 0.009, 0);
    const mesh = new THREE.Mesh(postGeo, mat);
    mesh.position.copy(pos);
    parent.add(mesh);

    // 顶部香蕉插座孔
    const holeGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.006, 12);
    holeGeo.translate(0, 0.017, 0);
    const holeMesh = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x0f172a }));
    mesh.add(holeMesh);

    return mesh;
  }

  // ================= 6. 电流传感器 (真实数字化测量仪器表头 - 前排操作区右侧) =================
  private buildCurrentSensor(): void {
    const sensGroup = new THREE.Group();
    // 与左侧单刀双掷开关端正平齐并列在前排操作区
    sensGroup.position.set(0.08, 0.022, 0.12);

    // 1. 现代科研级数字化传感器机箱外壳（米白高强度工程塑料，带精工倒角与外壳缝线）
    const bodyW = 0.12;
    const bodyH = 0.028;
    const bodyD = 0.085;

    const bodyGeo = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
    bodyGeo.translate(0, bodyH * 0.5, 0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.18,
      roughness: 0.30,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    sensGroup.add(body);

    // 2. 倾斜人机工程学液晶数显仪表屏（真实仪表 LCD 屏，仅显示实时测量数值与单位 mA）
    this.sensorDisplayCanvas = document.createElement('canvas');
    this.sensorDisplayCanvas.width = 320;
    this.sensorDisplayCanvas.height = 160;
    this.sensorDisplayTexture = new THREE.CanvasTexture(this.sensorDisplayCanvas);
    this.sensorDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderCurrentSensorDisplay(0.0);

    const dispGeo = new THREE.PlaneGeometry(0.080, 0.042);
    const dispMat = new THREE.MeshBasicMaterial({
      map: this.sensorDisplayTexture,
      toneMapped: false,
    });
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.rotation.x = -Math.PI * 0.15; // 倾角朝向操作者
    dispMesh.position.set(0, bodyH + 0.002, 0.004);
    sensGroup.add(dispMesh);

    // 3. 采样与电源状态微型 LED 指示灯
    const ledGeo = new THREE.SphereGeometry(0.0035, 16, 16);
    this.sensorLedMaterial = labGlow(0x38bdf8, 0.8);
    const ledMesh = new THREE.Mesh(ledGeo, this.sensorLedMaterial);
    ledMesh.position.set(0.046, bodyH + 0.002, 0.024);
    sensGroup.add(ledMesh);

    // 4. 标准实验室 4mm 香蕉插座：红 (+) 正极输入、黑 (-) 负极输出
    this.createBindingPost(sensGroup, new THREE.Vector3(-0.038, bodyH, 0.024), 0xef4444);
    this.createBindingPost(sensGroup, new THREE.Vector3(0.038, bodyH, 0.024), 0x334155);

    // 5. 右侧示波器模拟信号 BNC 输出金属端口
    const bncGroup = new THREE.Group();
    bncGroup.position.set(bodyW * 0.5 + 0.004, bodyH * 0.45, 0);
    bncGroup.rotation.z = -Math.PI * 0.5;
    const bncMetalGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.008, 16);
    const bncMetalMat = anodizedAluminum(0x94a3b8);
    bncGroup.add(new THREE.Mesh(bncMetalGeo, bncMetalMat));
    sensGroup.add(bncGroup);

    this.group.add(sensGroup);
  }

  private renderCurrentSensorDisplay(currentMa: number): void {
    const ctx = this.sensorDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.sensorDisplayCanvas.width;
    const h = this.sensorDisplayCanvas.height;

    // 真实仪表深色高对比度背光
    ctx.fillStyle = '#051410';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.25)';
    ctx.lineWidth = 2;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }

    if (typeof ctx.fillText === 'function') {
      // 瞬时测量电流大字高精度数显（真实数字表头）
      const isCharging = currentMa > 0.01;
      const isDischarging = currentMa < -0.01;
      ctx.fillStyle = isCharging ? '#38bdf8' : isDischarging ? '#f59e0b' : '#4ade80';
      ctx.font = '700 64px monospace';
      ctx.textAlign = 'right';

      const sign = currentMa > 0 ? '+' : '';
      ctx.fillText(`${sign}${currentMa.toFixed(2)}`, w - 74, 100);

      // 单位标识
      ctx.font = '600 28px monospace';
      ctx.fillText('mA', w - 20, 100);

      // 顶部极简物理量符号
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 20px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('I', 20, 42);
    }

    this.sensorDisplayTexture.needsUpdate = true;
  }

  // ================= 7. 台式数字存储示波器 (Desktop Oscilloscope - 右后方仪器区) =================
  private buildOscilloscope(): void {
    const oGroup = new THREE.Group();
    // 端正放置在右后方仪器区，与左后方稳压电源对称呼应，微向内偏转面向操作者视线
    oGroup.position.set(0.28, 0.022, -0.06);
    oGroup.rotation.y = -0.18;

    const chassisGroup = new THREE.Group();
    chassisGroup.rotation.x = -Math.PI * 0.11; // 18° 人体工学仰角
    chassisGroup.position.y = 0.055;

    // 1. 示波器机壳主体
    const bodyGeo = new THREE.BoxGeometry(0.19, 0.125, 0.075);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.15,
      roughness: 0.28,
    });
    this.scopeChassisMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.scopeChassisMesh.castShadow = true;
    this.scopeChassisMesh.receiveShadow = true;
    chassisGroup.add(this.scopeChassisMesh);

    // 侧边防撞包角 (Keysight/Siglent 钴蓝工业包角)
    const bumperGeo = new THREE.BoxGeometry(0.008, 0.128, 0.078);
    const bumperMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.1,
      roughness: 0.35,
    });
    const leftBumper = new THREE.Mesh(bumperGeo, bumperMat);
    leftBumper.position.set(-0.095, 0, 0);
    chassisGroup.add(leftBumper);

    const rightBumper = new THREE.Mesh(bumperGeo, bumperMat);
    rightBumper.position.set(0.095, 0, 0);
    chassisGroup.add(rightBumper);

    // 顶部便携折叠提手
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.06, 0.062, 0),
      new THREE.Vector3(-0.05, 0.088, 0),
      new THREE.Vector3(0.05, 0.088, 0),
      new THREE.Vector3(0.06, 0.062, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 16, 0.004, 8, false);
    const handleMat = anodizedAluminum(0x94a3b8);
    chassisGroup.add(new THREE.Mesh(handleGeo, handleMat));

    // 2. 屏幕深黑边框与高分辨率液晶显示屏
    const bezelGeo = new THREE.PlaneGeometry(0.142, 0.094);
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.8,
    });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(-0.016, 0.004, 0.038);
    chassisGroup.add(bezel);

    this.scopeDisplayCanvas = document.createElement('canvas');
    this.scopeDisplayCanvas.width = 1024;
    this.scopeDisplayCanvas.height = 640;
    this.scopeDisplayTexture = new THREE.CanvasTexture(this.scopeDisplayCanvas);
    this.scopeDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.scopeDisplayTexture.minFilter = THREE.LinearFilter;
    this.scopeDisplayTexture.magFilter = THREE.LinearFilter;
    this.renderOscilloscopeDisplay(undefined, []);

    const screenGeo = new THREE.PlaneGeometry(0.138, 0.090);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.scopeDisplayTexture,
      toneMapped: false,
    });
    this.scopeScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.scopeScreenMesh.position.set(-0.016, 0.004, 0.0385);
    this.scopeScreenMesh.name = 'scopeScreenMesh';
    chassisGroup.add(this.scopeScreenMesh);

    // 高抗反光微透保护镜片
    const glassGeo = new THREE.PlaneGeometry(0.138, 0.090);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(-0.016, 0.004, 0.0388);
    chassisGroup.add(glassMesh);

    // 3. 右侧控制区面板 (快捷按键与旋钮)
    const knobGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 20);
    knobGeo.rotateX(Math.PI / 2);
    const knobMat = anodizedAluminum(0x64748b, 0.2);

    // TIME/DIV 旋钮
    const timeKnob = new THREE.Mesh(knobGeo, knobMat);
    timeKnob.position.set(0.068, 0.032, 0.042);
    chassisGroup.add(timeKnob);

    // SCALE 旋钮
    const voltKnob = new THREE.Mesh(knobGeo, knobMat);
    voltKnob.position.set(0.068, 0.004, 0.042);
    chassisGroup.add(voltKnob);

    // RUN / STOP 状态按键
    const runBtnGeo = new THREE.BoxGeometry(0.014, 0.010, 0.008);
    const runBtnMat = labGlow(0x10b981, 0.8);
    this.scopeRunBtnMesh = new THREE.Mesh(runBtnGeo, runBtnMat);
    this.scopeRunBtnMesh.position.set(0.068, -0.022, 0.041);
    this.scopeRunBtnMesh.name = 'scopeRunBtn';
    chassisGroup.add(this.scopeRunBtnMesh);

    // 清除波形按键 (CLEAR)
    const clearBtnGeo = new THREE.BoxGeometry(0.014, 0.008, 0.008);
    const clearBtnMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    this.scopeClearBtnMesh = new THREE.Mesh(clearBtnGeo, clearBtnMat);
    this.scopeClearBtnMesh.position.set(0.068, -0.036, 0.041);
    this.scopeClearBtnMesh.name = 'scopeClearBtn';
    chassisGroup.add(this.scopeClearBtnMesh);

    // CH1 输入 BNC 金属同轴插座
    const bncOuterGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.014, 16);
    bncOuterGeo.rotateX(Math.PI / 2);
    const bncOuterMat = anodizedAluminum(0x94a3b8);
    const bncMesh = new THREE.Mesh(bncOuterGeo, bncOuterMat);
    bncMesh.position.set(0.068, -0.050, 0.042);
    chassisGroup.add(bncMesh);

    // 4. 台式支撑支架与防滑底脚
    const standGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.06, 12);
    const standMat = anodizedAluminum(0x64748b);
    const leftStand = new THREE.Mesh(standGeo, standMat);
    leftStand.rotation.z = Math.PI * 0.25;
    leftStand.position.set(-0.06, -0.035, -0.03);
    chassisGroup.add(leftStand);

    const rightStand = new THREE.Mesh(standGeo, standMat);
    rightStand.rotation.z = -Math.PI * 0.25;
    rightStand.position.set(0.06, -0.035, -0.03);
    chassisGroup.add(rightStand);

    oGroup.add(chassisGroup);
    this.group.add(oGroup);

    // 5. 示波器专用高频探头同轴屏蔽线（自电流传感器 BNC 端口连接至示波器 CH1）
    const bncCablePts = [
      new THREE.Vector3(0.145, 0.035, 0.120),
      new THREE.Vector3(0.190, 0.028, 0.100),
      new THREE.Vector3(0.260, 0.030, 0.050),
      new THREE.Vector3(0.337, 0.044, 0.007),
    ];
    this.addJumperTube(bncCablePts, 0x1e293b); // 专业黑色高频同轴线
  }

  public renderOscilloscopeDisplay(telemetry?: CapacitorTelemetry, samples: readonly WaveformSample[] = []): void {
    if (!this.scopeDisplayCanvas) return;
    const ctx = this.scopeDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.scopeDisplayCanvas.width;
    const h = this.scopeDisplayCanvas.height;

    // 清屏与深邃高对比度示波器底色
    ctx.fillStyle = '#020b14';
    ctx.fillRect(0, 0, w, h);

    const padLeft = 70;
    const padRight = 30;
    const padTop = 50;
    const padBottom = 45;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // 1. 示波器专业暗青荧光网格 (10 竖格 x 8 横格)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1.2;
    const cols = 10;
    for (let c = 0; c <= cols; c++) {
      const x = padLeft + (plotW * c) / cols;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, h - padBottom);
      ctx.stroke();
    }
    const rows = 8;
    for (let r = 0; r <= rows; r++) {
      const y = padTop + (plotH * r) / rows;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
    }

    // 2. 坐标极值计算
    const tMin = samples.length > 0 ? samples[0].time : 0;
    const tLatest = samples.length > 0 ? samples[samples.length - 1].time : 5;
    const tWindow = Math.max(5.0, tLatest - tMin);

    const peak = Math.max(12.0, telemetry?.peakChargeCurrentMa ?? 0, telemetry?.peakDischargeCurrentMa ?? 0);
    const limit = Math.ceil(peak * 1.25);
    const yMin = -limit;
    const yMax = limit;

    const toScreenX = (t: number) => padLeft + ((t - tMin) / tWindow) * plotW;
    const toScreenY = (val: number) => padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

    // 3. 零基准虚线 (I = 0)
    const zeroY = toScreenY(0);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = 1.6;
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([6, 5]);
    }
    ctx.beginPath();
    ctx.moveTo(padLeft, zeroY);
    ctx.lineTo(w - padRight, zeroY);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([]);
    }

    // 4. 坐标轴与物理刻度文字
    ctx.fillStyle = '#64748b';
    ctx.font = '600 16px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yTicks = [yMin, yMin * 0.5, 0, yMax * 0.5, yMax];
    if (typeof ctx.fillText === 'function') {
      for (const val of yTicks) {
        const y = toScreenY(val);
        ctx.fillText(`${val > 0 ? '+' : ''}${val.toFixed(0)}`, padLeft - 10, y);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('I (mA)', padLeft - 60, padTop - 20);
      ctx.textAlign = 'right';
      ctx.fillText('t (s)', w - padRight + 10, h - padBottom + 26);

      // X 轴时间刻度
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let c = 0; c <= cols; c += 2) {
        const t = tMin + (tWindow * c) / cols;
        const x = padLeft + (plotW * c) / cols;
        ctx.fillText(`${t.toFixed(1)}`, x, h - padBottom + 10);
      }

      // 顶部真实仪器状态
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '700 18px monospace';
      const pos = telemetry?.switchPosition ?? 'neutral';
      if (pos === 'charge') {
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('TRIG · CH1 [CHARGE]', padLeft, padTop - 20);
      } else if (pos === 'discharge') {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('TRIG · CH1 [DISCHARGE]', padLeft, padTop - 20);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('READY · CH1', padLeft, padTop - 20);
      }

      // 实时测量读数 (右上角)
      if (telemetry) {
        const cur = telemetry.currentMa;
        const vol = telemetry.voltageCapacitor;
        ctx.textAlign = 'right';
        ctx.font = '700 18px monospace';
        ctx.fillStyle = cur > 0.01 ? '#38bdf8' : cur < -0.01 ? '#f59e0b' : '#94a3b8';
        const sign = cur > 0 ? '+' : '';
        ctx.fillText(`I: ${sign}${cur.toFixed(2)} mA   Uc: ${vol.toFixed(2)} V`, w - padRight, padTop - 20);
      }
    }

    // 5. 绘制连续连续电流曲线 (I-t)
    if (samples.length >= 2) {
      for (let i = 0; i < samples.length - 1; i++) {
        const s0 = samples[i];
        const s1 = samples[i + 1];
        const x0 = toScreenX(s0.time);
        const y0 = toScreenY(s0.currentMa);
        const x1 = toScreenX(s1.time);
        const y1 = toScreenY(s1.currentMa);

        const isCharging = s0.state === 'charge';
        const isDischarging = s0.state === 'discharge';

        ctx.strokeStyle = isCharging ? '#38bdf8' : isDischarging ? '#f59e0b' : '#64748b';
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        // 积分发光阴影面积
        if (isCharging || isDischarging) {
          ctx.fillStyle = isCharging ? 'rgba(56, 189, 248, 0.12)' : 'rgba(245, 158, 11, 0.12)';
          ctx.beginPath();
          ctx.moveTo(x0, zeroY);
          ctx.lineTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.lineTo(x1, zeroY);
          ctx.closePath();
          ctx.fill();
        }
      }

      // 扫描头亮点
      const last = samples[samples.length - 1];
      const lx = toScreenX(last.time);
      const ly = toScreenY(last.currentMa);
      ctx.fillStyle = last.state === 'charge' ? '#38bdf8' : last.state === 'discharge' ? '#f59e0b' : '#4ade80';
      ctx.beginPath();
      ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.stroke();
    }

    this.scopeDisplayTexture.needsUpdate = true;
  }

  // ================= 8. 真实实验室 4mm 香蕉插头导线与电流动态粒子流系统 =================
  private buildWiresAndParticles(): void {
    // 导线端点路径（CatmullRom 曲线，重力悬垂感，严格无交叉整齐布线）
    // 导线1 (红): 电池组正极 -> 开关触点1 (电源侧左极接线柱)
    const wire1Pts = [
      new THREE.Vector3(-0.2216, 0.0454, 0.0145),
      new THREE.Vector3(-0.210, 0.042, 0.055),
      new THREE.Vector3(-0.185, 0.032, 0.100),
      new THREE.Vector3(-0.160, 0.040, 0.138),
      new THREE.Vector3(-0.145, 0.050, 0.142),
    ];
    // 导线2 (蓝): 开关动触刀公共极 (中间公共极接线柱) -> 电流传感器正输入极
    const wire2Pts = [
      new THREE.Vector3(-0.080, 0.050, 0.150),
      new THREE.Vector3(-0.060, 0.035, 0.165),
      new THREE.Vector3(-0.015, 0.032, 0.170),
      new THREE.Vector3(0.025, 0.045, 0.162),
      new THREE.Vector3(0.042, 0.066, 0.144),
    ];
    // 导线3 (蓝): 电流传感器负输出极 -> 电容器正极
    const wire3Pts = [
      new THREE.Vector3(0.118, 0.066, 0.144),
      new THREE.Vector3(0.125, 0.045, 0.090),
      new THREE.Vector3(0.115, 0.050, 0.020),
      new THREE.Vector3(0.102, 0.100, -0.035),
      new THREE.Vector3(0.096, 0.1455, -0.060),
    ];
    // 导线4 (黑): 电容器负极 -> 电池组负极接地回路线（沿后槽低垂规整回线）
    const wire4Pts = [
      new THREE.Vector3(0.064, 0.1455, -0.080),
      new THREE.Vector3(0.040, 0.080, -0.125),
      new THREE.Vector3(-0.060, 0.034, -0.130),
      new THREE.Vector3(-0.180, 0.036, -0.100),
      new THREE.Vector3(-0.245, 0.040, -0.030),
      new THREE.Vector3(-0.2532, 0.0454, 0.0196),
    ];

    // 放电回路特定导线
    // 导线5 (黄): 开关触点2 (放电侧右极接线柱) -> 放电电阻右端
    const wire5Pts = [
      new THREE.Vector3(-0.015, 0.050, 0.142),
      new THREE.Vector3(-0.010, 0.038, 0.090),
      new THREE.Vector3(-0.005, 0.032, 0.010),
      new THREE.Vector3(0.000, 0.045, -0.045),
      new THREE.Vector3(0.003, 0.064, -0.070),
    ];
    // 导线6 (黑): 放电电阻左端 -> 电容器负极接地回路（叠插香蕉插头）
    const wire6Pts = [
      new THREE.Vector3(-0.103, 0.064, -0.070),
      new THREE.Vector3(-0.080, 0.035, -0.105),
      new THREE.Vector3(0.000, 0.035, -0.110),
      new THREE.Vector3(0.050, 0.095, -0.100),
      new THREE.Vector3(0.064, 0.1695, -0.080),
    ];

    // 创建柔性导线管体
    this.addJumperTube(wire1Pts, 0xef4444); // 红色电源正
    this.addJumperTube(wire2Pts, 0x38bdf8); // 蓝色传感器正
    this.addJumperTube(wire3Pts, 0x0284c7); // 钴蓝电容器正
    this.addJumperTube(wire4Pts, 0x334155); // 经典深灰/黑回路线
    this.addJumperTube(wire5Pts, 0xf59e0b); // 琥珀黄放电线
    this.addJumperTube(wire6Pts, 0x334155); // 经典深灰/黑回路线

    // 出线方向：水平面板朝向 (powerDir) 与垂直插孔朝向 (upDir)
    const powerDir = new THREE.Vector3(0.1593, 0, 0.9872);
    const upDir = new THREE.Vector3(0, 1, 0);

    // 为每根导线的两端安装真实的 4mm 实验室香蕉插头 (Banana Plug)
    this.addBananaPlug(wire1Pts[0], powerDir, 0xef4444);
    this.addBananaPlug(wire1Pts[wire1Pts.length - 1], upDir, 0xef4444);

    this.addBananaPlug(wire2Pts[0], upDir, 0x38bdf8);
    this.addBananaPlug(wire2Pts[wire2Pts.length - 1], upDir, 0x38bdf8);

    this.addBananaPlug(wire3Pts[0], upDir, 0x0284c7);
    this.addBananaPlug(wire3Pts[wire3Pts.length - 1], upDir, 0x0284c7);

    this.addBananaPlug(wire4Pts[0], upDir, 0x334155);
    this.addBananaPlug(wire4Pts[wire4Pts.length - 1], powerDir, 0x334155);

    this.addBananaPlug(wire5Pts[0], upDir, 0xf59e0b);
    this.addBananaPlug(wire5Pts[wire5Pts.length - 1], upDir, 0xf59e0b);

    this.addBananaPlug(wire6Pts[0], upDir, 0x334155);
    this.addBananaPlug(wire6Pts[wire6Pts.length - 1], upDir, 0x334155);

    // 导线样条曲线对象，用于粒子巡游
    this.chargeWireSplines = [
      new THREE.CatmullRomCurve3(wire1Pts),
      new THREE.CatmullRomCurve3(wire2Pts),
      new THREE.CatmullRomCurve3(wire3Pts),
      new THREE.CatmullRomCurve3(wire4Pts),
    ];

    this.dischargeWireSplines = [
      new THREE.CatmullRomCurve3(wire3Pts.slice().reverse()),
      new THREE.CatmullRomCurve3(wire2Pts.slice().reverse()),
      new THREE.CatmullRomCurve3(wire5Pts),
      new THREE.CatmullRomCurve3(wire6Pts),
    ];

    // 构建动态高亮发光电子流粒子系统
    const chargeCount = 180;
    this.chargeParticleProgress = new Float32Array(chargeCount);
    const chargePos = new Float32Array(chargeCount * 3);
    for (let i = 0; i < chargeCount; i++) {
      this.chargeParticleProgress[i] = i / chargeCount;
      const pt = this.getSplinesPoint(this.chargeWireSplines, this.chargeParticleProgress[i]);
      chargePos[i * 3] = pt.x;
      chargePos[i * 3 + 1] = pt.y;
      chargePos[i * 3 + 2] = pt.z;
    }
    this.chargeParticleGeometry = new THREE.BufferGeometry();
    this.chargeParticleGeometry.setAttribute('position', new THREE.BufferAttribute(chargePos, 3));

    const chargeParticleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.007,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.chargeParticles = new THREE.Points(this.chargeParticleGeometry, chargeParticleMat);
    this.group.add(this.chargeParticles);

    // 放电回路动态粒子流
    const dischargeCount = 180;
    this.dischargeParticleProgress = new Float32Array(dischargeCount);
    const dischargePos = new Float32Array(dischargeCount * 3);
    for (let i = 0; i < dischargeCount; i++) {
      this.dischargeParticleProgress[i] = i / dischargeCount;
      const pt = this.getSplinesPoint(this.dischargeWireSplines, this.dischargeParticleProgress[i]);
      dischargePos[i * 3] = pt.x;
      dischargePos[i * 3 + 1] = pt.y;
      dischargePos[i * 3 + 2] = pt.z;
    }
    this.dischargeParticleGeometry = new THREE.BufferGeometry();
    this.dischargeParticleGeometry.setAttribute('position', new THREE.BufferAttribute(dischargePos, 3));

    const dischargeParticleMat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.007,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dischargeParticles = new THREE.Points(this.dischargeParticleGeometry, dischargeParticleMat);
    this.group.add(this.dischargeParticles);
  }

  // 构造标准 4mm 实验室香蕉插头 3D 网格 (Banana Plug)
  private addBananaPlug(pos: THREE.Vector3, dir: THREE.Vector3, color: number): void {
    const plugGroup = new THREE.Group();
    plugGroup.position.copy(pos);

    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    plugGroup.quaternion.copy(quat);

    // 1. 4mm 镀金金属插针
    const pinGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.010, 12);
    pinGeo.translate(0, 0.005, 0);
    const pinMat = polishedGold(0xfde047);
    plugGroup.add(new THREE.Mesh(pinGeo, pinMat));

    // 2. 绝缘抓握塑胶外壳（带防滑凹槽）
    const handleGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.018, 16);
    handleGeo.translate(0, 0.018, 0);
    const handleMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.15,
    });
    plugGroup.add(new THREE.Mesh(handleGeo, handleMat));

    // 3. 柔性防弯折尾套 (Strain relief boot)
    const bootGeo = new THREE.CylinderGeometry(0.003, 0.0042, 0.006, 12);
    bootGeo.translate(0, 0.029, 0);
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    plugGroup.add(new THREE.Mesh(bootGeo, bootMat));

    this.group.add(plugGroup);
  }

  private createBindingPost(parent: THREE.Group, pos: THREE.Vector3, color: number, isPanelMount = false): void {
    const postGroup = new THREE.Group();
    postGroup.position.copy(pos);
    if (isPanelMount) {
      postGroup.rotation.x = Math.PI * 0.5;
    }

    // 包塑绝缘外圈
    const postGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.016, 16);
    postGeo.translate(0, 0.008, 0);
    const postMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });
    postGroup.add(new THREE.Mesh(postGeo, postMat));

    // 内部镀金金属导电插孔
    const coreGeo = new THREE.CylinderGeometry(0.0024, 0.0024, 0.018, 12);
    coreGeo.translate(0, 0.009, 0);
    const coreMat = polishedGold();
    postGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // 顶部插孔盲孔
    const holeGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.004, 12);
    holeGeo.translate(0, 0.0165, 0);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    postGroup.add(new THREE.Mesh(holeGeo, holeMat));

    parent.add(postGroup);
  }

  private addJumperTube(pts: THREE.Vector3[], color: number): void {
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 32, 0.003, 8, false);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  private getSplinesPoint(splines: THREE.CatmullRomCurve3[], globalU: number): THREE.Vector3 {
    const n = splines.length;
    const scaled = ((globalU % 1) + 1) % 1 * n;
    const idx = Math.min(Math.floor(scaled), n - 1);
    const localU = scaled - idx;
    return splines[idx].getPoint(localU);
  }

  // ================= 9. 标牌（已完全移除所有 3D 浮动文字标签） =================
  private buildLabels(): void {
    // 遵从严禁任何浮动文字标签与 DOM 弹窗铁律，保持 100% 干净通透纯三维台面
    this.labelsGroup = new THREE.Group();
    this.labelsGroup.name = 'CapacitorDischargeLabels';
    this.labelsGroup.visible = false;
    this.group.add(this.labelsGroup);
  }

  // ================= 动态状态同步与渲染帧更新 =================
  public setSwitchPosition(pos: SwitchPosition, instant = false): void {
    this.lastSwitchPos = pos;
    if (pos === 'charge') {
      this.targetBladeAngle = -1.25; // 约 -72° 严丝合缝深切入左侧触刀夹双簧片内部
      this.triggerSpark();
    } else if (pos === 'discharge') {
      this.targetBladeAngle = 1.25;  // 约 +72° 严丝合缝深切入右侧触刀夹双簧片内部
      this.triggerSpark();
    } else {
      this.targetBladeAngle = 0;     // 中立断开 (0° 垂直向上挺立)
    }

    if (instant) {
      this.currentBladeAngle = this.targetBladeAngle;
      if (this.switchLeverGroup) {
        this.switchLeverGroup.rotation.z = this.currentBladeAngle;
      }
    }
  }

  private triggerSpark(): void {
    if (this.sparkLight) {
      if (this.lastSwitchPos === 'charge') {
        this.sparkLight.position.set(-0.046, 0.022, -0.015);
      } else if (this.lastSwitchPos === 'discharge') {
        this.sparkLight.position.set(0.046, 0.022, -0.015);
      }
      this.sparkLight.intensity = 2.5;
      this.sparkTimer = 0.08;
    }
  }

  public update(delta: number, telemetry?: CapacitorTelemetry, samples?: readonly WaveformSample[]): void {
    this.pulsePhase += delta * 6.0;

    // 1. 动触刀物理平滑摆动 (弹性阻尼插值)
    const angleDiff = this.targetBladeAngle - this.currentBladeAngle;
    if (Math.abs(angleDiff) > 0.001) {
      const step = angleDiff * Math.min(1.0, delta * 18.0);
      this.currentBladeAngle += step;
      this.switchLeverGroup.rotation.z = this.currentBladeAngle;
    }

    // 2. 触点电弧微弱闪烁消退
    if (this.sparkTimer > 0) {
      this.sparkTimer -= delta;
      if (this.sparkTimer <= 0) {
        this.sparkLight.intensity = 0;
      }
    }

    // 3. 动态电流与电容状态遥测同步
    if (telemetry) {
      const cur = telemetry.currentMa;
      const vol = telemetry.voltageCapacitor;
      const supply = telemetry.voltageSupply;

      // 仅在读数变化时更新数显表头，避免 60fps 冗余重绘
      if (Math.abs(cur - this.lastRenderedCurrent) > 0.05 || telemetry.switchPosition !== this.lastSwitchPos) {
        this.lastRenderedCurrent = cur;
        this.renderCurrentSensorDisplay(cur);
      }
      if (Math.abs(supply - this.lastRenderedSupply) > 0.05) {
        this.lastRenderedSupply = supply;
        this.renderPowerSupplyDisplay(supply, 1.0);
      }

      // 4. 电容器静电场物理光晕强度随端电压动态起伏（纯物理发光，无文字）
      const chargeRatio = Math.max(0, Math.min(1.0, vol / Math.max(1.0, supply)));
      if (this.capFieldHaloMaterial) {
        this.capFieldHaloMaterial.opacity = chargeRatio * 0.40;
        this.capFieldHaloMaterial.emissiveIntensity = chargeRatio * (0.7 + 0.2 * Math.sin(this.pulsePhase));
      }

      // 5. 传感器采样指示灯脉冲呼吸
      if (this.sensorLedMaterial) {
        this.sensorLedMaterial.emissiveIntensity = 0.4 + 0.5 * Math.abs(Math.sin(this.pulsePhase * 1.5));
      }

      // 6. 导线粒子流动态推移
      const isCharging = telemetry.switchPosition === 'charge' && cur > 0.01;
      const isDischarging = telemetry.switchPosition === 'discharge' && Math.abs(cur) > 0.01;

      // 充电粒子流
      if (this.chargeParticles) {
        const chargeMat = this.chargeParticles.material as THREE.PointsMaterial;
        if (isCharging) {
          chargeMat.opacity = Math.min(1.0, (cur / 10.0) * 0.9 + 0.2);
          const flowSpeed = (cur / 10.0) * 0.65 + 0.15;
          const posAttr = this.chargeParticleGeometry.attributes.position as THREE.BufferAttribute;
          const count = this.chargeParticleProgress.length;

          for (let i = 0; i < count; i++) {
            this.chargeParticleProgress[i] = (this.chargeParticleProgress[i] + delta * flowSpeed) % 1.0;
            const pt = this.getSplinesPoint(this.chargeWireSplines, this.chargeParticleProgress[i]);
            posAttr.setXYZ(i, pt.x, pt.y, pt.z);
          }
          posAttr.needsUpdate = true;
        } else {
          chargeMat.opacity = Math.max(0, chargeMat.opacity - delta * 4.0);
        }
      }

      // 放电粒子流
      if (this.dischargeParticles) {
        const dischargeMat = this.dischargeParticles.material as THREE.PointsMaterial;
        if (isDischarging) {
          const absCur = Math.abs(cur);
          dischargeMat.opacity = Math.min(1.0, (absCur / 10.0) * 0.9 + 0.2);
          const flowSpeed = (absCur / 10.0) * 0.65 + 0.15;
          const posAttr = this.dischargeParticleGeometry.attributes.position as THREE.BufferAttribute;
          const count = this.dischargeParticleProgress.length;

          for (let i = 0; i < count; i++) {
            this.dischargeParticleProgress[i] = (this.dischargeParticleProgress[i] + delta * flowSpeed) % 1.0;
            const pt = this.getSplinesPoint(this.dischargeWireSplines, this.dischargeParticleProgress[i]);
            posAttr.setXYZ(i, pt.x, pt.y, pt.z);
          }
          posAttr.needsUpdate = true;
        } else {
          dischargeMat.opacity = Math.max(0, dischargeMat.opacity - delta * 4.0);
        }
      }

      // 7. 实时更新桌面示波器小屏幕波形
      if (samples) {
        if (
          samples.length !== this.scopeLastSampleCount ||
          Math.abs(cur - this.scopeLastCurrent) > 0.02 ||
          telemetry.switchPosition !== this.scopeLastPos
        ) {
          this.scopeLastSampleCount = samples.length;
          this.scopeLastCurrent = cur;
          this.scopeLastPos = telemetry.switchPosition;
          this.renderOscilloscopeDisplay(telemetry, samples);
        }
      }
    }
  }

  public setLabelsVisible(visible: boolean): void {
    this.showLabels = visible;
    if (this.labelsGroup) {
      this.labelsGroup.visible = false; // 始终保持关闭，严禁出现任何浮动标签
    }
  }

  public dispose(): void {
    if (this.scopeDisplayTexture) {
      this.scopeDisplayTexture.dispose();
    }
    if (this.batteryLabelTexture) {
      this.batteryLabelTexture.dispose();
    }
    if (this.powerDisplayTexture) {
      this.powerDisplayTexture.dispose();
    }
    if (this.sensorDisplayTexture) {
      this.sensorDisplayTexture.dispose();
    }
    disposeObjectTree(this.group);
  }
}
