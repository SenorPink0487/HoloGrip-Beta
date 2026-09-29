import * as THREE from 'three';
import { HallCarrierParticleSystem, type CarrierType } from './HallCarrierParticleSystem.ts';
import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export interface HallBenchMeshOptions {
  waferLength?: number;    // 沿X轴（长度/宽度）
  waferHeight?: number;    // 沿Y轴（高度）
  waferThickness?: number; // 沿Z轴（厚度）
  waferWidth?: number;     // waferHeight的向后兼容别名
  computeBridge?: ComputeBridge;
}

export class HallBenchMesh {
  public group: THREE.Group;
  public particleSystem: HallCarrierParticleSystem;

  // 晶圆网格引用，用于点击与悬停交互
  public waferMesh: THREE.Mesh;
  private waferMaterial: THREE.MeshStandardMaterial;

  // 实心半导体基底（不透明晶体基座）
  public substrateMesh: THREE.Mesh;
  private substrateMaterial: THREE.MeshStandardMaterial;
  private substrateTextures: Record<string, THREE.CanvasTexture> = {};

  // 样品室
  private chamberGroup: THREE.Group;
  private crystalBoxMesh: THREE.Mesh;
  private crystalMaterial: THREE.MeshStandardMaterial;

  // 磁力线（严格由磁场B驱动的全息磁通流线）
  private fluxArrowsGroup: THREE.Group;
  private fluxArrowMeshes: { group: THREE.Group; shaft: THREE.Mesh; cone: THREE.Mesh; baseY: number; baseZ: number }[] = [];
  private fluxArrowMat: THREE.MeshStandardMaterial;
  private showVectors = true;
  private waferLength = 0.32;
  private waferHeight = 0.125;
  private waferThickness = 0.032;
  private stageY = 0;
  private arrowY = 0;

  // 样品室内照明光源
  private chamberLight: THREE.PointLight;

  // 欧姆接触夹持块（左侧与右侧）
  private leftClampGroup: THREE.Group;
  private rightClampGroup: THREE.Group;

  // 横向霍尔电压探测触点（顶部与底部中心）
  private topProbeMesh: THREE.Mesh;
  private bottomProbeMesh: THREE.Mesh;

  // 材质
  private titaniumMat: THREE.MeshStandardMaterial;
  private goldMat: THREE.MeshStandardMaterial;

  // 状态缓存
  private lastB = -9999;
  private lastI = -9999;
  private lastVh = -9999;
  private lastMaterial = '';
  private lastCarrierType: CarrierType = 'electron';
  private fluxPulsePhase = 0;

  private disposables: { dispose: () => void }[] = [];

  constructor(options: HallBenchMeshOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'HallBenchMesh';

    this.initMaterials();
    this.buildApparatus(options);
  }

  public setComputeBridge(bridge: ComputeBridge): void {
    this.particleSystem.setComputeBridge(bridge);
  }

  private initMaterials(): void {
    // 1. 拉丝航空钛（电极与支架）
    this.titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x242a35,
      metalness: 0.88,
      roughness: 0.22,
    });
    this.disposables.push(this.titaniumMat);

    // 2. 高纯抛光黄金（欧姆接触垫片与电压传感探针）
    this.goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.95,
      roughness: 0.15,
    });
    this.disposables.push(this.goldMat);

    // 3. 光学石英样品室
    // 高性能晶莹石英，具有超洁净透光率且无乳浊感
    this.crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x8ec5fc,
      metalness: 0.10,
      roughness: 0.08,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });
    this.disposables.push(this.crystalMaterial);

    // 4. 抛光半导体晶圆前视窗
    this.waferMaterial = new THREE.MeshStandardMaterial({
      color: 0x162c42,
      metalness: 0.12,
      roughness: 0.06,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    this.disposables.push(this.waferMaterial);

    // 4b. 实心不透明半导体晶体基底（不透明物理基座）
    this.substrateMaterial = new THREE.MeshStandardMaterial({
      color: 0x111c29,
      metalness: 0.82,
      roughness: 0.28,
      transparent: false,
    });
    this.disposables.push(this.substrateMaterial);
    this.initSubstrateTextures();

    // 5. 全息磁力线材质（明亮电光天蓝）
    this.fluxArrowMat = new THREE.MeshStandardMaterial({
      color: 0x0066ff,
      emissive: 0x0044cc,
      emissiveIntensity: 0.60,
      roughness: 0.18,
      metalness: 0.35,
      transparent: false,
    });
    this.disposables.push(this.fluxArrowMat);
  }

  private initSubstrateTextures(): void {
    this.substrateTextures['n-gaas'] = this.createSubstrateTexture(
      'n-GaAs (100) SINGLE CRYSTAL WAFER',
      'HIGH-MOBILITY ELECTRON CHANNEL | Nd = 1.25e21 m⁻³',
      '#0e1926',
      '#38bdf8',
      'rgba(56, 189, 248, 0.10)'
    );

    this.substrateTextures['p-silicon'] = this.createSubstrateTexture(
      'p-Si (111) MONOCRYSTALLINE SUBSTRATE',
      'HOLE-DOMINANT TRANSPORT CHANNEL | Na = 2.50e21 m⁻³',
      '#1c130b',
      '#fb923c',
      'rgba(251, 146, 60, 0.10)'
    );

    this.substrateTextures['copper'] = this.createSubstrateTexture(
      'HIGH-PURITY PURPLE COPPER FILM (99.99%)',
      'FERMI SURFACE CONDUCTION BAND | n = 8.49e28 m⁻³',
      '#662916',
      '#fca5a5',
      'rgba(254, 202, 202, 0.12)'
    );

    this.substrateMaterial.map = this.substrateTextures['n-gaas'];
    this.disposables.push(
      this.substrateTextures['n-gaas'],
      this.substrateTextures['p-silicon'],
      this.substrateTextures['copper']
    );
  }

  private createSubstrateTexture(
    title: string,
    subTitle: string,
    baseColor: string,
    accentColor: string,
    gridColor: string
  ): THREE.CanvasTexture {
    const width = 512;
    const height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (ctx && typeof ctx.fillRect === 'function') {
      // 1. 半导体晶体基础填充
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, width, height);

      // 2. 微弱拉丝/各向异性半导体晶体渐变
      if (typeof ctx.createLinearGradient === 'function') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.05)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.01)');
        grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.28)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. 精密激光刻蚀半导体坐标网格
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1.0;
      const step = 32;
      for (let x = step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 4. 中心基准对准十字线 [100] / [010]
      const cx = width / 2;
      const cy = height / 2;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 24, cy);
      ctx.lineTo(cx + 24, cy);
      ctx.moveTo(cx, cy - 24);
      ctx.lineTo(cx, cy + 24);
      ctx.stroke();

      if (typeof ctx.arc === 'function') {
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 5. 真实半导体晶圆标线与技术字样
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = accentColor;
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(title, 20, 30);

        ctx.font = '400 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillText(subTitle, 20, 48);

        // 沿底部的毫米刻度标线
        ctx.textAlign = 'center';
        ctx.font = '500 10px monospace';
        ctx.fillText('-4mm', step * 2, height - 12);
        ctx.fillText('-2mm', step * 5, height - 12);
        ctx.fillText('0', cx, height - 12);
        ctx.fillText('+2mm', width - step * 5, height - 12);
        ctx.fillText('+4mm', width - step * 2, height - 12);
      }

      // 6. 外周倒角边框
      if (typeof ctx.strokeRect === 'function') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 2.0;
        ctx.strokeRect(1, 1, width - 2, height - 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  private buildApparatus(options: HallBenchMeshOptions): void {
    this.waferLength = options.waferLength ?? 0.32;
    this.waferHeight = options.waferHeight ?? options.waferWidth ?? 0.125;
    this.waferThickness = options.waferThickness ?? 0.032;
    this.stageY = this.waferHeight * 0.5 + 0.015;
    this.arrowY = this.stageY - this.waferHeight * 0.26;

    const waferL = this.waferLength;
    const waferH = this.waferHeight;
    const waferT = this.waferThickness;
    const stageY = this.stageY;

    // 1. 样品室与夹持电极
    this.buildSpecimenChamber(waferL, waferH, waferT, stageY);

    // 2. 量子载流子粒子系统（发光波包点）
    this.particleSystem = new HallCarrierParticleSystem({
      waferLength: waferL,
      waferHeight: waferH,
      waferThickness: waferT,
      particleCount: 180,
      computeBridge: options.computeBridge,
    });
    this.particleSystem.group.position.set(0, stageY, 0);
    this.group.add(this.particleSystem.group);

    // 3. 全息磁力线（环绕样品，不遮挡视线）
    this.buildPiercingFluxArrows(waferL, waferH, waferT, stageY);

    // 4. 腔内微弱点光源，提供发光光效
    this.chamberLight = new THREE.PointLight(0x00f0ff, 0.45, 0.45);
    this.chamberLight.position.set(0, stageY, 0);
    this.group.add(this.chamberLight);
  }

  private buildSpecimenChamber(waferL: number, waferH: number, waferT: number, stageY: number): void {
    this.chamberGroup = new THREE.Group();
    this.chamberGroup.name = 'SpecimenChamber';
    this.group.add(this.chamberGroup);

    const chamberW = waferL + 0.016;
    const chamberH = waferH + 0.012;
    const chamberT = waferT + 0.010;

    // 1. 高透外壳箱体
    const crystalGeo = new THREE.BoxGeometry(chamberW, chamberH, chamberT);
    this.disposables.push(crystalGeo);

    this.crystalBoxMesh = new THREE.Mesh(crystalGeo, this.crystalMaterial);
    this.crystalBoxMesh.position.set(0, stageY, 0);
    this.crystalBoxMesh.renderOrder = 2;
    this.chamberGroup.add(this.crystalBoxMesh);

    // 细致的发光倒角线条
    const wireGeo = new THREE.EdgesGeometry(crystalGeo);
    this.disposables.push(wireGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.40,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(wireMat);
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.position.set(0, stageY, 0);
    this.chamberGroup.add(wireMesh);

    // 2. 实心半导体基底（不透明晶体背板）
    // 紧贴样品室背面，避免玻璃透明感
    const subT = waferT * 0.35;
    const subZ = -waferT * 0.5 + subT * 0.5;
    const substrateGeo = new THREE.BoxGeometry(waferL * 0.998, waferH * 0.998, subT);
    this.disposables.push(substrateGeo);

    this.substrateMesh = new THREE.Mesh(substrateGeo, this.substrateMaterial);
    this.substrateMesh.name = 'HallSubstrate';
    this.substrateMesh.position.set(0, stageY, subZ);
    this.substrateMesh.renderOrder = 3;
    this.chamberGroup.add(this.substrateMesh);

    // 基底倒角边框，呈现精密晶体外观
    const subEdgeGeo = new THREE.EdgesGeometry(substrateGeo);
    this.disposables.push(subEdgeGeo);
    const subEdgeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
    });
    this.disposables.push(subEdgeMat);
    const subEdgeMesh = new THREE.LineSegments(subEdgeGeo, subEdgeMat);
    subEdgeMesh.position.set(0, stageY, subZ);
    this.chamberGroup.add(subEdgeMesh);

    // 3. 有源导电通道与观测晶体（前表面）
    // 贴合在实心基底前方，填补剩余厚度
    const frontT = waferT - subT;
    const frontZ = subZ + subT * 0.5 + frontT * 0.5;
    const waferGeo = new THREE.BoxGeometry(waferL, waferH, frontT);
    this.disposables.push(waferGeo);

    this.waferMesh = new THREE.Mesh(waferGeo, this.waferMaterial);
    this.waferMesh.name = 'HallWafer';
    this.waferMesh.position.set(0, stageY, frontZ);
    this.waferMesh.renderOrder = 5;
    this.chamberGroup.add(this.waferMesh);

    // 清晰晶体通道边缘
    const waferEdgeGeo = new THREE.EdgesGeometry(waferGeo);
    this.disposables.push(waferEdgeGeo);
    const waferEdgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.45,
    });
    this.disposables.push(waferEdgeMat);
    const waferEdgeMesh = new THREE.LineSegments(waferEdgeGeo, waferEdgeMat);
    waferEdgeMesh.position.set(0, stageY, frontZ);
    this.chamberGroup.add(waferEdgeMesh);

    // 3. 精密欧姆接触夹持接线柱（左右两端）
    this.buildClampingElectrodes(chamberW, chamberH, chamberT, stageY);

    // 4. 精密横向霍尔电压传感探针（上下中心）
    this.buildVoltageProbes(chamberH, stageY);
  }

  private buildClampingElectrodes(chamberW: number, chamberH: number, chamberT: number, stageY: number): void {
    const clampW = 0.016;
    const clampH = chamberH * 1.04;
    const clampT = chamberT * 1.10;

    const clampGeo = new THREE.BoxGeometry(clampW, clampH, clampT);
    const shimGeo = new THREE.BoxGeometry(0.002, clampH * 0.90, clampT * 0.90);
    const screwGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.004, 12);
    this.disposables.push(clampGeo, shimGeo, screwGeo);

    const electrodeGroup = new THREE.Group();
    electrodeGroup.name = 'InstrumentPanel'; // 点击切换电流极性
    this.chamberGroup.add(electrodeGroup);

    // --- 左侧电极块（+I 接线端） ---
    this.leftClampGroup = new THREE.Group();
    const leftPosX = -chamberW * 0.5 - clampW * 0.5;
    this.leftClampGroup.position.set(leftPosX, stageY, 0);

    const leftBody = new THREE.Mesh(clampGeo, this.titaniumMat);
    this.leftClampGroup.add(leftBody);

    // 黄金接触垫片
    const leftShim = new THREE.Mesh(shimGeo, this.goldMat);
    leftShim.position.set(clampW * 0.5 + 0.001, 0, 0);
    this.leftClampGroup.add(leftShim);

    // 微型滚花接线螺钉
    const leftScrew1 = new THREE.Mesh(screwGeo, this.goldMat);
    leftScrew1.rotation.z = Math.PI / 2;
    leftScrew1.position.set(-clampW * 0.5 - 0.002, clampH * 0.25, 0);
    const leftScrew2 = new THREE.Mesh(screwGeo, this.goldMat);
    leftScrew2.rotation.z = Math.PI / 2;
    leftScrew2.position.set(-clampW * 0.5 - 0.002, -clampH * 0.25, 0);
    this.leftClampGroup.add(leftScrew1, leftScrew2);

    electrodeGroup.add(this.leftClampGroup);

    // --- 右侧电极块（-I 接线端） ---
    this.rightClampGroup = new THREE.Group();
    const rightPosX = chamberW * 0.5 + clampW * 0.5;
    this.rightClampGroup.position.set(rightPosX, stageY, 0);

    const rightBody = new THREE.Mesh(clampGeo, this.titaniumMat);
    this.rightClampGroup.add(rightBody);

    // 黄金接触垫片
    const rightShim = new THREE.Mesh(shimGeo, this.goldMat);
    rightShim.position.set(-clampW * 0.5 - 0.001, 0, 0);
    this.rightClampGroup.add(rightShim);

    // 微型滚花接线螺钉
    const rightScrew1 = new THREE.Mesh(screwGeo, this.goldMat);
    rightScrew1.rotation.z = Math.PI / 2;
    rightScrew1.position.set(clampW * 0.5 + 0.002, clampH * 0.25, 0);
    const rightScrew2 = new THREE.Mesh(screwGeo, this.goldMat);
    rightScrew2.rotation.z = Math.PI / 2;
    rightScrew2.position.set(clampW * 0.5 + 0.002, -clampH * 0.25, 0);
    this.rightClampGroup.add(rightScrew1, rightScrew2);

    electrodeGroup.add(this.rightClampGroup);
  }

  private buildVoltageProbes(chamberH: number, stageY: number): void {
    const probeGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.012, 12);
    const tipGeo = new THREE.ConeGeometry(0.0022, 0.004, 12);
    this.disposables.push(probeGeo, tipGeo);

    // 顶部霍尔电压探针（+V_H 传感触点）
    const topProbeGroup = new THREE.Group();
    topProbeGroup.position.set(0, stageY + chamberH * 0.5 + 0.006, 0);

    this.topProbeMesh = new THREE.Mesh(probeGeo, this.goldMat);
    topProbeGroup.add(this.topProbeMesh);
    const topTip = new THREE.Mesh(tipGeo, this.goldMat);
    topTip.rotation.x = Math.PI;
    topTip.position.set(0, -0.007, 0);
    topProbeGroup.add(topTip);
    this.chamberGroup.add(topProbeGroup);

    // 底部霍尔电压探针（-V_H 传感触点）
    const bottomProbeGroup = new THREE.Group();
    bottomProbeGroup.position.set(0, stageY - chamberH * 0.5 - 0.006, 0);

    this.bottomProbeMesh = new THREE.Mesh(probeGeo, this.goldMat);
    bottomProbeGroup.add(this.bottomProbeMesh);
    const bottomTip = new THREE.Mesh(tipGeo, this.goldMat);
    bottomTip.position.set(0, 0.007, 0);
    bottomProbeGroup.add(bottomTip);
    this.chamberGroup.add(bottomProbeGroup);
  }

  private buildPiercingFluxArrows(waferL: number, waferH: number, _waferT: number, stageY: number): void {
    this.fluxArrowsGroup = new THREE.Group();
    this.fluxArrowsGroup.name = 'ElectromagnetYoke'; // 点击切换磁场极性
    this.group.add(this.fluxArrowsGroup);

    this.arrowY = stageY - waferH * 0.26;
    const maxArrows = 11;
    const shaftRadius = 0.0022; // 纤细立体3D流线
    const shaftLen = 0.092;
    const coneRadius = 0.0055;  // 流线型箭头顶端
    const coneHeight = 0.015;

    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 16);
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
    this.disposables.push(shaftGeo, coneGeo);

    for (let i = 0; i < maxArrows; i++) {
      const arrowGroup = new THREE.Group();
      arrowGroup.position.set(0, this.arrowY, 0);

      // 沿Z轴穿过的细长箭杆
      const shaft = new THREE.Mesh(shaftGeo, this.fluxArrowMat);
      shaft.rotation.x = Math.PI / 2;
      arrowGroup.add(shaft);

      // +Z端的锥形箭头（默认向前指向）
      const cone = new THREE.Mesh(coneGeo, this.fluxArrowMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 0, shaftLen * 0.5 + coneHeight * 0.5);
      arrowGroup.add(cone);

      this.fluxArrowsGroup.add(arrowGroup);
      this.fluxArrowMeshes.push({ group: arrowGroup, shaft, cone, baseY: this.arrowY, baseZ: 0 });
    }

    this.updateFluxArrows(0.5);
  }

  /**
   * 磁感线密度代表磁感应强度B：
   * |B| 越大 -> 箭头越多（磁通密度越高）；B = 0 -> 0个箭头。
   * 严格仅取决于B（不受电流I、厚度d或材质影响）。
   */
  private getArrowCountForField(bTesla: number): number {
    const bMag = Math.abs(bTesla);
    if (bMag < 0.02) return 0;
    if (bMag < 0.12) return 1;
    if (bMag < 0.25) return 3;
    if (bMag < 0.45) return 5;
    if (bMag < 0.65) return 7;
    if (bMag < 0.85) return 9;
    return 11;
  }

  private updateFluxArrows(bTesla: number): void {
    const bMag = Math.abs(bTesla);
    const activeCount = this.getArrowCountForField(bTesla);
    const arrowVisible = this.showVectors && activeCount > 0;
    this.fluxArrowsGroup.visible = arrowVisible;

    if (!arrowVisible) {
      for (const item of this.fluxArrowMeshes) {
        item.group.visible = false;
      }
      return;
    }

    const bSign = bTesla >= 0 ? 1 : -1;
    const shaftLen = 0.092 * THREE.MathUtils.clamp(bMag / 0.8, 0.55, 1.15);
    const coneHeight = 0.015;
    const spanX = this.waferLength * 0.74;

    for (let i = 0; i < this.fluxArrowMeshes.length; i++) {
      const item = this.fluxArrowMeshes[i];
      if (i < activeCount) {
        item.group.visible = true;
        const x = activeCount === 1 ? 0 : -spanX * 0.5 + i * (spanX / (activeCount - 1));
        item.group.position.set(x, this.arrowY, 0);

        item.cone.position.set(0, 0, bSign * (shaftLen * 0.5 + coneHeight * 0.5));
        item.cone.rotation.x = (bSign * Math.PI) / 2;
        item.shaft.scale.set(1, THREE.MathUtils.clamp(bMag / 0.8, 0.5, 1.2), 1);
      } else {
        item.group.visible = false;
      }
    }
  }

  public setWaferAppearance(materialKey: string): void {
    if (materialKey === 'n-gaas') {
      this.waferMaterial.color.setHex(0x14344d); // 光学半导体蓝晶色泽
      this.waferMaterial.opacity = 0.32;
      this.waferMaterial.metalness = 0.25;
      this.waferMaterial.roughness = 0.10;
      if (this.substrateTextures['n-gaas']) {
        this.substrateMaterial.map = this.substrateTextures['n-gaas'];
        this.substrateMaterial.color.setHex(0x111c29);
        this.substrateMaterial.metalness = 0.82;
        this.substrateMaterial.roughness = 0.28;
        this.substrateMaterial.needsUpdate = true;
      }
      if (this.chamberLight) {
        this.chamberLight.color.setHex(0x00f5ff);
        this.chamberLight.intensity = 0.45;
      }
    } else if (materialKey === 'p-silicon') {
      this.waferMaterial.color.setHex(0x3d2212); // 暖色光学半导体琥珀烟色
      this.waferMaterial.opacity = 0.32;
      this.waferMaterial.metalness = 0.25;
      this.waferMaterial.roughness = 0.10;
      if (this.substrateTextures['p-silicon']) {
        this.substrateMaterial.map = this.substrateTextures['p-silicon'];
        this.substrateMaterial.color.setHex(0x211710);
        this.substrateMaterial.metalness = 0.82;
        this.substrateMaterial.roughness = 0.28;
        this.substrateMaterial.needsUpdate = true;
      }
      if (this.chamberLight) {
        this.chamberLight.color.setHex(0xff9500);
        this.chamberLight.intensity = 0.45;
      }
    } else if (materialKey === 'copper') {
      this.waferMaterial.color.setHex(0xb85d38); // 抛光金属玫瑰铜
      this.waferMaterial.opacity = 0.52;
      this.waferMaterial.metalness = 0.85;
      this.waferMaterial.roughness = 0.18;
      if (this.substrateTextures['copper']) {
        this.substrateMaterial.map = this.substrateTextures['copper'];
        this.substrateMaterial.color.setHex(0x662916);
        this.substrateMaterial.metalness = 0.92;
        this.substrateMaterial.roughness = 0.16;
        this.substrateMaterial.needsUpdate = true;
      }
      if (this.chamberLight) {
        this.chamberLight.color.setHex(0x64d2ff);
        this.chamberLight.intensity = 0.35;
      }
    }
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.showVectors = showVectors;
    this.particleSystem.setToggles(showVectors, showParticles);
    this.updateFluxArrows(this.lastB);
  }

  public updateTelemetry(
    bTesla: number,
    currentMa: number,
    vhMv: number,
    materialName: string,
    carrierType: CarrierType,
    _nConcentration = 1.25e21,
    _thicknessMm = 0.50
  ): void {
    // 1. 磁力线箭头：严格仅取决于B（不受I、d或材质影响）
    const bChanged = Math.abs(this.lastB - bTesla) > 0.002;
    if (bChanged) {
      this.lastB = bTesla;
      this.updateFluxArrows(bTesla);
    }

    // 2. 载流子粒子物理与表面电荷：取决于 (I, B, V_H, carrierType)
    const isDifferent =
      bChanged ||
      Math.abs(this.lastI - currentMa) > 0.02 ||
      Math.abs(this.lastVh - vhMv) > 0.005 ||
      this.lastMaterial !== materialName ||
      this.lastCarrierType !== carrierType;

    if (isDifferent) {
      this.lastI = currentMa;
      this.lastVh = vhMv;
      this.lastMaterial = materialName;
      this.lastCarrierType = carrierType;

      this.particleSystem.setPhysicsState(currentMa, bTesla, vhMv, carrierType);
    }
  }

  public update(delta: number): void {
    this.particleSystem.update(delta);

    // 存在磁场时的磁力线微弱脉冲动画（深邃天蓝光晕，不过曝）
    if (this.fluxArrowsGroup.visible && Math.abs(this.lastB) > 0.05) {
      this.fluxPulsePhase += delta * 4.0;
      this.fluxArrowMat.emissiveIntensity = 0.50 + Math.sin(this.fluxPulsePhase) * 0.20;
    }
  }

  public dispose(): void {
    this.particleSystem.dispose();
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
