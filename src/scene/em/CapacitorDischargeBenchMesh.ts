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
 * 创建带真实机械圆角与倒角的工业级实体几何体
 * 杜绝无细节、无倒角、锐利生硬的积木式 BoxGeometry
 */
function createChamferedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.0018
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.001, radius);
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
  const extrudeSettings = {
    steps: 1,
    depth: Math.max(0.001, height - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height * 0.5, 0);
  return geo;
}

/**
 * 经典电磁学与RC电路实验台：电容器充放电实验
 * 极致工业工艺与机械细节建模，彻底杜绝粗糙积木拼接、穿模与无意义文字
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
  public batteryPackGroup!: THREE.Group; // 保持向后兼容（指向电源组）
  public rheostatGroup!: THREE.Group;
  public capacitorGroup!: THREE.Group;
  public currentSensorGroup!: THREE.Group;

  // 单刀双掷开关动触刀组件（围绕铰链轴平滑旋转）
  private switchLeverGroup!: THREE.Group;
  private currentBladeAngle = 0; // 弧度
  private targetBladeAngle = 0;

  // 动态数显纹理与画布（仅保留纯净、真实的仪器读数）
  private powerDisplayTexture!: THREE.CanvasTexture;
  private powerDisplayCanvas!: HTMLCanvasElement;
  private sensorDisplayTexture!: THREE.CanvasTexture;
  private sensorDisplayCanvas!: HTMLCanvasElement;
  private capLabelTexture!: THREE.CanvasTexture;

  // 电容器静电场物理光晕（随端电压平滑增强）
  private capFieldHaloMesh!: THREE.Mesh;
  private capFieldHaloMaterial!: THREE.MeshStandardMaterial;

  // 传感器采样与电源指示灯
  private sensorLedMaterial!: THREE.MeshStandardMaterial;
  private powerLedMaterial!: THREE.MeshStandardMaterial;

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

  // 标牌组（已清空文字，保持 3D 台面纯净）
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
  private currentVoltageSupply = 6.0;

  constructor(options: CapacitorDischargeBenchMeshOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'CapacitorDischargeBenchMesh';
    this.showLabels = options.showLabels ?? false;
    this.currentVoltageSupply = options.voltageSupply ?? 6.0;

    this.buildBaseboard();
    this.buildPowerSupply(this.currentVoltageSupply);
    this.buildResistor(options.resistanceOhm ?? 1000.0);
    this.buildCapacitor(options.capacitanceUf ?? 1000.0);
    this.buildSpdtSwitch();
    this.buildCurrentSensor();
    this.buildOscilloscope();
    this.buildWiresAndParticles();
    this.buildLabels();

    // 默认掷向中立断开档位 (0° 垂直向上)
    this.setSwitchPosition('neutral', true);
  }

  // ================= 1. 真实物理实验工作台底板 (带倒角机械边框与防滑脚垫) =================
  private buildBaseboard(): void {
    const baseW = 1.04;
    const baseH = 0.022;
    const baseD = 0.58;

    // 主台面：航空级喷砂银铝面板（四角带圆角与机械倒角）
    const baseGeo = createChamferedBoxGeometry(baseW, baseH, baseD, 0.016, 0.002);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.32,
      roughness: 0.35,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, 0, 0);
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // 四角重型减震防滑硅胶底脚垫
    const footGeo = new THREE.CylinderGeometry(0.018, 0.020, 0.010, 24);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75 });
    const footOffsets = [
      [-baseW * 0.45, 0.005, -baseD * 0.43],
      [baseW * 0.45, 0.005, -baseD * 0.43],
      [-baseW * 0.45, 0.005, baseD * 0.43],
      [baseW * 0.45, 0.005, baseD * 0.43],
    ];
    for (const [fx, fy, fz] of footOffsets) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, fy, fz);
      this.group.add(foot);
    }
  }

  // ================= 2. 真实实验室台式直流稳压电源 (PS3005-X 经典科研机箱) =================
  private buildPowerSupply(initialVoltage: number): void {
    const pGroup = new THREE.Group();
    pGroup.name = 'powerSupplyGroup';
    this.batteryPackGroup = pGroup; // 保持向后兼容

    // 端正放置在左后方仪器台面，向内微偏转 0.15 rad 朝向操作者视线
    pGroup.position.set(-0.32, 0.022, -0.09);
    pGroup.rotation.y = 0.15;

    const caseW = 0.160;
    const caseH = 0.130;
    const caseD = 0.150;

    // 1. 主机外壳：倒角机箱（无锐利生硬直边）
    const chassisGeo = createChamferedBoxGeometry(caseW, caseH, caseD, 0.008, 0.002);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.15,
      roughness: 0.32,
    });
    const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    chassisMesh.castShadow = true;
    chassisMesh.receiveShadow = true;
    pGroup.add(chassisMesh);

    // 侧面两排内凹散热百叶窗槽
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 });
    for (let row = 0; row < 2; row++) {
      const vy = caseH * (row === 0 ? 0.40 : 0.68);
      for (let i = -4; i <= 3; i++) {
        const vMesh = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0035, 0.010), ventMat);
        vMesh.position.set(-caseW * 0.501, vy, i * 0.013);
        pGroup.add(vMesh);
      }
    }

    // 顶部便携折叠提手（不锈钢支座与黑色橡胶抓握垫）
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.042, caseH + 0.003, 0),
      new THREE.Vector3(-0.034, caseH + 0.024, 0),
      new THREE.Vector3(0.034, caseH + 0.024, 0),
      new THREE.Vector3(0.042, caseH + 0.003, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 20, 0.0035, 12, false);
    pGroup.add(new THREE.Mesh(handleGeo, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })));

    // 提手镀铬固定支座
    const mountGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 16);
    const mountMat = labMetal(0xffffff, 0.98, 0.08);
    const mLeft = new THREE.Mesh(mountGeo, mountMat);
    mLeft.position.set(-0.042, caseH + 0.0025, 0);
    pGroup.add(mLeft);
    const mRight = new THREE.Mesh(mountGeo, mountMat);
    mRight.position.set(0.042, caseH + 0.0025, 0);
    pGroup.add(mRight);

    // 2. 前面板：拉丝阳极氧化喷砂银铝面板
    const panelGeo = new THREE.PlaneGeometry(caseW - 0.006, caseH - 0.006);
    const panelMat = anodizedAluminum(0xe2e8f0, 0.22);
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.set(0, caseH * 0.5, caseD * 0.5 + 0.001);
    pGroup.add(panelMesh);

    // 3. 深邃海洋蓝双数显仪表视窗（仅保留纯净规范的电压与电流数值，杜绝无意义英文）
    this.powerDisplayCanvas = document.createElement('canvas');
    this.powerDisplayCanvas.width = 512;
    this.powerDisplayCanvas.height = 256;
    this.powerDisplayTexture = new THREE.CanvasTexture(this.powerDisplayCanvas);
    this.powerDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderPowerSupplyDisplay(initialVoltage, 0.0);

    const dispGeo = new THREE.PlaneGeometry(0.074, 0.074);
    const dispMat = new THREE.MeshBasicMaterial({ map: this.powerDisplayTexture, toneMapped: false });
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.position.set(-0.036, caseH * 0.58, caseD * 0.5 + 0.002);
    pGroup.add(dispMesh);

    // 显示屏深黑亚克力外边框
    const bezelGeo = new THREE.BoxGeometry(0.078, 0.078, 0.0015);
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.9 });
    const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
    bezelMesh.position.set(-0.036, caseH * 0.58, caseD * 0.5 + 0.0015);
    pGroup.add(bezelMesh);

    // 4. 右侧精细旋转调节旋钮与绿色发光电源船型开关
    const knobGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.010, 24);
    knobGeo.rotateX(Math.PI / 2);
    const knobMat = anodizedAluminum(0x64748b, 0.22);

    // 电压调节旋钮（可点击交互）
    this.powerKnobMesh = new THREE.Mesh(knobGeo, knobMat);
    this.powerKnobMesh.position.set(0.038, caseH * 0.74, caseD * 0.5 + 0.005);
    this.powerKnobMesh.name = 'powerKnobMesh';
    pGroup.add(this.powerKnobMesh);

    // 电流调节旋钮
    const currKnob = new THREE.Mesh(knobGeo, knobMat);
    currKnob.position.set(0.038, caseH * 0.40, caseD * 0.5 + 0.005);
    pGroup.add(currKnob);

    // 旋钮指针白色刻槽
    const tickGeo = new THREE.BoxGeometry(0.0016, 0.006, 0.002);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(0, 0.004, 0.005);
    this.powerKnobMesh.add(tick);

    // 绿色发光船型电源开关
    const switchGeo = new THREE.BoxGeometry(0.012, 0.016, 0.006);
    const switchMat = labGlow(0x22c55e, 0.95);
    this.powerSwitchMesh = new THREE.Mesh(switchGeo, switchMat);
    this.powerSwitchMesh.position.set(0.038, caseH * 0.57, caseD * 0.5 + 0.003);
    this.powerSwitchMesh.name = 'powerSwitchMesh';
    pGroup.add(this.powerSwitchMesh);

    // 恒压 C.V. 状态微型指示灯
    this.powerLedMaterial = labGlow(0x10b981, 0.9);
    const ledGeo = new THREE.SphereGeometry(0.0022, 12, 12);
    const cvLed = new THREE.Mesh(ledGeo, this.powerLedMaterial);
    cvLed.position.set(0.022, caseH * 0.26, caseD * 0.5 + 0.003);
    pGroup.add(cvLed);

    // 5. 底部标准红/绿/黑实验室 4mm 接线柱（严格水平对齐）
    // 红（+正极）：(-0.355, 0.046, -0.015) 世界坐标
    // 绿（GND地）：(-0.320, 0.046, -0.010) 世界坐标
    // 黑（-负极）：(-0.285, 0.046, -0.005) 世界坐标
    const postY = caseH * 0.18;
    const postZ = caseD * 0.5 + 0.002;
    this.createBindingPost(pGroup, new THREE.Vector3(-0.042, postY, postZ), 0xef4444, true); // (+) 红
    this.createBindingPost(pGroup, new THREE.Vector3(-0.004, postY, postZ), 0x10b981, true); // (GND) 绿
    this.createBindingPost(pGroup, new THREE.Vector3(0.034, postY, postZ), 0x1e293b, true);  // (-) 黑

    this.group.add(pGroup);
  }

  private renderPowerSupplyDisplay(volts: number, amps: number): void {
    const ctx = this.powerDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.powerDisplayCanvas.width;
    const h = this.powerDisplayCanvas.height;

    // 深邃暗海蓝背光
    ctx.fillStyle = '#05101a';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 3;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(6, 6, w - 12, h - 12);
    }

    if (typeof ctx.fillText === 'function') {
      // 上排：青色电压读数
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 84px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${volts.toFixed(2)}`, w - 90, h * 0.30);

      ctx.font = '700 44px monospace';
      ctx.fillText('V', w - 24, h * 0.30);

      // 下排：绿色电流读数
      ctx.fillStyle = '#4ade80';
      ctx.font = '700 84px monospace';
      ctx.fillText(`${amps.toFixed(2)}`, w - 90, h * 0.72);

      ctx.font = '700 44px monospace';
      ctx.fillText('A', w - 24, h * 0.72);
    }

    this.powerDisplayTexture.needsUpdate = true;
  }

  // ================= 3. 真实物理教学 J2354 瓷管滑动变阻器 (Sliding Rheostat) =================
  private buildResistor(resistanceOhm: number): void {
    const rGroup = new THREE.Group();
    rGroup.name = 'rheostatGroup';
    this.rheostatGroup = rGroup;

    // 横卧在中后排正中央，沿 X 轴舒展，滑杆与接线端正对操作者视线
    rGroup.position.set(-0.065, 0.022, -0.09);

    const length = 0.165;
    const tubeR = 0.016;

    // 1. 纯白高光釉面绝缘陶瓷圆柱管 (Glazed Porcelain Tube)
    const tubeGeo = new THREE.CylinderGeometry(tubeR, tubeR, length, 32);
    tubeGeo.rotateZ(Math.PI / 2);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.10,
      metalness: 0.02,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.position.set(0, 0.030, 0);
    tubeMesh.castShadow = true;
    rGroup.add(tubeMesh);

    // 2. 密绕氧化康铜电阻合金丝圈与顶部抛光裸铜滑道
    const wireTexture = paintTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#78350f'; // 康铜氧化暗铜底色
      ctx.fillRect(0, 0, w, h);

      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(x, 0, 2.5, h);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(x + 1, 0, 1, h);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(x + 2.5, 0, 1.5, h);
      }

      // 顶部抛光裸铜滑道
      const trackH = h * 0.22;
      const trackY = h * 0.5 - trackH * 0.5;
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, trackY, w, trackH);
    });

    const coilGeo = new THREE.CylinderGeometry(tubeR + 0.0006, tubeR + 0.0006, length * 0.88, 32);
    coilGeo.rotateZ(Math.PI / 2);
    const coilMat = new THREE.MeshStandardMaterial({
      map: wireTexture,
      metalness: 0.82,
      roughness: 0.28,
    });
    const coilMesh = new THREE.Mesh(coilGeo, coilMat);
    coilMesh.position.set(0, 0.030, 0);
    rGroup.add(coilMesh);

    // 线圈两端锁紧导电紫铜抱箍环
    const bandGeo = new THREE.CylinderGeometry(tubeR + 0.0012, tubeR + 0.0012, 0.006, 24);
    bandGeo.rotateZ(Math.PI / 2);
    const bandMat = polishedGold(0xd97706);
    const lBand = new THREE.Mesh(bandGeo, bandMat);
    lBand.position.set(-length * 0.44, 0.030, 0);
    rGroup.add(lBand);
    const rBand = new THREE.Mesh(bandGeo, bandMat);
    rBand.position.set(length * 0.44, 0.030, 0);
    rGroup.add(rBand);

    // 3. 左右两侧压铸铝合金支架 (弧形肩膀造型与宽展底脚)
    const bracketMat = anodizedAluminum(0x64748b, 0.32);
    const bW = 0.014;
    const bH = 0.062;
    const bD = 0.046;

    const leftBracketGeo = createChamferedBoxGeometry(bW, bH, bD, 0.004, 0.0015);
    const leftBracket = new THREE.Mesh(leftBracketGeo, bracketMat);
    leftBracket.position.set(-length * 0.5 - bW * 0.5, bH * 0.5, 0);
    leftBracket.castShadow = true;
    rGroup.add(leftBracket);

    const rightBracket = new THREE.Mesh(leftBracketGeo, bracketMat);
    rightBracket.position.set(length * 0.5 + bW * 0.5, bH * 0.5, 0);
    rightBracket.castShadow = true;
    rGroup.add(rightBracket);

    // 4. 顶部镜面抛光液态铬金属导电滑杆 (Liquid Chrome Guide Rod)
    const rodR = 0.004;
    const rodY = 0.054;
    const rodGeo = new THREE.CylinderGeometry(rodR, rodR, length + bW * 2 + 0.010, 24);
    rodGeo.rotateZ(Math.PI / 2);
    const rodMat = labMetal(0xffffff, 0.98, 0.06);
    const rodMesh = new THREE.Mesh(rodGeo, rodMat);
    rodMesh.position.set(0, rodY, 0);
    rGroup.add(rodMesh);

    // 5. 滑块触头组件 (车削深红胶木蘑菇手柄与双片弹性磷铜触爪)
    const sliderGroup = new THREE.Group();
    sliderGroup.position.set(0.024, rodY, 0);

    const knobGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.020, 20);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.18, metalness: 0.1 });
    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.position.set(0, 0.014, 0);
    sliderGroup.add(knob);

    // 弹性磷铜电刷触爪（下探恰好贴合裸铜轨道，绝不穿模刺入瓷管）
    const leafGeo = new THREE.BoxGeometry(0.008, 0.014, 0.002);
    const leafMesh = new THREE.Mesh(leafGeo, polishedGold(0xd97706));
    leafMesh.position.set(0, -0.011, 0);
    sliderGroup.add(leafMesh);

    rGroup.add(sliderGroup);

    // 6. 三个标准黄铜滚花接线柱
    // 端子 A (左下)：对应世界坐标 (-0.150, 0.044, -0.070)
    this.createKnurledPost(rGroup, new THREE.Vector3(-length * 0.5 - bW * 0.5, 0.022, bD * 0.42), 0xef4444);
    // 端子 B (右下)：对应世界坐标 (0.020, 0.044, -0.070)
    this.createKnurledPost(rGroup, new THREE.Vector3(length * 0.5 + bW * 0.5, 0.022, bD * 0.42), 0x1e293b);
    // 端子 C (右上滑杆)：对应世界坐标 (0.020, 0.076, -0.090)
    this.createKnurledPost(rGroup, new THREE.Vector3(length * 0.5 + bW * 0.5, rodY, 0), 0xf59e0b);

    // 规格金属铭牌
    const plateGeo = new THREE.PlaneGeometry(0.07, 0.012);
    const plateTexture = paintTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, w, h);
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`J2354 ${resistanceOhm.toFixed(0)}Ω 0.5A`, w / 2, h / 2);
      }
    });
    const plateMesh = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ map: plateTexture }));
    plateMesh.position.set(0, 0.008, bD * 0.5 + 0.001);
    rGroup.add(plateMesh);

    this.group.add(rGroup);
  }

  // ================= 4. 真实教学用大容量储能电容器组件 (Precision Capacitor Module) =================
  private buildCapacitor(initialUf: number): void {
    const cGroup = new THREE.Group();
    cGroup.name = 'capacitorGroup';
    this.capacitorGroup = cGroup;

    // 端正摆放在中后排右侧，世界坐标中心 (0.12, 0.022, -0.09)
    cGroup.position.set(0.12, 0.022, -0.09);

    const baseW = 0.120;
    const baseH = 0.012;
    const baseD = 0.120;

    // 1. CNC 实心铝合金阳极氧化喷砂基板（四角带机械倒角）
    const mountGeo = createChamferedBoxGeometry(baseW, baseH, baseD, 0.008, 0.0018);
    const mountMat = anodizedAluminum(0xf1f5f9, 0.24);
    const mount = new THREE.Mesh(mountGeo, mountMat);
    mount.castShadow = true;
    mount.receiveShadow = true;
    cGroup.add(mount);

    // 2. 真实铝电解电容器本体圆柱罐 (立式安装在基板后部)
    const capRadius = 0.032;
    const capHeight = 0.088;
    const capCenterZ = -0.012;
    const capGeo = new THREE.CylinderGeometry(capRadius, capRadius, capHeight, 36);
    capGeo.translate(0, baseH + capHeight * 0.5, capCenterZ);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0a2e5c, // 经典工业皇家蓝
      metalness: 0.55,
      roughness: 0.28,
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.castShadow = true;
    cGroup.add(capMesh);

    // 3. 极真实工业丝印聚酯热缩套管（仅保留规范清晰的规格喷码，杜绝AI生成无意义英文段落）
    this.capLabelTexture = paintTexture(1024, 512, (ctx, w, h) => {
      ctx.fillStyle = '#0a2e5c';
      ctx.fillRect(0, 0, w, h);

      // 银白负极指示条带与黑色减号
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(80, 0, 110, h);

      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#0f172a';
        ctx.font = '900 56px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let y = 60; y < h; y += 90) {
          ctx.fillText('—', 135, y);
        }

        // 规范工业喷码
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.font = '700 48px monospace';
        ctx.fillText(`CD293`, 250, 120);
        ctx.fillText(`${initialUf.toFixed(0)} µF  25V`, 250, 180);

        ctx.font = '500 32px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('-40℃ ~ +105℃', 250, 240);
        ctx.fillText('VENT SAFETY', 250, 290);
      }
    });

    const wrapGeo = new THREE.CylinderGeometry(
      capRadius + 0.0006,
      capRadius + 0.0006,
      capHeight * 0.90,
      36,
      1,
      true,
      -Math.PI * 0.65,
      Math.PI * 1.3
    );
    wrapGeo.translate(0, baseH + capHeight * 0.5, capCenterZ);
    cGroup.add(new THREE.Mesh(wrapGeo, new THREE.MeshBasicMaterial({ map: this.capLabelTexture, side: THREE.DoubleSide })));

    // 4. 电容器车削金属防爆顶盖与十字防爆安全泄压槽
    const ventCapGeo = new THREE.CylinderGeometry(capRadius * 0.96, capRadius * 0.96, 0.003, 32);
    ventCapGeo.translate(0, baseH + capHeight + 0.0015, capCenterZ);
    cGroup.add(new THREE.Mesh(ventCapGeo, labMetal(0xcbd5e1, 0.85, 0.22)));

    // 5. CNC 分体式双耳金属抱箍支架（带两侧横向黄铜滚花手拧锁紧螺栓）
    const clampGroup = new THREE.Group();
    clampGroup.position.set(0, baseH + 0.024, capCenterZ);

    const ringGeo = new THREE.CylinderGeometry(capRadius + 0.002, capRadius + 0.002, 0.012, 32, 1, true);
    clampGroup.add(new THREE.Mesh(ringGeo, anodizedAluminum(0xe2e8f0, 0.22)));

    const earGeo = new THREE.BoxGeometry(0.008, 0.012, 0.008);
    const lEar = new THREE.Mesh(earGeo, anodizedAluminum(0xe2e8f0, 0.22));
    lEar.position.set(-capRadius - 0.004, 0, 0);
    clampGroup.add(lEar);
    const rEar = new THREE.Mesh(earGeo, anodizedAluminum(0xe2e8f0, 0.22));
    rEar.position.set(capRadius + 0.004, 0, 0);
    clampGroup.add(rEar);

    const thumbNutGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.006, 16);
    thumbNutGeo.rotateZ(Math.PI / 2);
    const thumbMat = polishedGold(0xd4af37);
    const lThumb = new THREE.Mesh(thumbNutGeo, thumbMat);
    lThumb.position.set(-capRadius - 0.010, 0, 0);
    clampGroup.add(lThumb);
    const rThumb = new THREE.Mesh(thumbNutGeo, thumbMat);
    rThumb.position.set(capRadius + 0.010, 0, 0);
    clampGroup.add(rThumb);

    cGroup.add(clampGroup);

    // 6. 前置真实 4mm 香蕉插座接线柱（红+正极、黑-负极）
    // 红（+正极）：世界坐标 (0.154, 0.044, -0.048)
    // 黑（-负极）：世界坐标 (0.086, 0.044, -0.048)
    const postZ = 0.042;
    this.createBindingPost(cGroup, new THREE.Vector3(0.034, baseH, postZ), 0xef4444);  // (+) 红
    this.createBindingPost(cGroup, new THREE.Vector3(-0.034, baseH, postZ), 0x1e293b); // (-) 黑

    // 7. 静电场物理微光光晕（充放电时端电压越高，光晕自然越凝聚通透）
    const haloGeo = new THREE.CylinderGeometry(capRadius * 1.15, capRadius * 1.15, capHeight * 1.05, 24);
    haloGeo.translate(0, baseH + capHeight * 0.5, capCenterZ);
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

  // ================= 5. 单刀双掷开关 (真实经典教学 J2354 胶木双掷闸刀开关) =================
  private buildSpdtSwitch(): void {
    const sGroup = new THREE.Group();
    sGroup.name = 'spdtSwitchGroup';
    // 前排核心交互操作区，世界坐标中心 (-0.11, 0.022, 0.12)
    sGroup.position.set(-0.11, 0.022, 0.12);

    const baseW = 0.160;
    const baseH = 0.014;
    const baseD = 0.096;

    // 1. 经典绝缘电木（红棕胶木 Bakelite）高质感底座（带四角圆角与倒角）
    const baseGeo = createChamferedBoxGeometry(baseW, baseH, baseD, 0.008, 0.0018);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x3a1d17, // 经典红棕深色电木胶木色
      metalness: 0.06,
      roughness: 0.22,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    sGroup.add(baseMesh);

    // 四角镀镍紧固螺栓
    const boltGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.002, 12);
    const boltMat = labMetal(0xe2e8f0, 0.95, 0.15);
    for (const [bx, bz] of [
      [-baseW * 0.43, -baseD * 0.41],
      [baseW * 0.43, -baseD * 0.41],
      [-baseW * 0.43, baseD * 0.41],
      [baseW * 0.43, baseD * 0.41],
    ]) {
      const bolt = new THREE.Mesh(boltGeo, boltMat);
      bolt.position.set(bx, baseH + 0.0008, bz);
      sGroup.add(bolt);
    }

    const brassMat = polishedGold(0xd4af37);

    // 2. 三根物理隔离的纯黄铜冲压导电排（严格电气隔离，杜绝短路与穿模叠面）
    // 左汇流排：连通左触座与左端子
    const lBar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0016, 0.040), brassMat);
    lBar.position.set(-0.040, baseH + 0.0008, 0.004);
    sGroup.add(lBar);

    // 右汇流排：连通右触座与右端子
    const rBar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0016, 0.040), brassMat);
    rBar.position.set(0.040, baseH + 0.0008, 0.004);
    sGroup.add(rBar);

    // 中汇流排：连通中间铰链座与中间公共端子
    const cBar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0016, 0.040), brassMat);
    cBar.position.set(0, baseH + 0.0008, 0.004);
    sGroup.add(cBar);

    // 3. 前置三个实验室纯黄铜滚花接线柱（带红、蓝、黄绝缘色环）
    // 端子 1 (左极/充电)：对应世界坐标 (-0.164, 0.046, 0.144)
    // 端子 0 (中极/公共)：对应世界坐标 (-0.110, 0.046, 0.144)
    // 端子 2 (右极/放电)：对应世界坐标 (-0.056, 0.046, 0.144)
    const postZ = 0.024;
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(-0.054, baseH, postZ), brassMat, 0xef4444); // 左极（红）
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(0.054, baseH, postZ), brassMat, 0xf59e0b);  // 右极（黄）
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(0, baseH, postZ), brassMat, 0x0284c7);     // 中极（蓝）

    // 4. 左侧与右侧真实 U 型弹性黄铜触刀夹（双簧片中空开槽，刀片合闸滑入两片铜簧中间，绝不穿模）
    this.switchLeftContactMesh = this.createKnifeJaw(sGroup, new THREE.Vector3(-0.026, baseH, -0.016), brassMat);
    this.switchLeftContactMesh.name = 'switchLeftContact';

    this.switchRightContactMesh = this.createKnifeJaw(sGroup, new THREE.Vector3(0.026, baseH, -0.016), brassMat);
    this.switchRightContactMesh.name = 'switchRightContact';

    // 5. 中间双耳 U 型铰链座与横向枢轴销钉
    const hingeGroup = new THREE.Group();
    hingeGroup.position.set(0, baseH, -0.016);

    const earGeo = new THREE.BoxGeometry(0.0032, 0.022, 0.014);
    const frontEar = new THREE.Mesh(earGeo, brassMat);
    frontEar.position.set(0, 0.011, 0.004);
    hingeGroup.add(frontEar);

    const backEar = new THREE.Mesh(earGeo, brassMat);
    backEar.position.set(0, 0.011, -0.004);
    hingeGroup.add(backEar);

    const pinGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.016, 16);
    pinGeo.rotateX(Math.PI / 2);
    const pin = new THREE.Mesh(pinGeo, brassMat);
    pin.position.set(0, 0.016, 0);
    hingeGroup.add(pin);
    sGroup.add(hingeGroup);

    // 6. 动触刀旋转总成（围绕枢轴平滑摆动，刀长与角度严格经几何校核，合闸时离底座高 2mm，绝对不穿模！）
    this.switchLeverGroup = new THREE.Group();
    this.switchLeverGroup.position.set(0, baseH + 0.016, -0.016);

    // 纯黄铜加厚动触刀（刀身长 32mm，旋转时绝对位于底板上方）
    const bladeGeo = new THREE.BoxGeometry(0.0028, 0.032, 0.010);
    bladeGeo.translate(0, 0.016, 0);
    this.switchKnifeMesh = new THREE.Mesh(bladeGeo, brassMat);
    this.switchKnifeMesh.name = 'switchKnifeBlade';
    this.switchKnifeMesh.castShadow = true;
    this.switchLeverGroup.add(this.switchKnifeMesh);

    // 经典车削深红胶木手柄
    const handleGroup = new THREE.Group();
    handleGroup.position.set(0, 0.032, 0);

    const gripGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.032, 16);
    gripGeo.translate(0, 0.016, 0);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.16, metalness: 0.1 });
    this.switchHandleMesh = new THREE.Mesh(gripGeo, handleMat);
    this.switchHandleMesh.name = 'switchHandle';
    this.switchHandleMesh.castShadow = true;
    handleGroup.add(this.switchHandleMesh);

    const tipGeo = new THREE.SphereGeometry(0.0065, 16, 16);
    tipGeo.translate(0, 0.032, 0);
    handleGroup.add(new THREE.Mesh(tipGeo, handleMat));

    this.switchLeverGroup.add(handleGroup);
    sGroup.add(this.switchLeverGroup);

    // 触点瞬态微弱电弧火花点光源
    this.sparkLight = new THREE.PointLight(0x67e8f9, 0, 0.35);
    this.sparkLight.position.set(-0.026, baseH + 0.016, -0.016);
    sGroup.add(this.sparkLight);

    this.group.add(sGroup);
  }

  // 构造真实双簧片 U 型开槽静触爪（刀片滑入中空缝隙，杜绝刺入实体穿模）
  private createKnifeJaw(parent: THREE.Group, pos: THREE.Vector3, mat: THREE.Material): THREE.Mesh {
    const jawGroup = new THREE.Group();
    jawGroup.position.copy(pos);

    // 底部安装固定铜垫块
    const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.004, 0.014), mat);
    baseBlock.position.set(0, 0.002, 0);
    jawGroup.add(baseBlock);

    // 前后两片冲压高弹性双簧片（中间留有 4mm 开槽，容纳 2.8mm 动触刀）
    const leafGeo = new THREE.BoxGeometry(0.008, 0.018, 0.0016);
    const fLeaf = new THREE.Mesh(leafGeo, mat);
    fLeaf.position.set(0, 0.011, 0.0028);
    jawGroup.add(fLeaf);

    const bLeaf = new THREE.Mesh(leafGeo, mat);
    bLeaf.position.set(0, 0.011, -0.0028);
    jawGroup.add(bLeaf);

    // 喇叭外翻导向口
    const lipGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 0.008, 8);
    lipGeo.rotateZ(Math.PI / 2);
    const fLip = new THREE.Mesh(lipGeo, mat);
    fLip.position.set(0, 0.020, 0.0036);
    jawGroup.add(fLip);
    const bLip = new THREE.Mesh(lipGeo, mat);
    bLip.position.set(0, 0.020, -0.0036);
    jawGroup.add(bLip);

    // 整体拾取碰撞盒
    const hitGeo = new THREE.BoxGeometry(0.024, 0.028, 0.020);
    hitGeo.translate(0, 0.014, 0);
    const hitMesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    jawGroup.add(hitMesh);

    parent.add(jawGroup);
    return hitMesh;
  }

  // 构造纯黄铜滚花接线柱 (Knurled Brass Binding Post)
  private createKnurledTerminalPost(parent: THREE.Group, pos: THREE.Vector3, brassMat: THREE.Material, ringColor: number): void {
    const postGroup = new THREE.Group();
    postGroup.position.copy(pos);

    // 绝缘垫圈
    const ringGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.0024, 16);
    ringGeo.translate(0, 0.0012, 0);
    const ringMat = new THREE.MeshStandardMaterial({ color: ringColor, roughness: 0.3 });
    postGroup.add(new THREE.Mesh(ringGeo, ringMat));

    // 黄铜螺柱
    const studGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.018, 16);
    studGeo.translate(0, 0.009, 0);
    postGroup.add(new THREE.Mesh(studGeo, brassMat));

    // 黄铜滚花旋钮螺母
    const nutGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.008, 20);
    nutGeo.translate(0, 0.010, 0);
    postGroup.add(new THREE.Mesh(nutGeo, brassMat));

    // 4mm 香蕉插头插孔盲孔
    const holeGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, 12);
    holeGeo.translate(0, 0.016, 0);
    postGroup.add(new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x0f172a })));

    parent.add(postGroup);
  }

  private createKnurledPost(parent: THREE.Group, pos: THREE.Vector3, color: number): void {
    const brassMat = polishedGold(0xd4af37);
    this.createKnurledTerminalPost(parent, pos, brassMat, color);
  }

  // ================= 6. DIS 数字化微电流传感器 (Digital Current Sensor) =================
  private buildCurrentSensor(): void {
    const sensGroup = new THREE.Group();
    sensGroup.name = 'currentSensorGroup';
    this.currentSensorGroup = sensGroup;

    // 前排右侧操作区，世界坐标中心 (0.12, 0.022, 0.12)
    sensGroup.position.set(0.12, 0.022, 0.12);

    const bodyW = 0.120;
    const bodyH = 0.030;
    const bodyD = 0.086;

    // 传感器主体支架倾角总成（12° 人体工学仰角）
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.x = -Math.PI * 0.065;
    tiltGroup.position.set(0, bodyH * 0.45, 0);

    // 1. 阻燃工程白 ABS 外壳（带圆角倒角）
    const bodyGeo = createChamferedBoxGeometry(bodyW, bodyH, bodyD, 0.006, 0.0015);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.12, roughness: 0.30 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    tiltGroup.add(body);

    // 侧边防滑硅胶嵌条
    const gripGeo = new THREE.BoxGeometry(0.004, bodyH * 0.85, bodyD * 0.85);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.6 });
    const lGrip = new THREE.Mesh(gripGeo, gripMat);
    lGrip.position.set(-bodyW * 0.501, 0, 0);
    tiltGroup.add(lGrip);
    const rGrip = new THREE.Mesh(gripGeo, gripMat);
    rGrip.position.set(bodyW * 0.501, 0, 0);
    tiltGroup.add(rGrip);

    // 2. 液晶数显仪表屏（仅保留规范数字表头与 mA 单位，杜绝假英文）
    this.sensorDisplayCanvas = document.createElement('canvas');
    this.sensorDisplayCanvas.width = 384;
    this.sensorDisplayCanvas.height = 192;
    this.sensorDisplayTexture = new THREE.CanvasTexture(this.sensorDisplayCanvas);
    this.sensorDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderCurrentSensorDisplay(0.0);

    const dispGeo = new THREE.PlaneGeometry(0.084, 0.044);
    const dispMat = new THREE.MeshBasicMaterial({ map: this.sensorDisplayTexture, toneMapped: false });
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.position.set(0, bodyH * 0.5 + 0.001, 0.006);
    dispMesh.rotation.x = -Math.PI / 2;
    tiltGroup.add(dispMesh);

    // 3. 采样状态微型双色 LED 指示灯
    const ledGeo = new THREE.SphereGeometry(0.003, 16, 16);
    this.sensorLedMaterial = labGlow(0x38bdf8, 0.9);
    const ledMesh = new THREE.Mesh(ledGeo, this.sensorLedMaterial);
    ledMesh.position.set(0.046, bodyH * 0.5 + 0.002, 0.026);
    tiltGroup.add(ledMesh);

    // 4. 标准实验室 4mm 安全香蕉插座（红+正极输入、黑-负极输出）
    // 红（+正极）：世界坐标 (0.080, 0.046, 0.144)
    // 黑（-负极）：世界坐标 (0.120, 0.046, 0.144)
    this.createBindingPost(tiltGroup, new THREE.Vector3(-0.040, bodyH * 0.5, 0.026), 0xef4444);
    this.createBindingPost(tiltGroup, new THREE.Vector3(0.000, bodyH * 0.5, 0.026), 0x1e293b);

    // 5. 右侧示波器模拟信号 BNC 输出金属同轴端口
    const bncGroup = new THREE.Group();
    bncGroup.position.set(bodyW * 0.5 + 0.004, 0, -0.010);
    bncGroup.rotation.z = -Math.PI * 0.5;
    const bncMetalGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.010, 16);
    bncGroup.add(new THREE.Mesh(bncMetalGeo, anodizedAluminum(0x94a3b8)));
    tiltGroup.add(bncGroup);

    sensGroup.add(tiltGroup);
    this.group.add(sensGroup);
  }

  private renderCurrentSensorDisplay(currentMa: number): void {
    const ctx = this.sensorDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.sensorDisplayCanvas.width;
    const h = this.sensorDisplayCanvas.height;

    ctx.fillStyle = '#051410';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
    ctx.lineWidth = 3;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }

    if (typeof ctx.fillText === 'function') {
      // 瞬时测量电流大字高精度数显
      const isCharging = currentMa > 0.01;
      const isDischarging = currentMa < -0.01;
      ctx.fillStyle = isCharging ? '#38bdf8' : isDischarging ? '#f59e0b' : '#4ade80';
      ctx.font = '700 80px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const sign = currentMa > 0 ? '+' : '';
      ctx.fillText(`${sign}${currentMa.toFixed(2)}`, w - 90, h * 0.55);

      ctx.font = '600 36px monospace';
      ctx.fillText('mA', w - 24, h * 0.55);
    }

    this.sensorDisplayTexture.needsUpdate = true;
  }

  // ================= 7. 台式数字存储示波器 (Benchtop DSO) =================
  private buildOscilloscope(): void {
    const oGroup = new THREE.Group();
    // 右后方仪器区，世界坐标中心 (0.30, 0.022, -0.07)
    oGroup.position.set(0.30, 0.022, -0.07);
    oGroup.rotation.y = -0.18;

    const chassisGroup = new THREE.Group();
    chassisGroup.rotation.x = -Math.PI * 0.11; // 18° 人体工学仰角
    chassisGroup.position.y = 0.058;

    const bodyW = 0.20;
    const bodyH = 0.13;
    const bodyD = 0.08;

    // 机壳主体：倒角仪器白机身
    const bodyGeo = createChamferedBoxGeometry(bodyW, bodyH, bodyD, 0.008, 0.002);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.14, roughness: 0.30 });
    this.scopeChassisMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.scopeChassisMesh.castShadow = true;
    this.scopeChassisMesh.receiveShadow = true;
    chassisGroup.add(this.scopeChassisMesh);

    // 侧边防撞包角 (深海钴蓝工业弹性包角)
    const bumperGeo = createChamferedBoxGeometry(0.008, bodyH + 0.002, bodyD + 0.002, 0.003, 0.001);
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.1, roughness: 0.35 });
    const lBumper = new THREE.Mesh(bumperGeo, bumperMat);
    lBumper.position.set(-bodyW * 0.5 - 0.003, 0, 0);
    chassisGroup.add(lBumper);
    const rBumper = new THREE.Mesh(bumperGeo, bumperMat);
    rBumper.position.set(bodyW * 0.5 + 0.003, 0, 0);
    chassisGroup.add(rBumper);

    // 顶部便携折叠提手
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.065, bodyH * 0.5 + 0.004, 0),
      new THREE.Vector3(-0.052, bodyH * 0.5 + 0.026, 0),
      new THREE.Vector3(0.052, bodyH * 0.5 + 0.026, 0),
      new THREE.Vector3(0.065, bodyH * 0.5 + 0.004, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 20, 0.004, 10, false);
    chassisGroup.add(new THREE.Mesh(handleGeo, anodizedAluminum(0x94a3b8)));

    // 屏幕深黑边框与高分辨率液晶显示屏
    const bezelGeo = new THREE.PlaneGeometry(0.146, 0.098);
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(-0.020, 0.004, bodyD * 0.5 + 0.001);
    chassisGroup.add(bezel);

    this.scopeDisplayCanvas = document.createElement('canvas');
    this.scopeDisplayCanvas.width = 1024;
    this.scopeDisplayCanvas.height = 640;
    this.scopeDisplayTexture = new THREE.CanvasTexture(this.scopeDisplayCanvas);
    this.scopeDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderOscilloscopeDisplay(undefined, []);

    const screenGeo = new THREE.PlaneGeometry(0.142, 0.094);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.scopeDisplayTexture, toneMapped: false });
    this.scopeScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.scopeScreenMesh.position.set(-0.020, 0.004, bodyD * 0.5 + 0.002);
    this.scopeScreenMesh.name = 'scopeScreenMesh';
    chassisGroup.add(this.scopeScreenMesh);

    // 控制区旋钮与按键
    const knobGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.010, 20);
    knobGeo.rotateX(Math.PI / 2);
    const knobMat = anodizedAluminum(0x64748b, 0.2);

    const timeKnob = new THREE.Mesh(knobGeo, knobMat);
    timeKnob.position.set(0.070, 0.034, bodyD * 0.5 + 0.005);
    chassisGroup.add(timeKnob);

    const voltKnob = new THREE.Mesh(knobGeo, knobMat);
    voltKnob.position.set(0.070, 0.006, bodyD * 0.5 + 0.005);
    chassisGroup.add(voltKnob);

    const runBtnGeo = new THREE.BoxGeometry(0.015, 0.010, 0.006);
    this.scopeRunBtnMesh = new THREE.Mesh(runBtnGeo, labGlow(0x10b981, 0.85));
    this.scopeRunBtnMesh.position.set(0.070, -0.022, bodyD * 0.5 + 0.004);
    this.scopeRunBtnMesh.name = 'scopeRunBtn';
    chassisGroup.add(this.scopeRunBtnMesh);

    const clearBtnGeo = new THREE.BoxGeometry(0.015, 0.009, 0.006);
    this.scopeClearBtnMesh = new THREE.Mesh(clearBtnGeo, new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 }));
    this.scopeClearBtnMesh.position.set(0.070, -0.037, bodyD * 0.5 + 0.004);
    this.scopeClearBtnMesh.name = 'scopeClearBtn';
    chassisGroup.add(this.scopeClearBtnMesh);

    // CH1 输入 BNC 金属同轴插座
    const bncOuterGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.012, 16);
    bncOuterGeo.rotateX(Math.PI / 2);
    const bncMesh = new THREE.Mesh(bncOuterGeo, anodizedAluminum(0x94a3b8));
    bncMesh.position.set(0.070, -0.051, bodyD * 0.5 + 0.005);
    chassisGroup.add(bncMesh);

    oGroup.add(chassisGroup);
    this.group.add(oGroup);

    // 示波器专用高频探头屏蔽线（自电流传感器 BNC 连接至示波器 CH1）
    const bncCablePts = [
      new THREE.Vector3(0.180, 0.036, 0.115),
      new THREE.Vector3(0.220, 0.028, 0.090),
      new THREE.Vector3(0.280, 0.028, 0.040),
      new THREE.Vector3(0.358, 0.046, -0.005),
    ];
    this.addJumperTube(bncCablePts, 0x1e293b);
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

    // 暗青荧光网格 (10 竖格 x 8 横格)
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

    // 坐标极值计算
    const tMin = samples.length > 0 ? samples[0].time : 0;
    const tLatest = samples.length > 0 ? samples[samples.length - 1].time : 5;
    const tWindow = Math.max(5.0, tLatest - tMin);

    const peak = Math.max(12.0, telemetry?.peakChargeCurrentMa ?? 0, telemetry?.peakDischargeCurrentMa ?? 0);
    const limit = Math.ceil(peak * 1.25);
    const yMin = -limit;
    const yMax = limit;

    const toScreenX = (t: number) => padLeft + ((t - tMin) / tWindow) * plotW;
    const toScreenY = (val: number) => padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

    // 零基准虚线 (I = 0)
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

    // 坐标轴刻度与规范读数
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

    // 绘制连续电流曲线 (I-t)
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

        // 积分阴影发光面积
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

      // 扫描头高亮圆点
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

  // ================= 8. 真实实验室 4mm 叠插香蕉插头导线与电流动态粒子流系统 =================
  private buildWiresAndParticles(): void {
    // 严格消除穿模：所有坐标与接线柱插孔微米级对齐，电容负极采用真实叠插端子（垂直串联堆叠）
    // 导线1 (红): 稳压电源正极 -> 开关触点1 (左极接线柱)
    const wire1Pts = [
      new THREE.Vector3(-0.355, 0.046, -0.015),
      new THREE.Vector3(-0.320, 0.036, 0.035),
      new THREE.Vector3(-0.250, 0.028, 0.080),
      new THREE.Vector3(-0.200, 0.034, 0.125),
      new THREE.Vector3(-0.164, 0.046, 0.144),
    ];
    // 导线2 (青): 开关动触刀公共极 (中间公共极接线柱) -> 电流传感器正输入极
    const wire2Pts = [
      new THREE.Vector3(-0.110, 0.046, 0.144),
      new THREE.Vector3(-0.070, 0.030, 0.168),
      new THREE.Vector3(0.000, 0.028, 0.170),
      new THREE.Vector3(0.045, 0.032, 0.165),
      new THREE.Vector3(0.080, 0.046, 0.144),
    ];
    // 导线3 (蓝): 电流传感器负输出极 -> 电容器正极接线柱
    const wire3Pts = [
      new THREE.Vector3(0.120, 0.046, 0.144),
      new THREE.Vector3(0.150, 0.034, 0.110),
      new THREE.Vector3(0.168, 0.028, 0.035),
      new THREE.Vector3(0.162, 0.030, -0.020),
      new THREE.Vector3(0.154, 0.044, -0.048),
    ];
    // 导线4 (黑): 电容器负极接线柱 [底层主插头] -> 稳压电源负极接地回路线
    const wire4Pts = [
      new THREE.Vector3(0.086, 0.044, -0.048),
      new THREE.Vector3(0.050, 0.030, -0.130),
      new THREE.Vector3(-0.060, 0.026, -0.145),
      new THREE.Vector3(-0.180, 0.028, -0.135),
      new THREE.Vector3(-0.260, 0.034, -0.070),
      new THREE.Vector3(-0.285, 0.046, -0.005),
    ];

    // 放电回路特定导线
    // 导线5 (黄): 开关触点2 (放电侧右极接线柱) -> 滑动变阻器滑杆端子 C
    const wire5Pts = [
      new THREE.Vector3(-0.056, 0.046, 0.144),
      new THREE.Vector3(-0.035, 0.034, 0.090),
      new THREE.Vector3(-0.015, 0.028, 0.020),
      new THREE.Vector3(0.005, 0.036, -0.040),
      new THREE.Vector3(0.020, 0.076, -0.090),
    ];
    // 导线6 (黑): 滑动变阻器线圈起始端 A -> 电容器负极 [真实叠插于上层插头后孔中：高度抬升至 0.064，彻底杜绝穿模]
    const wire6Pts = [
      new THREE.Vector3(-0.150, 0.044, -0.070),
      new THREE.Vector3(-0.110, 0.030, -0.055),
      new THREE.Vector3(-0.020, 0.026, -0.050),
      new THREE.Vector3(0.040, 0.032, -0.050),
      new THREE.Vector3(0.086, 0.064, -0.048),
    ];

    // 创建柔性物理导线管体
    this.addJumperTube(wire1Pts, 0xef4444); // 红色电源正
    this.addJumperTube(wire2Pts, 0x38bdf8); // 青色传感器正
    this.addJumperTube(wire3Pts, 0x0284c7); // 钴蓝电容器正
    this.addJumperTube(wire4Pts, 0x334155); // 经典深灰回路线
    this.addJumperTube(wire5Pts, 0xf59e0b); // 琥珀黄放电线
    this.addJumperTube(wire6Pts, 0x334155); // 经典深灰回路线

    const upDir = new THREE.Vector3(0, 1, 0);
    const powerDir = new THREE.Vector3(0.15, 0, 0.988);

    // 为每根导线两端安装真实的 4mm 实验室叠插香蕉插头
    this.addBananaPlug(wire1Pts[0], powerDir, 0xef4444);
    this.addBananaPlug(wire1Pts[wire1Pts.length - 1], upDir, 0xef4444);

    this.addBananaPlug(wire2Pts[0], upDir, 0x38bdf8);
    this.addBananaPlug(wire2Pts[wire2Pts.length - 1], upDir, 0x38bdf8);

    this.addBananaPlug(wire3Pts[0], upDir, 0x0284c7);
    this.addBananaPlug(wire3Pts[wire3Pts.length - 1], upDir, 0x0284c7);

    // 电容器负极端：Wire 4 主插头插在接线柱上 (Y=0.044)，Wire 6 叠插头插在 Wire 4 尾部 (Y=0.064)
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

    // 镀金金属插针
    const pinGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.008, 12);
    pinGeo.translate(0, 0.004, 0);
    plugGroup.add(new THREE.Mesh(pinGeo, polishedGold(0xfde047)));

    // 绝缘塑胶外壳（带防滑凹槽）
    const handleGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.016, 16);
    handleGeo.translate(0, 0.016, 0);
    plugGroup.add(new THREE.Mesh(handleGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 })));

    // 柔性防弯折尾套
    const bootGeo = new THREE.CylinderGeometry(0.0028, 0.004, 0.005, 12);
    bootGeo.translate(0, 0.026, 0);
    plugGroup.add(new THREE.Mesh(bootGeo, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })));

    this.group.add(plugGroup);
  }

  private createBindingPost(parent: THREE.Group, pos: THREE.Vector3, color: number, isPanelMount = false): void {
    const postGroup = new THREE.Group();
    postGroup.position.copy(pos);
    if (isPanelMount) {
      postGroup.rotation.x = Math.PI * 0.5;
    }

    const postGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.014, 16);
    postGeo.translate(0, 0.007, 0);
    postGroup.add(new THREE.Mesh(postGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.35 })));

    const coreGeo = new THREE.CylinderGeometry(0.0024, 0.0024, 0.016, 12);
    coreGeo.translate(0, 0.008, 0);
    postGroup.add(new THREE.Mesh(coreGeo, polishedGold()));

    const holeGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.004, 12);
    holeGeo.translate(0, 0.0145, 0);
    postGroup.add(new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x0f172a })));

    parent.add(postGroup);
  }

  private addJumperTube(pts: THREE.Vector3[], color: number): void {
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 32, 0.0028, 8, false);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 });
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
    this.labelsGroup = new THREE.Group();
    this.labelsGroup.name = 'CapacitorDischargeLabels';
    this.labelsGroup.visible = false;
    this.group.add(this.labelsGroup);
  }

  // ================= 动态状态同步与渲染帧更新 =================
  public setSwitchPosition(pos: SwitchPosition, instant = false): void {
    this.lastSwitchPos = pos;
    if (pos === 'charge') {
      this.targetBladeAngle = -0.96; // 约 -55° 切入左侧中空双簧片内部（绝对位于底板上方，不穿模）
      this.triggerSpark();
    } else if (pos === 'discharge') {
      this.targetBladeAngle = 0.96;  // 约 +55° 切入右侧中空双簧片内部（绝对位于底板上方，不穿模）
      this.triggerSpark();
    } else {
      this.targetBladeAngle = 0;     // 中立断开 (0° 垂直挺立)
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
        this.sparkLight.position.set(-0.026, 0.022, -0.016);
      } else if (this.lastSwitchPos === 'discharge') {
        this.sparkLight.position.set(0.026, 0.022, -0.016);
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

      if (Math.abs(cur - this.lastRenderedCurrent) > 0.05 || telemetry.switchPosition !== this.lastSwitchPos) {
        this.lastRenderedCurrent = cur;
        this.renderCurrentSensorDisplay(cur);
      }
      if (Math.abs(supply - this.lastRenderedSupply) > 0.05 || Math.abs(cur - this.lastRenderedCurrent) > 0.05) {
        this.lastRenderedSupply = supply;
        const outCurrentA = (telemetry.switchPosition === 'charge' && cur > 0) ? cur / 1000 : 0.0;
        this.renderPowerSupplyDisplay(supply, outCurrentA);
      }

      // 4. 电容器静电场物理光晕强度随端电压动态起伏
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
      this.labelsGroup.visible = false;
    }
  }

  public dispose(): void {
    if (this.scopeDisplayTexture) {
      this.scopeDisplayTexture.dispose();
    }
    if (this.powerDisplayTexture) {
      this.powerDisplayTexture.dispose();
    }
    if (this.sensorDisplayTexture) {
      this.sensorDisplayTexture.dispose();
    }
    if (this.capLabelTexture) {
      this.capLabelTexture.dispose();
    }
    disposeObjectTree(this.group);
  }
}
