import * as THREE from 'three';
import {
  labMetal,
  labGlow,
  anodizedAluminum,
  polishedGold,
  enameledCopper,
  paintTexture,
} from './labKit.ts';
import { disposeObjectTree } from './disposeObject.ts';
import type { SwitchPosition, CapacitorTelemetry } from '../../physics/em/capacitorDischarge.ts';

export interface CapacitorDischargeBenchMeshOptions {
  voltageSupply?: number;
  capacitanceUf?: number;
  resistanceOhm?: number;
  showLabels?: boolean;
}

export class CapacitorDischargeBenchMesh {
  public group: THREE.Group;

  // 可交互 3D 目标（用于射线检测拾取与点击）
  public switchKnifeMesh!: THREE.Mesh;
  public switchLeftContactMesh!: THREE.Mesh;
  public switchRightContactMesh!: THREE.Mesh;
  public switchHandleMesh!: THREE.Mesh;
  public powerKnobMesh!: THREE.Mesh;
  public powerSwitchMesh!: THREE.Mesh;

  // 单刀双掷开关动触刀组件（围绕铰链轴平滑旋转）
  private switchLeverGroup!: THREE.Group;
  private currentBladeAngle = 0; // 弧度
  private targetBladeAngle = 0;

  // 动态数显纹理与画布
  private powerDisplayTexture!: THREE.CanvasTexture;
  private powerDisplayCanvas!: HTMLCanvasElement;
  private sensorDisplayTexture!: THREE.CanvasTexture;
  private sensorDisplayCanvas!: HTMLCanvasElement;
  private capDisplayTexture!: THREE.CanvasTexture;
  private capDisplayCanvas!: HTMLCanvasElement;

  // 电容器静电场光晕网格
  private capFieldHaloMesh!: THREE.Mesh;
  private capFieldHaloMaterial!: THREE.MeshStandardMaterial;

  // 电流传感器心跳指示灯
  private sensorLedMaterial!: THREE.MeshStandardMaterial;

  // 导线粒子流动态系统
  private chargeParticles!: THREE.Points;
  private dischargeParticles!: THREE.Points;
  private chargeParticleGeometry!: THREE.BufferGeometry;
  private dischargeParticleGeometry!: THREE.BufferGeometry;
  private chargeWireSplines: THREE.CatmullRomCurve3[] = [];
  private dischargeWireSplines: THREE.CatmullRomCurve3[] = [];
  private chargeParticleProgress: Float32Array = new Float32Array(0);
  private dischargeParticleProgress: Float32Array = new Float32Array(0);

  // 3D 浮动标牌组
  private labelsGroup: THREE.Group = new THREE.Group();
  private showLabels = true;

  // 瞬态火花闪烁效果
  private sparkLight!: THREE.PointLight;
  private sparkTimer = 0;

  // 状态缓存（降低无谓的纹理重绘）
  private lastRenderedCurrent = -99999;
  private lastRenderedVoltage = -99999;
  private lastRenderedSupply = -99999;
  private lastSwitchPos: SwitchPosition = 'neutral';
  private pulsePhase = 0;

  constructor(options: CapacitorDischargeBenchMeshOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'CapacitorDischargeBenchMesh';
    this.showLabels = options.showLabels ?? true;

    this.buildBaseboard();
    this.buildPowerSupply(options.voltageSupply ?? 10.0);
    this.buildSpdtSwitch();
    this.buildCapacitor(options.capacitanceUf ?? 1000.0);
    this.buildResistor(options.resistanceOhm ?? 1000.0);
    this.buildCurrentSensor();
    this.buildWiresAndParticles();
    this.buildLabels();

    // 默认掷向中立档位
    this.setSwitchPosition('neutral', true);
  }

  // ================= 1. 实验底板与丝印电路原理图 =================
  private buildBaseboard(): void {
    // 洁净现代实验室高精密绝缘台面（银白微磨砂高强度陶瓷复合底板）
    const baseGeo = new THREE.BoxGeometry(0.82, 0.024, 0.54);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.15,
      roughness: 0.28,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.012;
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // 四角减震防滑硅胶脚垫（浅灰防静电硅胶）
    const footGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });
    const footOffsets = [
      [-0.38, 0.006, -0.24],
      [0.38, 0.006, -0.24],
      [-0.38, 0.006, 0.24],
      [0.38, 0.006, 0.24],
    ];
    for (const [fx, fy, fz] of footOffsets) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, fy, fz);
      this.group.add(foot);
    }

    // 表面高分辨率物理丝印电路原理图（洁净白底配鲜艳科技蓝与琥珀金双回路走线）
    const schematicTexture = paintTexture(1024, 768, (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      // 外周防静电标定边框
      ctx.strokeStyle = 'rgba(2, 132, 199, 0.35)';
      ctx.lineWidth = 3;
      if (typeof ctx.strokeRect === 'function') {
        ctx.strokeRect(20, 20, w - 40, h - 40);
      }

      // 印刷电路走线图（高对比度科技走线）
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.55)';
      ctx.lineWidth = 2.5;

      // 标题与原理说明
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#0369a1';
        ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('RC CIRCUIT TRANSIENT EXPERIMENT STATION', 40, 56);

        ctx.fillStyle = '#475569';
        ctx.font = '500 14px monospace';
        ctx.fillText('RC 暂态充放电实验平台 | 严密符合: i(t) = (E/R)·exp(-t/RC)', 40, 80);

        // 回路标识
        ctx.fillStyle = '#0284c7';
        ctx.font = '700 15px monospace';
        ctx.fillText('← 充电回路 (CHARGE LOOP)', 80, 280);

        ctx.fillStyle = '#d97706';
        ctx.fillText('放电回路 (DISCHARGE LOOP) →', w - 320, 280);

        // 单刀双掷开关节点标识
        ctx.fillStyle = '#ca8a04';
        ctx.textAlign = 'center';
        ctx.font = '700 16px monospace';
        ctx.fillText('① 电源侧 (CHARGE)', w * 0.36, h * 0.72);
        ctx.fillText('② 放电侧 (DISCHARGE)', w * 0.60, h * 0.72);
        ctx.fillText('Ⓞ 动触刀公共极 (COMMON)', w * 0.48, h * 0.84);
      }

      // 绘制丝印原理走线
      ctx.beginPath();
      // 电源侧到开关触点1
      ctx.moveTo(w * 0.22, h * 0.42);
      ctx.lineTo(w * 0.36, h * 0.66);
      // 开关动刀端到电流传感器
      ctx.moveTo(w * 0.48, h * 0.78);
      ctx.lineTo(w * 0.65, h * 0.78);
      // 电流传感器到电容正极
      ctx.moveTo(w * 0.65, h * 0.78);
      ctx.lineTo(w * 0.52, h * 0.42);
      // 开关触点2到放电电阻
      ctx.moveTo(w * 0.60, h * 0.66);
      ctx.lineTo(w * 0.80, h * 0.42);
      // 接地公共回路线
      ctx.moveTo(w * 0.22, h * 0.32);
      ctx.lineTo(w * 0.80, h * 0.32);
      ctx.stroke();
    });

    const schemPlaneGeo = new THREE.PlaneGeometry(0.80, 0.52);
    const schemPlaneMat = new THREE.MeshBasicMaterial({
      map: schematicTexture,
      toneMapped: false,
    });
    const schemMesh = new THREE.Mesh(schemPlaneGeo, schemPlaneMat);
    schemMesh.rotation.x = -Math.PI / 2;
    schemMesh.position.y = 0.0242;
    this.group.add(schemMesh);
  }

  // ================= 2. 直流稳压电源 (DC Power Supply) =================
  private buildPowerSupply(initialVoltage: number): void {
    const pGroup = new THREE.Group();
    pGroup.position.set(-0.25, 0.08, -0.12);

    // 主机机箱外壳（Keysight/Tektronix 现代科研实验室高级仪器白哑光外壳）
    const caseGeo = new THREE.BoxGeometry(0.18, 0.12, 0.16);
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.18,
      roughness: 0.28,
    });
    const caseMesh = new THREE.Mesh(caseGeo, caseMat);
    caseMesh.castShadow = true;
    pGroup.add(caseMesh);

    // 机箱顶置便携提手
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.06, 0),
      new THREE.Vector3(-0.04, 0.09, 0),
      new THREE.Vector3(0.04, 0.09, 0),
      new THREE.Vector3(0.05, 0.06, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 16, 0.004, 8, false);
    const handleMat = anodizedAluminum(0x94a3b8);
    pGroup.add(new THREE.Mesh(handleGeo, handleMat));

    // 前面板浅色拉丝铝合金板
    const panelGeo = new THREE.PlaneGeometry(0.174, 0.114);
    const panelMat = anodizedAluminum(0xe2e8f0, 0.2);
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.set(0, 0, 0.0805);
    pGroup.add(panelMesh);

    // LED 高对比度荧光双排数显屏（显示输出设定电压和限流）
    this.powerDisplayCanvas = document.createElement('canvas');
    this.powerDisplayCanvas.width = 256;
    this.powerDisplayCanvas.height = 128;
    this.powerDisplayTexture = new THREE.CanvasTexture(this.powerDisplayCanvas);
    this.powerDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderPowerSupplyDisplay(initialVoltage, 1.0);

    const dispGeo = new THREE.PlaneGeometry(0.085, 0.045);
    const dispMat = new THREE.MeshBasicMaterial({
      map: this.powerDisplayTexture,
      toneMapped: false,
    });
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.position.set(-0.035, 0.022, 0.081);
    pGroup.add(dispMesh);

    // 稳压状态指示灯 (Green LED)
    const ledGeo = new THREE.SphereGeometry(0.004, 16, 16);
    const ledMat = labGlow(0x10b981, 0.9);
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(0.03, 0.032, 0.082);
    pGroup.add(ledMesh);

    // 电压调节金属滚花旋钮
    const knobGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.015, 24);
    const knobMat = anodizedAluminum(0xcfd8dc, 0.15);
    this.powerKnobMesh = new THREE.Mesh(knobGeo, knobMat);
    this.powerKnobMesh.rotation.x = Math.PI / 2;
    this.powerKnobMesh.position.set(0.05, 0.022, 0.088);
    this.powerKnobMesh.name = 'powerKnobMesh';
    pGroup.add(this.powerKnobMesh);

    // 电源船型开关（带红光透明外壳）
    const swBoxGeo = new THREE.BoxGeometry(0.018, 0.025, 0.01);
    const swMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xb91c1c,
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });
    this.powerSwitchMesh = new THREE.Mesh(swBoxGeo, swMat);
    this.powerSwitchMesh.position.set(0.05, -0.025, 0.085);
    this.powerSwitchMesh.name = 'powerSwitchMesh';
    pGroup.add(this.powerSwitchMesh);

    // 红黑香蕉头输出接线柱 (+) 和 (-)
    const postGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.022, 16);
    const redPostMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const blackPostMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.3 });

    const posPost = new THREE.Mesh(postGeo, redPostMat);
    posPost.rotation.x = Math.PI / 2;
    posPost.position.set(-0.045, -0.025, 0.09);
    pGroup.add(posPost);

    const negPost = new THREE.Mesh(postGeo, blackPostMat);
    negPost.rotation.x = Math.PI / 2;
    negPost.position.set(-0.015, -0.025, 0.09);
    pGroup.add(negPost);

    // 导电金属芯套
    const brassCoreGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.026, 12);
    const brassMat = polishedGold();
    const core1 = new THREE.Mesh(brassCoreGeo, brassMat);
    core1.rotation.x = Math.PI / 2;
    core1.position.copy(posPost.position);
    pGroup.add(core1);

    const core2 = new THREE.Mesh(brassCoreGeo, brassMat);
    core2.rotation.x = Math.PI / 2;
    core2.position.copy(negPost.position);
    pGroup.add(core2);

    this.group.add(pGroup);
  }

  private renderPowerSupplyDisplay(volts: number, amps: number): void {
    const ctx = this.powerDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.powerDisplayCanvas.width;
    const h = this.powerDisplayCanvas.height;

    ctx.fillStyle = '#05131f';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 3;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }

    if (typeof ctx.fillText === 'function') {
      // 电压读数 (Cyan LED)
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 48px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${volts.toFixed(2)}`, w - 48, 56);
      ctx.font = '600 24px monospace';
      ctx.fillText('V', w - 16, 56);

      // 电流上限读数 (Green LED)
      ctx.fillStyle = '#34d399';
      ctx.font = '700 36px monospace';
      ctx.fillText(`${amps.toFixed(2)}`, w - 48, 108);
      ctx.font = '600 20px monospace';
      ctx.fillText('A', w - 16, 108);

      // 标签
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 16px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('CV VOLT', 16, 48);
      ctx.fillText('CC CURR', 16, 100);
    }

    this.powerDisplayTexture.needsUpdate = true;
  }

  // ================= 3. 单刀双掷开关 (SPDT Knife Switch) =================
  private buildSpdtSwitch(): void {
    const sGroup = new THREE.Group();
    sGroup.position.set(-0.05, 0.024, 0.10);

    // 高透晶莹光学压克力 / 聚碳酸酯透明绝缘底座（剔除沉闷黑色，晶莹剔透）
    const baseGeo = new THREE.BoxGeometry(0.18, 0.016, 0.12);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      metalness: 0.08,
      roughness: 0.08,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.008;
    sGroup.add(baseMesh);

    // 三对璀璨黄铜接线柱与触夹
    const postGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.022, 16);
    const brassMat = polishedGold(0xfacc15);

    // 触夹夹片几何体 (U型弹性接触簧片)
    const jawGeo = new THREE.BoxGeometry(0.012, 0.026, 0.014);

    // ① 左侧触夹 (电源侧 - CHARGE)
    this.switchLeftContactMesh = new THREE.Mesh(jawGeo, brassMat);
    this.switchLeftContactMesh.position.set(-0.06, 0.026, 0);
    this.switchLeftContactMesh.name = 'switchLeftContact';
    sGroup.add(this.switchLeftContactMesh);

    const post1 = new THREE.Mesh(postGeo, brassMat);
    post1.position.set(-0.06, 0.018, 0.038);
    sGroup.add(post1);

    // ② 右侧触夹 (放电侧 - DISCHARGE)
    this.switchRightContactMesh = new THREE.Mesh(jawGeo, brassMat);
    this.switchRightContactMesh.position.set(0.06, 0.026, 0);
    this.switchRightContactMesh.name = 'switchRightContact';
    sGroup.add(this.switchRightContactMesh);

    const post2 = new THREE.Mesh(postGeo, brassMat);
    post2.position.set(0.06, 0.018, 0.038);
    sGroup.add(post2);

    // ⓪ 中间铰链公共端支架 (PIVOT - COMMON)
    const pivotHingeGeo = new THREE.BoxGeometry(0.016, 0.028, 0.016);
    const pivotHinge = new THREE.Mesh(pivotHingeGeo, brassMat);
    pivotHinge.position.set(0, 0.024, 0);
    sGroup.add(pivotHinge);

    const post0 = new THREE.Mesh(postGeo, brassMat);
    post0.position.set(0, 0.018, 0.038);
    sGroup.add(post0);

    // 动触刀旋转总成（围绕 Z 轴摆动：左负角度/右正角度）
    this.switchLeverGroup = new THREE.Group();
    // 旋转轴心位于中间铰链顶部
    this.switchLeverGroup.position.set(0, 0.032, 0);

    // 导电黄金/黄铜闸刀本体
    const bladeGeo = new THREE.BoxGeometry(0.006, 0.065, 0.012);
    // 将刀片几何中心向上偏移，使得旋转轴心在刀片根部
    bladeGeo.translate(0, 0.030, 0);
    const bladeMat = polishedGold(0xfde047);
    this.switchKnifeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    this.switchKnifeMesh.name = 'switchKnifeBlade';
    this.switchLeverGroup.add(this.switchKnifeMesh);

    // 鲜明高光红玛瑙绝缘握持手柄（鲜明大方，操作清晰）
    const handleGeo = new THREE.CylinderGeometry(0.009, 0.008, 0.040, 16);
    handleGeo.translate(0, 0.082, 0);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.22,
      metalness: 0.12,
    });
    this.switchHandleMesh = new THREE.Mesh(handleGeo, handleMat);
    this.switchHandleMesh.name = 'switchHandle';
    this.switchLeverGroup.add(this.switchHandleMesh);

    sGroup.add(this.switchLeverGroup);

    // 动触点闭合瞬态电弧闪烁点光源
    this.sparkLight = new THREE.PointLight(0x67e8f9, 0, 0.35);
    this.sparkLight.position.set(0, 0.04, 0);
    sGroup.add(this.sparkLight);

    this.group.add(sGroup);
  }

  // ================= 4. 电容器 (Capacitor) =================
  private buildCapacitor(initialUf: number): void {
    const cGroup = new THREE.Group();
    cGroup.position.set(0.05, 0.024, -0.12);

    // 洁净实验室高品质浅色支座
    const mountGeo = new THREE.BoxGeometry(0.12, 0.016, 0.12);
    const mountMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const mount = new THREE.Mesh(mountGeo, mountMat);
    mount.position.y = 0.008;
    cGroup.add(mount);

    // 高耐压铝电解电容圆柱体
    const capRadius = 0.038;
    const capHeight = 0.095;
    const capGeo = new THREE.CylinderGeometry(capRadius, capRadius, capHeight, 32);
    capGeo.translate(0, capHeight * 0.5 + 0.016, 0);

    // 耀眼高品质金属电容电镀蓝外壳 (Electric Sapphire Blue)
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.72,
      roughness: 0.22,
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    cGroup.add(capMesh);

    // 电容器铝制防爆顶盖
    const topCapGeo = new THREE.CylinderGeometry(capRadius * 0.98, capRadius * 0.98, 0.004, 32);
    topCapGeo.translate(0, capHeight + 0.016, 0);
    const topCapMat = anodizedAluminum(0xf1f5f9);
    cGroup.add(new THREE.Mesh(topCapGeo, topCapMat));

    // 极性与规格印刷纹理丝印贴纸（缠绕于圆柱体正面）
    const labelTexture = paintTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#172554';
      ctx.fillRect(0, 0, w, h);

      // 负极条带（白色竖条带配虚线 '-' 标识）
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(30, 0, 48, h);
      ctx.fillStyle = '#0f172a';
      if (typeof ctx.fillText === 'function') {
        for (let y = 40; y < h; y += 60) {
          ctx.fillText('—', 54, y);
        }
      }

      // 规格文字
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 32px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${initialUf.toFixed(0)} µF`, 110, 80);

        ctx.font = '600 22px monospace';
        ctx.fillText('25V WV  105°C', 110, 125);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '500 16px -apple-system, sans-serif';
        ctx.fillText('HIGH-GRADE ENERGY STORAGE', 110, 165);
        ctx.fillText('RC LAB STANDARD CAPACITOR', 110, 195);
      }
    });

    const wrapGeo = new THREE.CylinderGeometry(capRadius + 0.0005, capRadius + 0.0005, 0.07, 32, 1, true, -Math.PI * 0.6, Math.PI * 1.2);
    wrapGeo.translate(0, 0.065, 0);
    const wrapMat = new THREE.MeshBasicMaterial({
      map: labelTexture,
      side: THREE.DoubleSide,
    });
    cGroup.add(new THREE.Mesh(wrapGeo, wrapMat));

    // 电极引脚端子：(+) 正极红柱、(-) 负极柱
    const postGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 16);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5 });

    const posTerm = new THREE.Mesh(postGeo, redMat);
    posTerm.position.set(-0.016, capHeight + 0.026, 0);
    cGroup.add(posTerm);

    const negTerm = new THREE.Mesh(postGeo, blackMat);
    negTerm.position.set(0.016, capHeight + 0.026, 0);
    cGroup.add(negTerm);

    // 电容器微型数显面板（实时显示电容端电压 U_c 和储存电能 E_c）
    this.capDisplayCanvas = document.createElement('canvas');
    this.capDisplayCanvas.width = 256;
    this.capDisplayCanvas.height = 128;
    this.capDisplayTexture = new THREE.CanvasTexture(this.capDisplayCanvas);
    this.capDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderCapacitorDisplay(0.0, 0.0);

    const capDispGeo = new THREE.PlaneGeometry(0.09, 0.045);
    const capDispMat = new THREE.MeshBasicMaterial({
      map: this.capDisplayTexture,
      toneMapped: false,
    });
    const capDispMesh = new THREE.Mesh(capDispGeo, capDispMat);
    capDispMesh.position.set(0, 0.035, 0.0605);
    cGroup.add(capDispMesh);

    // 静电场光晕效果网格（外层半透明脉冲光罩，电荷充入时发光增强）
    const haloGeo = new THREE.CylinderGeometry(capRadius * 1.15, capRadius * 1.15, capHeight * 1.05, 24);
    haloGeo.translate(0, capHeight * 0.5 + 0.016, 0);
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

  private renderCapacitorDisplay(volts: number, mJ: number): void {
    const ctx = this.capDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.capDisplayCanvas.width;
    const h = this.capDisplayCanvas.height;

    ctx.fillStyle = '#071526';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(14, 165, 233, 0.45)';
    ctx.lineWidth = 3;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }

    if (typeof ctx.fillText === 'function') {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 36px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${volts.toFixed(2)} V`, w - 16, 50);

      ctx.fillStyle = '#fbbf24';
      ctx.font = '600 28px monospace';
      ctx.fillText(`${mJ.toFixed(1)} mJ`, w - 16, 95);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 16px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Uc', 16, 48);
      ctx.fillText('Ec', 16, 92);
    }

    this.capDisplayTexture.needsUpdate = true;
  }

  // ================= 5. 放电电阻 (Discharge Resistor) =================
  private buildResistor(resistanceOhm: number): void {
    const rGroup = new THREE.Group();
    rGroup.position.set(0.26, 0.024, -0.12);

    // 洁净白陶瓷绝缘安装支座
    const mountGeo = new THREE.BoxGeometry(0.14, 0.016, 0.08);
    const mountMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.15,
      roughness: 0.25,
    });
    const mount = new THREE.Mesh(mountGeo, mountMat);
    mount.position.y = 0.008;
    rGroup.add(mount);

    // 金色阳极氧化铝外壳线绕大功率电阻（带多道高效散热鳍片）
    const shellGeo = new THREE.BoxGeometry(0.085, 0.024, 0.032);
    shellGeo.translate(0, 0.028, 0);
    const shellMat = anodizedAluminum(0xf59e0b, 0.25);
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    rGroup.add(shellMesh);

    // 散热鳍片 (Heat sink fins)
    const finGeo = new THREE.BoxGeometry(0.004, 0.034, 0.036);
    for (let i = -6; i <= 6; i++) {
      const fin = new THREE.Mesh(finGeo, shellMat);
      fin.position.set(i * 0.006, 0.028, 0);
      rGroup.add(fin);
    }

    // 两端陶瓷绝缘封头与引脚端子
    const endGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.012, 16);
    const endMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });

    const leftEnd = new THREE.Mesh(endGeo, endMat);
    leftEnd.rotation.z = Math.PI / 2;
    leftEnd.position.set(-0.048, 0.028, 0);
    rGroup.add(leftEnd);

    const rightEnd = new THREE.Mesh(endGeo, endMat);
    rightEnd.rotation.z = Math.PI / 2;
    rightEnd.position.set(0.048, 0.028, 0);
    rGroup.add(rightEnd);

    // 镀银香蕉孔接线端子
    const termGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.018, 16);
    const termMat = polishedGold();
    const t1 = new THREE.Mesh(termGeo, termMat);
    t1.position.set(-0.052, 0.036, 0);
    rGroup.add(t1);

    const t2 = new THREE.Mesh(termGeo, termMat);
    t2.position.set(0.052, 0.036, 0);
    rGroup.add(t2);

    // 电阻铭牌标签
    const labelTexture = paintTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(0, 0, w, h);
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${resistanceOhm.toFixed(0)} Ω`, w / 2, 45);
        ctx.font = '600 20px monospace';
        ctx.fillText('50W  ±1%', w / 2, 85);
        ctx.font = '500 14px sans-serif';
        ctx.fillText('CERAMIC WIREWOUND', w / 2, 112);
      }
    });

    const plateGeo = new THREE.PlaneGeometry(0.065, 0.026);
    const plateMat = new THREE.MeshBasicMaterial({ map: labelTexture });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(0, 0.028, 0.0165);
    rGroup.add(plateMesh);

    this.group.add(rGroup);
  }

  // ================= 6. 电流传感器 (Current Sensor) =================
  private buildCurrentSensor(): void {
    const sensGroup = new THREE.Group();
    sensGroup.position.set(0.18, 0.024, 0.10);

    // 传感器外壳（现代科研修长外壳，高质感珍珠白机身）
    const bodyGeo = new THREE.BoxGeometry(0.14, 0.032, 0.10);
    bodyGeo.translate(0, 0.016, 0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.22,
      roughness: 0.28,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    sensGroup.add(body);

    // 倾斜高亮 LCD/OLED 显示屏
    this.sensorDisplayCanvas = document.createElement('canvas');
    this.sensorDisplayCanvas.width = 320;
    this.sensorDisplayCanvas.height = 160;
    this.sensorDisplayTexture = new THREE.CanvasTexture(this.sensorDisplayCanvas);
    this.sensorDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderCurrentSensorDisplay(0.0, 'neutral');

    const dispGeo = new THREE.PlaneGeometry(0.09, 0.045);
    const dispMat = new THREE.MeshBasicMaterial({
      map: this.sensorDisplayTexture,
      toneMapped: false,
    });
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.rotation.x = -Math.PI * 0.15;
    dispMesh.position.set(0, 0.033, 0.005);
    sensGroup.add(dispMesh);

    // 状态与采样指示灯 (Blue / Cyan LED)
    const ledGeo = new THREE.SphereGeometry(0.004, 16, 16);
    this.sensorLedMaterial = labGlow(0x38bdf8, 0.8);
    const ledMesh = new THREE.Mesh(ledGeo, this.sensorLedMaterial);
    ledMesh.position.set(0.052, 0.034, 0.032);
    sensGroup.add(ledMesh);

    // 信号输入/输出香蕉接线插座：红 (+) 正输入端、灰黑 (-) 负输出端
    const socketGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.016, 16);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.3 });

    const redSocket = new THREE.Mesh(socketGeo, redMat);
    redSocket.position.set(-0.045, 0.038, 0.032);
    sensGroup.add(redSocket);

    const blackSocket = new THREE.Mesh(socketGeo, blackMat);
    blackSocket.position.set(0.045, 0.038, 0.032);
    sensGroup.add(blackSocket);

    this.group.add(sensGroup);
  }

  private renderCurrentSensorDisplay(currentMa: number, state: SwitchPosition): void {
    const ctx = this.sensorDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.sensorDisplayCanvas.width;
    const h = this.sensorDisplayCanvas.height;

    // 暗黑荧光仪表屏
    ctx.fillStyle = '#02120a';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
    ctx.lineWidth = 3;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }

    if (typeof ctx.fillText === 'function') {
      // 头部标识
      ctx.fillStyle = '#4ade80';
      ctx.font = '700 18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('CURRENT SENSOR ±50mA', 16, 28);

      // 瞬态电流大字读数
      const isCharging = currentMa > 0.01;
      const isDischarging = currentMa < -0.01;
      ctx.fillStyle = isCharging ? '#38bdf8' : isDischarging ? '#f59e0b' : '#4ade80';
      ctx.font = '700 46px monospace';
      ctx.textAlign = 'right';

      const sign = currentMa > 0 ? '+' : '';
      ctx.fillText(`${sign}${currentMa.toFixed(2)}`, w - 60, 85);
      ctx.font = '600 24px monospace';
      ctx.fillText('mA', w - 16, 85);

      // 流向指示
      ctx.font = '600 16px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      let stateText = '断开 / IDLE';
      if (state === 'charge') stateText = '⚡ 充电中 (I > 0)';
      else if (state === 'discharge') stateText = '🔄 放电中 (I < 0)';
      ctx.fillText(stateText, 16, 135);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(74, 222, 128, 0.8)';
      ctx.fillText('100Hz SAMPLING', w - 16, 135);
    }

    this.sensorDisplayTexture.needsUpdate = true;
  }

  // ================= 7. 回路导线与电流动态粒子流系统 =================
  private buildWiresAndParticles(): void {
    // 充电回路导线路径点（CatmullRom 曲线）
    // 导线1 (红): 电源正极 -> 开关触点1 (电源侧)
    const wire1Pts = [
      new THREE.Vector3(-0.295, 0.055, -0.03),
      new THREE.Vector3(-0.25, 0.09, 0.02),
      new THREE.Vector3(-0.16, 0.07, 0.08),
      new THREE.Vector3(-0.11, 0.05, 0.10),
    ];
    // 导线2 (红/蓝): 开关动触刀公共极 -> 电流传感器正输入极
    const wire2Pts = [
      new THREE.Vector3(-0.05, 0.045, 0.138),
      new THREE.Vector3(0.02, 0.08, 0.16),
      new THREE.Vector3(0.08, 0.08, 0.16),
      new THREE.Vector3(0.135, 0.06, 0.132),
    ];
    // 导线3 (蓝): 电流传感器负输出极 -> 电容器正极
    const wire3Pts = [
      new THREE.Vector3(0.225, 0.06, 0.132),
      new THREE.Vector3(0.20, 0.09, 0.04),
      new THREE.Vector3(0.12, 0.11, -0.04),
      new THREE.Vector3(0.034, 0.125, -0.12),
    ];
    // 导线4 (黑): 电容器负极 -> 电源负极接地回路线
    const wire4Pts = [
      new THREE.Vector3(0.066, 0.125, -0.12),
      new THREE.Vector3(0.02, 0.08, -0.18),
      new THREE.Vector3(-0.12, 0.07, -0.19),
      new THREE.Vector3(-0.265, 0.055, -0.03),
    ];

    // 放电回路特定导线
    // 导线5 (黄): 开关触点2 (放电侧) -> 放电电阻左端
    const wire5Pts = [
      new THREE.Vector3(0.01, 0.05, 0.10),
      new THREE.Vector3(0.09, 0.08, 0.06),
      new THREE.Vector3(0.16, 0.09, -0.02),
      new THREE.Vector3(0.208, 0.06, -0.12),
    ];
    // 导线6 (黑): 放电电阻右端 -> 电容器负极公用地线
    const wire6Pts = [
      new THREE.Vector3(0.312, 0.06, -0.12),
      new THREE.Vector3(0.24, 0.05, -0.18),
      new THREE.Vector3(0.14, 0.06, -0.18),
      new THREE.Vector3(0.066, 0.125, -0.12),
    ];

    // 创建 3D 硅胶绝缘实心导线网格
    this.addJumperTube(wire1Pts, 0xef4444); // 红色电源正
    this.addJumperTube(wire2Pts, 0x38bdf8); // 蓝色传感器正
    this.addJumperTube(wire3Pts, 0x0284c7); // 钴蓝电容器正
    this.addJumperTube(wire4Pts, 0x94a3b8); // 银灰色洁净硅胶公共回路
    this.addJumperTube(wire5Pts, 0xf59e0b); // 琥珀橙放电线
    this.addJumperTube(wire6Pts, 0x94a3b8); // 银灰色洁净硅胶公共回路

    // 导线样条曲线对象，用于粒子沿线巡游
    this.chargeWireSplines = [
      new THREE.CatmullRomCurve3(wire1Pts),
      new THREE.CatmullRomCurve3(wire2Pts),
      new THREE.CatmullRomCurve3(wire3Pts),
      new THREE.CatmullRomCurve3(wire4Pts),
    ];

    this.dischargeWireSplines = [
      // 放电时电流自电容器正极经导线3逆流回传感器，再流经导线2至开关，再经导线5到电阻，再经导线6回电容负极
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
      size: 0.008,
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
      size: 0.008,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dischargeParticles = new THREE.Points(this.dischargeParticleGeometry, dischargeParticleMat);
    this.group.add(this.dischargeParticles);
  }

  private addJumperTube(pts: THREE.Vector3[], color: number): void {
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 32, 0.0032, 8, false);
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

  // ================= 8. 3D 浮动标识牌 =================
  private buildLabels(): void {
    this.labelsGroup = new THREE.Group();
    this.labelsGroup.name = 'CapacitorDischargeLabels';

    const labels = [
      { text: '直流稳压电源 (10V)', pos: new THREE.Vector3(-0.25, 0.17, -0.12), color: '#0284c7' },
      { text: '单刀双掷开关 (SPDT)', pos: new THREE.Vector3(-0.05, 0.13, 0.10), color: '#d97706' },
      { text: '储能电容器 (1000µF)', pos: new THREE.Vector3(0.05, 0.19, -0.12), color: '#0284c7' },
      { text: '放电电阻 (1000Ω)', pos: new THREE.Vector3(0.26, 0.12, -0.12), color: '#d97706' },
      { text: '高灵敏度电流传感器', pos: new THREE.Vector3(0.18, 0.11, 0.10), color: '#059669' },
    ];

    for (const item of labels) {
      const tex = paintTexture(384, 96, (ctx, w, h) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.45)';
        ctx.lineWidth = 3;
        if (typeof ctx.strokeRect === 'function') {
          ctx.strokeRect(4, 4, w - 8, h - 8);
        }
        if (typeof ctx.fillText === 'function') {
          ctx.fillStyle = '#0f172a';
          ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.text, w / 2, h / 2);
        }
      });

      const planeGeo = new THREE.PlaneGeometry(0.14, 0.035);
      const planeMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(planeGeo, planeMat);
      plane.position.copy(item.pos);
      this.labelsGroup.add(plane);
    }

    this.labelsGroup.visible = this.showLabels;
    this.group.add(this.labelsGroup);
  }

  // ================= 动态状态同步与渲染帧更新 =================
  /**
   * 设置单刀双掷开关位置，并触发动触刀摆动动画
   */
  public setSwitchPosition(pos: SwitchPosition, instant = false): void {
    this.lastSwitchPos = pos;
    if (pos === 'charge') {
      this.targetBladeAngle = -Math.PI * 0.20; // 掷向左侧电源触点
      this.triggerSpark();
    } else if (pos === 'discharge') {
      this.targetBladeAngle = Math.PI * 0.20;  // 掷向右侧放电触点
      this.triggerSpark();
    } else {
      this.targetBladeAngle = 0;               // 中立断开
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
      this.sparkLight.intensity = 2.5;
      this.sparkTimer = 0.08;
    }
  }

  public update(delta: number, telemetry?: CapacitorTelemetry): void {
    this.pulsePhase += delta * 6.0;

    // 1. 动触刀物理平滑摆动 (弹性阻尼平滑插值)
    const angleDiff = this.targetBladeAngle - this.currentBladeAngle;
    if (Math.abs(angleDiff) > 0.001) {
      const step = angleDiff * Math.min(1.0, delta * 18.0);
      this.currentBladeAngle += step;
      this.switchLeverGroup.rotation.z = this.currentBladeAngle;
    }

    // 2. 电弧闪烁消退
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

      // 仅在数值变化超过阈值时重绘数显纹理，避免 60fps 重绘制卡顿
      if (Math.abs(cur - this.lastRenderedCurrent) > 0.05 || telemetry.switchPosition !== this.lastSwitchPos) {
        this.lastRenderedCurrent = cur;
        this.renderCurrentSensorDisplay(cur, telemetry.switchPosition);
      }
      if (Math.abs(vol - this.lastRenderedVoltage) > 0.05) {
        this.lastRenderedVoltage = vol;
        this.renderCapacitorDisplay(vol, telemetry.energyMilliJoule);
      }
      if (Math.abs(supply - this.lastRenderedSupply) > 0.05) {
        this.lastRenderedSupply = supply;
        this.renderPowerSupplyDisplay(supply, 1.0);
      }

      // 4. 电容器静电场光晕强度随端电压动态起伏
      const chargeRatio = Math.max(0, Math.min(1.0, vol / Math.max(1.0, supply)));
      this.capFieldHaloMaterial.opacity = chargeRatio * 0.45;
      this.capFieldHaloMaterial.emissiveIntensity = chargeRatio * (0.8 + 0.2 * Math.sin(this.pulsePhase));

      // 5. 传感器采样指示灯脉冲呼吸
      this.sensorLedMaterial.emissiveIntensity = 0.4 + 0.5 * Math.abs(Math.sin(this.pulsePhase * 1.5));

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
    }
  }

  public setLabelsVisible(visible: boolean): void {
    this.showLabels = visible;
    if (this.labelsGroup) {
      this.labelsGroup.visible = visible;
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
