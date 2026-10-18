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
 * 实验器材直接置于实验桌台面（无多余底板），规范柔性重力自然下垂导线敷设，杜绝粗糙穿模与屏幕闪烁
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
  public batteryPackGroup!: THREE.Group; // 双节干电池串联组
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
  private nanfuTexture!: THREE.CanvasTexture;

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
  private scopeLastVoltage = -99999;
  private scopeLastPos: SwitchPosition = 'neutral';
  private scopeLastRenderTime = 0;

  // 导线粒子流动态系统
  private chargeParticles!: THREE.Points;
  private dischargeParticles!: THREE.Points;
  private chargeParticleGeometry!: THREE.BufferGeometry;
  private dischargeParticleGeometry!: THREE.BufferGeometry;
  private chargeWireSplines: THREE.Curve<THREE.Vector3>[] = [];
  private dischargeWireSplines: THREE.Curve<THREE.Vector3>[] = [];
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
  private lastRenderedPowerCurrent = -99999;
  private lastRenderedPowerSwitchPos: SwitchPosition = 'neutral';
  private lastSwitchPos: SwitchPosition = 'neutral';
  private pulsePhase = 0;
  private currentVoltageSupply = 3.0;

  constructor(options: CapacitorDischargeBenchMeshOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'CapacitorDischargeBenchMesh';
    this.showLabels = options.showLabels ?? false;
    this.currentVoltageSupply = options.voltageSupply ?? 3.0;

    // 严禁下面多放一块板子：所有器材直接稳妥放置在全息实验台桌面上
    this.buildBatteryPack(this.currentVoltageSupply);
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

  /**
   * 生成极高清晰度（1024x1024）真实南孚聚能环碱性干电池外观热缩外衣印刷纹理
   */
  private createNanfuTexture(): THREE.CanvasTexture {
    return paintTexture(1024, 1024, (rawCtx, w, h) => {
      const ctx = rawCtx as unknown as CanvasRenderingContext2D;

      // 整体水平镜像校正：Three.js 卧式圆柱几何体外表面映射消除镜像反转，确保正向真实读数
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);

      const cx = w * 0.5;

      // 1. 底色：深邃高光黑漆（南孚经典亮光黑胶机身）
      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, w, h);

      // 2. 侧边缘微观六边形蜂窝暗纹（高能聚能电芯晶格，向中央平滑过渡）
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
      ctx.lineWidth = 1.2;
      const hexR = 9.5;
      const hexH = Math.sqrt(3) * hexR;
      for (let y = h * 0.27; y < h * 0.96; y += hexH) {
        for (let x = 0; x < w; x += hexR * 3) {
          const isLeftWing = x < cx - 170;
          const isRightWing = x > cx + 170;
          if (isLeftWing || isRightWing) {
            const rowOffset = (Math.floor(y / hexH) % 2) * (hexR * 1.5);
            const hx = x + rowOffset;
            ctx.beginPath();
            for (let a = 0; a < 6; a++) {
              const angle = (Math.PI / 3) * a;
              const px = hx + hexR * Math.cos(angle);
              const py = y + hexR * Math.sin(angle);
              if (a === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // 3. 顶部香槟金金属拉丝涂层与标志性折线齿状交界 (Chevron Boundary)
      const goldY = h * 0.25;

      // 构建南孚标志性双侧折线尖齿交界线路径
      const buildChevronPath = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w, goldY);
        ctx.lineTo(cx + 360, goldY);
        ctx.lineTo(cx + 260, goldY - 50); // 右大齿尖峰
        ctx.lineTo(cx + 210, goldY + 28); // 右大齿内凹
        ctx.lineTo(cx + 140, goldY + 28);
        ctx.lineTo(cx + 90,  goldY + 12);
        ctx.lineTo(cx - 90,  goldY + 12); // 中央“南”字上方平滑弧过渡
        ctx.lineTo(cx - 140, goldY + 28);
        ctx.lineTo(cx - 210, goldY + 28); // 左大齿内凹
        ctx.lineTo(cx - 260, goldY - 50); // 左大齿尖峰
        ctx.lineTo(cx - 360, goldY);
        ctx.lineTo(0, goldY);
        ctx.closePath();
      };

      // 3.1 填充金色纵向渐变（模拟圆柱金属高光柱）
      ctx.save();
      const goldGrad = typeof ctx.createLinearGradient === 'function'
        ? ctx.createLinearGradient(0, 0, 0, goldY * 1.25)
        : null;
      if (goldGrad) {
        goldGrad.addColorStop(0.00, '#9a6007'); // 深琥珀金
        goldGrad.addColorStop(0.18, '#ca8a04'); // 纯正金黄
        goldGrad.addColorStop(0.42, '#fde047'); // 耀眼香槟金高光柱
        goldGrad.addColorStop(0.70, '#eab308');
        goldGrad.addColorStop(0.92, '#ca8a04');
        goldGrad.addColorStop(1.00, '#854d0e'); // 边缘深金
        ctx.fillStyle = goldGrad;
      } else {
        ctx.fillStyle = '#ca8a04';
      }
      buildChevronPath();
      ctx.fill();

      // 3.2 金属微拉丝横纹
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let ly = 10; ly < goldY + 28; ly += 4) {
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(w, ly);
        ctx.stroke();
      }

      // 3.3 标志性折线边缘的立体镀铬银白滚边与下凹阴影线（与参考图完全一致）
      const strokeChevronBorder = () => {
        ctx.beginPath();
        ctx.moveTo(0, goldY);
        ctx.lineTo(cx - 360, goldY);
        ctx.lineTo(cx - 260, goldY - 50);
        ctx.lineTo(cx - 210, goldY + 28);
        ctx.lineTo(cx - 140, goldY + 28);
        ctx.lineTo(cx - 90,  goldY + 12);
        ctx.lineTo(cx + 90,  goldY + 12);
        ctx.lineTo(cx + 140, goldY + 28);
        ctx.lineTo(cx + 210, goldY + 28);
        ctx.lineTo(cx + 260, goldY - 50);
        ctx.lineTo(cx + 360, goldY);
        ctx.lineTo(w, goldY);
      };

      // 下边缘阴影沉浸
      ctx.save();
      ctx.translate(0, 3);
      strokeChevronBorder();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // 镀铬银白立体边缘带
      strokeChevronBorder();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 9;
      ctx.stroke();

      strokeChevronBorder();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.restore();

      // 正极端标识 (+) 位于金色头部正中
      ctx.save();
      const plusY = goldY * 0.40;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, plusY, 22, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.fillRect(cx - 12, plusY - 2.5, 24, 5);
      ctx.fillRect(cx - 2.5, plusY - 12, 5, 24);
      ctx.restore();

      // 4. 正面核心标识：巨幅白体“南孚”与 ® 标（南孚官方标志性重磅大黑体）
      if (typeof ctx.fillText === 'function') {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4.5;

        // 巨幅超粗黑体字形
        ctx.font = "900 178px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
        const nanY = h * 0.435;
        if (typeof ctx.strokeText === 'function') ctx.strokeText('南', cx, nanY);
        ctx.fillText('南', cx, nanY);

        const fuY = h * 0.615;
        if (typeof ctx.strokeText === 'function') ctx.strokeText('孚', cx, fuY);
        ctx.fillText('孚', cx, fuY);

        // “孚”字右上角 registered 商标圆圈 R
        ctx.font = "bold 26px sans-serif";
        ctx.lineWidth = 2.4;
        const rX = cx + 124;
        const rY = h * 0.540;
        ctx.beginPath();
        ctx.arc(rX, rY, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText('R', rX, rY + 1);
        ctx.restore();

        // 5. 下方标志性“聚能环”白色粗体字
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.0;
        ctx.font = "900 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
        const ringTextY = h * 0.765;
        if (typeof ctx.strokeText === 'function') ctx.strokeText('聚 能 环', cx, ringTextY);
        ctx.fillText('聚 能 环', cx, ringTextY);

        // “聚能环”右上角 ® 标
        ctx.font = "bold 18px sans-serif";
        ctx.lineWidth = 1.8;
        const rRingX = cx + 128;
        const rRingY = ringTextY - 17;
        ctx.beginPath();
        ctx.arc(rRingX, rRingY, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText('R', rRingX, rRingY + 1);
        ctx.restore();
      }

      // 6. 最具辨识度的“金色聚能环”月牙光弧与能量星芒耀斑
      // 从左侧下弯托起“聚能环”，右侧尖端扬起并爆发透镜耀斑
      ctx.save();
      const arcStartX = cx - 180;
      const arcStartY = h * 0.62;
      const arcCp1X = cx - 170;
      const arcCp1Y = h * 0.90;
      const arcCp2X = cx + 90;
      const arcCp2Y = h * 0.92;
      const arcEndX = cx + 170;
      const arcEndY = h * 0.68;

      // 6.1 柔和外发光晕 (Outer Golden Bloom)
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.28)';
      ctx.lineWidth = 42;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(arcStartX, arcStartY);
      ctx.bezierCurveTo(arcCp1X, arcCp1Y, arcCp2X, arcCp2Y, arcEndX, arcEndY);
      ctx.stroke();

      // 6.2 饱满琥珀金光弧主干 (Rich Gold Body)
      const ringGrad = typeof ctx.createLinearGradient === 'function'
        ? ctx.createLinearGradient(arcStartX, arcStartY, arcEndX, arcEndY)
        : null;
      if (ringGrad) {
        ringGrad.addColorStop(0.0, 'rgba(217, 119, 6, 0.4)');
        ringGrad.addColorStop(0.2, '#f59e0b');
        ringGrad.addColorStop(0.6, '#fbbf24');
        ringGrad.addColorStop(0.9, '#fef08a');
        ringGrad.addColorStop(1.0, '#ffffff');
        ctx.strokeStyle = ringGrad;
      } else {
        ctx.strokeStyle = '#f59e0b';
      }
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(arcStartX, arcStartY);
      ctx.bezierCurveTo(arcCp1X, arcCp1Y, arcCp2X, arcCp2Y, arcEndX, arcEndY);
      ctx.stroke();

      // 6.3 炽热高亮核心光带 (Bright White Core)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(arcStartX + 20, arcStartY + 30);
      ctx.bezierCurveTo(arcCp1X + 15, arcCp1Y - 4, arcCp2X, arcCp2Y - 4, arcEndX, arcEndY);
      ctx.stroke();

      // 6.4 右侧聚能环尖端爆发的耀眼星芒透镜耀斑 (Lens Flare Starburst)
      const flareX = arcEndX - 10;
      const flareY = arcEndY + 4;

      // 径向光晕球
      const flareGrad = typeof ctx.createRadialGradient === 'function'
        ? ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, 56)
        : null;
      if (flareGrad) {
        flareGrad.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
        flareGrad.addColorStop(0.25, 'rgba(254, 240, 138, 0.85)');
        flareGrad.addColorStop(0.55, 'rgba(245, 158, 11, 0.40)');
        flareGrad.addColorStop(1.00, 'rgba(245, 158, 11, 0.0)');
        ctx.fillStyle = flareGrad;
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.beginPath();
      ctx.arc(flareX, flareY, 56, 0, Math.PI * 2);
      ctx.fill();

      // 四向尖锐能量星芒刺
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(flareX - 52, flareY);
      ctx.quadraticCurveTo(flareX - 5, flareY - 4, flareX, flareY - 60);
      ctx.quadraticCurveTo(flareX + 5, flareY - 4, flareX + 52, flareY);
      ctx.quadraticCurveTo(flareX + 5, flareY + 4, flareX, flareY + 60);
      ctx.quadraticCurveTo(flareX - 5, flareY + 4, flareX - 52, flareY);
      ctx.fill();
      ctx.restore();

      // 7. 电池背面（印刷专业实验室电气规格与环保标识）
      if (typeof ctx.fillText === 'function') {
        ctx.save();
        const backX = 140;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#94a3b8';
        ctx.font = "bold 26px sans-serif";
        ctx.fillText('无汞碱性电池', backX, h * 0.45);
        ctx.font = "600 20px monospace";
        ctx.fillText('MERCURY 0.00% FREE', backX, h * 0.49);
        ctx.fillText('LR20 · 1.5V · D SIZE', backX, h * 0.53);

        // 负极标识 (-)
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(backX, h * 0.82, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(backX - 10, h * 0.82 - 2, 20, 4);

        // 规范条形码仿真图案
        const barX = backX - 60;
        const barY = h * 0.60;
        ctx.fillStyle = '#cbd5e1';
        for (let bx = 0; bx < 120; bx += 5) {
          const barW = (bx % 10 === 0) ? 3 : (bx % 7 === 0) ? 1.5 : 2.2;
          ctx.fillRect(barX + bx, barY, barW, 40);
        }
        ctx.restore();
      }

      ctx.restore(); // 结束镜像校正
    });
  }

  /**
   * 构造极高精度 3D 南孚聚能环干电池几何总成
   * 包含：金属卷边、凹陷绝缘圈、冲压不锈钢面、精密多级正极金属凸台、底座红圈聚能环
   */
  private createNanfuBattery(battTexture: THREE.CanvasTexture, isFlipped = false): THREE.Group {
    const battGroup = new THREE.Group();
    battGroup.name = isFlipped ? 'nanfuBattery2' : 'nanfuBattery1';

    const battR = 0.015;
    const battL = 0.054;
    const chromeMat = labMetal(0xffffff, 0.98, 0.08); // 镜面抛光液态铬
    const nickelMat = labMetal(0xf1f5f9, 0.95, 0.16); // 抛光高亮不锈钢
    const goldRolledMat = anodizedAluminum(0xf59e0b, 0.22); // 阳极氧化香槟金
    const darkGasketMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 }); // 绝缘密封圈

    // 1. 电池主体外包套管圆柱体 (带有 Nanfu 聚能环极高清晰度印刷涂装)
    const bodyGeo = new THREE.CylinderGeometry(battR, battR, battL, 48);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: battTexture,
      roughness: 0.28,
      metalness: 0.55,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    battGroup.add(bodyMesh);

    // 2. 正极端总成 (位于 +Z 端 = battL * 0.5)
    const posZ = battL * 0.5;

    // 2.1 顶盖外圈金属卷边 (Rolled Crimp Shoulder)
    const rolledGeo = new THREE.CylinderGeometry(battR * 0.93, battR, 0.0016, 48, 1, true);
    rolledGeo.rotateX(Math.PI / 2);
    const rolledMesh = new THREE.Mesh(rolledGeo, goldRolledMat);
    rolledMesh.position.set(0, 0, posZ - 0.0008);
    battGroup.add(rolledMesh);

    // 2.2 顶盖凹陷防漏绝缘槽 (Recessed Gasket Moat)
    const moatGeo = new THREE.CylinderGeometry(battR * 0.92, battR * 0.92, 0.0012, 36);
    moatGeo.rotateX(Math.PI / 2);
    const moatMesh = new THREE.Mesh(moatGeo, darkGasketMat);
    moatMesh.position.set(0, 0, posZ + 0.0004);
    battGroup.add(moatMesh);

    // 2.3 顶端冲压镀镍不锈钢圆盘 (Top Stamped Metal Face)
    const topDiscGeo = new THREE.CylinderGeometry(battR * 0.82, battR * 0.82, 0.0014, 36);
    topDiscGeo.rotateX(Math.PI / 2);
    const topDisc = new THREE.Mesh(topDiscGeo, nickelMat);
    topDisc.position.set(0, 0, posZ + 0.0008);
    battGroup.add(topDisc);

    // 2.4 正极凸起金属铜帽：多级精密车削台阶 (Multi-stage Turned Positive Nipple)
    const baseCollarGeo = new THREE.CylinderGeometry(0.0062, 0.0062, 0.0016, 28);
    baseCollarGeo.rotateX(Math.PI / 2);
    const baseCollar = new THREE.Mesh(baseCollarGeo, chromeMat);
    baseCollar.position.set(0, 0, posZ + 0.0016);
    battGroup.add(baseCollar);

    const nippleGeo = new THREE.CylinderGeometry(0.0044, 0.0048, 0.0028, 28);
    nippleGeo.rotateX(Math.PI / 2);
    const nipple = new THREE.Mesh(nippleGeo, chromeMat);
    nipple.position.set(0, 0, posZ + 0.0034);
    battGroup.add(nipple);

    const dimpleGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.0006, 20);
    dimpleGeo.rotateX(Math.PI / 2);
    const dimple = new THREE.Mesh(dimpleGeo, new THREE.MeshBasicMaterial({ color: 0x94a3b8 }));
    dimple.position.set(0, 0, posZ + 0.0048);
    battGroup.add(dimple);

    // 3. 负极端总成 (位于 -Z 端 = -battL * 0.5)
    const negZ = -battL * 0.5;

    // 3.1 负极卷边环
    const negRolledGeo = new THREE.CylinderGeometry(battR, battR * 0.94, 0.0016, 48, 1, true);
    negRolledGeo.rotateX(Math.PI / 2);
    const negRolled = new THREE.Mesh(negRolledGeo, new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 }));
    negRolled.position.set(0, 0, negZ + 0.0008);
    battGroup.add(negRolled);

    // 3.2 南孚经典底座绝缘“聚能环”红圈 (The Iconic Red Ring of Energy)
    const redRingGeo = new THREE.CylinderGeometry(battR * 0.90, battR * 0.90, 0.0010, 48);
    redRingGeo.rotateX(Math.PI / 2);
    const redRingMat = new THREE.MeshStandardMaterial({
      color: 0xd9261c,
      roughness: 0.35,
      metalness: 0.20,
    });
    const redRing = new THREE.Mesh(redRingGeo, redRingMat);
    redRing.position.set(0, 0, negZ - 0.0004);
    battGroup.add(redRing);

    // 3.3 负极镀镍镜面平底触板 (Flat Contact Disc)
    const negDiscGeo = new THREE.CylinderGeometry(battR * 0.72, battR * 0.72, 0.0012, 36);
    negDiscGeo.rotateX(Math.PI / 2);
    const negDisc = new THREE.Mesh(negDiscGeo, nickelMat);
    negDisc.position.set(0, 0, negZ - 0.0009);
    battGroup.add(negDisc);

    // 3.4 负极同心冲压加强凹凸环
    const negRidgeGeo = new THREE.TorusGeometry(battR * 0.42, 0.0004, 12, 32);
    const negRidge = new THREE.Mesh(negRidgeGeo, chromeMat);
    negRidge.position.set(0, 0, negZ - 0.0015);
    battGroup.add(negRidge);

    // 4. 如果是串联右侧电池 (isFlipped = true)，整体绕 Y 轴旋转 180°
    if (isFlipped) {
      battGroup.rotation.y = Math.PI;
    }

    return battGroup;
  }

  // ================= 1. 真实教学双节一号干电池串联电池组 (直接置于桌面) =================
  private buildBatteryPack(initialVoltage: number): void {
    const pGroup = new THREE.Group();
    pGroup.name = 'batteryPackGroup';
    this.batteryPackGroup = pGroup;

    // 端正摆放于左后排，完全正对操作者视线 (+Z)，底面紧贴桌面 y = 0
    pGroup.position.set(-0.300, 0, -0.080);
    pGroup.rotation.y = 0;

    const caseW = 0.140;
    const caseH = 0.024;
    const caseD = 0.100;

    // 1. CNC 倒角工程底座（航空级阳极氧化喷砂银铝，四角带防滑硅胶底脚）
    const cradleGeo = createChamferedBoxGeometry(caseW, caseH, caseD, 0.006, 0.0018);
    const cradleMat = anodizedAluminum(0xf1f5f9, 0.28);
    const cradleMesh = new THREE.Mesh(cradleGeo, cradleMat);
    cradleMesh.castShadow = true;
    cradleMesh.receiveShadow = true;
    pGroup.add(cradleMesh);

    // 四角微型防滑防震硅胶脚垫（直接紧贴台面）
    const footGeo = new THREE.CylinderGeometry(0.006, 0.007, 0.002, 16);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    for (const [fx, fz] of [
      [-caseW * 0.42, -caseD * 0.42],
      [caseW * 0.42, -caseD * 0.42],
      [-caseW * 0.42, caseD * 0.42],
      [caseW * 0.42, caseD * 0.42],
    ]) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, 0.001, fz);
      pGroup.add(foot);
    }

    // 双节电池仿形圆弧托槽（内凹双半圆柱床）
    const grooveR = 0.0165;
    const grooveL = 0.062;
    const grooveGeo = new THREE.CylinderGeometry(grooveR, grooveR, grooveL, 32, 1, false, 0, Math.PI);
    grooveGeo.rotateX(Math.PI / 2);
    grooveGeo.rotateZ(Math.PI);
    const grooveMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55 });

    const lGroove = new THREE.Mesh(grooveGeo, grooveMat);
    lGroove.position.set(-0.028, caseH + 0.0005, 0);
    pGroup.add(lGroove);
    const rGroove = new THREE.Mesh(grooveGeo, grooveMat);
    rGroove.position.set(0.028, caseH + 0.0005, 0);
    pGroup.add(rGroove);

    // 2. 两节高仿真 1 号南孚聚能环碱性干电池 (D-Cell / LR20，两节严格串联装配)
    // 电池 1 (左侧)：正极冲压镍帽朝前 (+Z)，负极底板朝后 (-Z)
    // 电池 2 (右侧)：负极标志性红圈“聚能环”朝前 (+Z)，正极朝后 (-Z)
    const battR = 0.015;
    const battL = 0.054;

    if (!this.nanfuTexture) {
      this.nanfuTexture = this.createNanfuTexture();
    }

    const batt1 = this.createNanfuBattery(this.nanfuTexture, false);
    batt1.position.set(-0.028, caseH + battR * 0.85, 0);
    pGroup.add(batt1);

    const batt2 = this.createNanfuBattery(this.nanfuTexture, true);
    batt2.position.set(0.028, caseH + battR * 0.85, 0);
    pGroup.add(batt2);

    // 3. 核心串联构造：后部醒目的纯黄铜串联导电连接桥片 (Series Connecting Busbar)
    // 连通电池 1 负极 (x = -0.028) 与电池 2 正极 (x = 0.028)
    const bridgeGeo = createChamferedBoxGeometry(0.064, 0.008, 0.004, 0.0015, 0.0008);
    const bridgeMat = polishedGold(0xd97706);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
    bridgeMesh.position.set(0, caseH + 0.004, -caseD * 0.5 + 0.012);
    pGroup.add(bridgeMesh);

    const thumbNutGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.006, 16);
    const lNut = new THREE.Mesh(thumbNutGeo, bridgeMat);
    lNut.position.set(-0.028, caseH + 0.010, -caseD * 0.5 + 0.012);
    pGroup.add(lNut);
    const rNut = new THREE.Mesh(thumbNutGeo, bridgeMat);
    rNut.position.set(0.028, caseH + 0.010, -caseD * 0.5 + 0.012);
    pGroup.add(rNut);

    // 弹簧与弹性接触片
    const springGeo = new THREE.CylinderGeometry(0.007, 0.010, 0.008, 16);
    springGeo.rotateX(Math.PI / 2);
    const springMat = labMetal(0xcbd5e1, 0.95, 0.15);
    const b1Spring = new THREE.Mesh(springGeo, springMat);
    b1Spring.position.set(-0.028, batt1.position.y, -battL * 0.5 - 0.004);
    pGroup.add(b1Spring);

    const b2Spring = new THREE.Mesh(springGeo, springMat);
    b2Spring.position.set(0.028, batt2.position.y, battL * 0.5 + 0.004);
    pGroup.add(b2Spring);

    // 4. 前置标准 4mm 实验室纯黄铜接线柱 (红+正极输出、黑-负极输出)
    // 红（+正极）：世界坐标 (-0.328, 0.024, -0.034)
    // 黑（-负极）：世界坐标 (-0.272, 0.024, -0.034)
    const postZ = caseD * 0.5 - 0.004;
    this.createKnurledPost(pGroup, new THREE.Vector3(-0.028, caseH, postZ), 0xef4444); // (+) 红
    this.createKnurledPost(pGroup, new THREE.Vector3(0.028, caseH, postZ), 0x1e293b);  // (-) 黑

    // 5. 电池安全锁紧旋钮与电源总开关（保持 powerKnobMesh 与 powerSwitchMesh 兼容性）
    const knobGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.010, 20);
    this.powerKnobMesh = new THREE.Mesh(knobGeo, anodizedAluminum(0x64748b, 0.25));
    this.powerKnobMesh.position.set(caseW * 0.5 - 0.012, caseH + 0.005, 0);
    this.powerKnobMesh.name = 'powerKnobMesh';
    pGroup.add(this.powerKnobMesh);

    const switchGeo = new THREE.BoxGeometry(0.010, 0.014, 0.006);
    this.powerSwitchMesh = new THREE.Mesh(switchGeo, labGlow(0x22c55e, 0.95));
    this.powerSwitchMesh.position.set(-caseW * 0.5 + 0.012, caseH + 0.005, 0);
    this.powerSwitchMesh.name = 'powerSwitchMesh';
    pGroup.add(this.powerSwitchMesh);

    // 6. 电池状态指示 LED 与微型电压数显
    this.powerLedMaterial = labGlow(0x10b981, 0.9);
    const ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 12, 12), this.powerLedMaterial);
    ledMesh.position.set(-caseW * 0.5 + 0.012, caseH + 0.013, 0);
    pGroup.add(ledMesh);

    this.powerDisplayCanvas = document.createElement('canvas');
    this.powerDisplayCanvas.width = 256;
    this.powerDisplayCanvas.height = 128;
    this.powerDisplayTexture = new THREE.CanvasTexture(this.powerDisplayCanvas);
    this.powerDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderPowerSupplyDisplay(initialVoltage, 0.0);

    const dispGeo = new THREE.PlaneGeometry(0.038, 0.018);
    const dispMat = new THREE.MeshBasicMaterial({ map: this.powerDisplayTexture, toneMapped: false });
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.position.set(0, caseH + 0.001, caseD * 0.5 - 0.018);
    dispMesh.rotation.x = -Math.PI / 2;
    pGroup.add(dispMesh);

    // 串联铭牌
    const plateGeo = new THREE.PlaneGeometry(0.060, 0.010);
    const plateTexture = paintTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, w, h);
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('2×南孚聚能环 1.5V 串联: 3.0V', w / 2, h / 2);
      }
    });
    const plateMesh = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ map: plateTexture }));
    plateMesh.position.set(0, caseH + 0.001, -caseD * 0.5 + 0.024);
    plateMesh.rotation.x = -Math.PI / 2;
    pGroup.add(plateMesh);

    this.group.add(pGroup);
  }

  private renderPowerSupplyDisplay(volts: number, _amps: number): void {
    const ctx = this.powerDisplayCanvas?.getContext('2d');
    if (!ctx) return;
    const w = this.powerDisplayCanvas.width;
    const h = this.powerDisplayCanvas.height;

    ctx.fillStyle = '#05101a';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }

    if (typeof ctx.fillText === 'function') {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 52px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${volts.toFixed(1)}V`, w / 2, h * 0.50);
    }

    this.powerDisplayTexture.needsUpdate = true;
  }

  // ================= 2. 真实物理教学 J2354 瓷管滑动变阻器 (直接置于桌面) =================
  private buildResistor(resistanceOhm: number): void {
    const rGroup = new THREE.Group();
    rGroup.name = 'rheostatGroup';
    this.rheostatGroup = rGroup;

    // 横卧在中后排正中央，直接置于桌面 y = 0，滑杆与接线端正对操作者视线 (+Z)
    rGroup.position.set(-0.060, 0, -0.080);
    rGroup.rotation.y = 0;

    const length = 0.160;
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
      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, 0, w, h);

      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(x, 0, 2.5, h);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(x + 1, 0, 1, h);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(x + 2.5, 0, 1.5, h);
      }

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

    // 3. 左右两侧压铸铝合金支架 (弧形肩膀造型与宽展底脚，底面紧贴桌面 y = 0)
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

    // 4. 顶部镜面抛光液态铬金属导电滑杆
    const rodR = 0.004;
    const rodY = 0.054;
    const rodGeo = new THREE.CylinderGeometry(rodR, rodR, length + bW * 2 + 0.010, 24);
    rodGeo.rotateZ(Math.PI / 2);
    const rodMat = labMetal(0xffffff, 0.98, 0.06);
    const rodMesh = new THREE.Mesh(rodGeo, rodMat);
    rodMesh.position.set(0, rodY, 0);
    rGroup.add(rodMesh);

    // 5. 滑块触头组件
    const sliderGroup = new THREE.Group();
    sliderGroup.position.set(0.024, rodY, 0);

    const knobGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.020, 20);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.18, metalness: 0.1 });
    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.position.set(0, 0.014, 0);
    sliderGroup.add(knob);

    const leafGeo = new THREE.BoxGeometry(0.008, 0.014, 0.002);
    const leafMesh = new THREE.Mesh(leafGeo, polishedGold(0xd97706));
    leafMesh.position.set(0, -0.011, 0);
    sliderGroup.add(leafMesh);

    rGroup.add(sliderGroup);

    // 6. 三个标准黄铜滚花接线柱
    // 端子 A (左下)：世界坐标 (-0.147, 0.022, -0.061)
    this.createKnurledPost(rGroup, new THREE.Vector3(-length * 0.5 - bW * 0.5, 0.022, bD * 0.42), 0xef4444);
    // 端子 B (右下)：世界坐标 (0.027, 0.022, -0.061)
    this.createKnurledPost(rGroup, new THREE.Vector3(length * 0.5 + bW * 0.5, 0.022, bD * 0.42), 0x1e293b);
    // 端子 C (右上滑杆)：世界坐标 (0.027, 0.054, -0.080)
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

  // ================= 3. 真实教学用大容量储能电容器组件 (直接置于桌面) =================
  private buildCapacitor(initialUf: number): void {
    const cGroup = new THREE.Group();
    cGroup.name = 'capacitorGroup';
    this.capacitorGroup = cGroup;

    // 端正摆放在中后排右侧，直接置于桌面 y = 0，世界坐标中心 (0.140, 0, -0.080)
    cGroup.position.set(0.140, 0, -0.080);
    cGroup.rotation.y = 0;

    const baseW = 0.100;
    const baseH = 0.012;
    const baseD = 0.100;

    // 1. CNC 实心铝合金阳极氧化喷砂基板
    const mountGeo = createChamferedBoxGeometry(baseW, baseH, baseD, 0.008, 0.0018);
    const mountMat = anodizedAluminum(0xf1f5f9, 0.24);
    const mount = new THREE.Mesh(mountGeo, mountMat);
    mount.castShadow = true;
    mount.receiveShadow = true;
    cGroup.add(mount);

    // 2. 真实铝电解电容器本体圆柱罐
    const capRadius = 0.028;
    const capHeight = 0.080;
    const capCenterZ = -0.010;
    const capGeo = new THREE.CylinderGeometry(capRadius, capRadius, capHeight, 36);
    capGeo.translate(0, baseH + capHeight * 0.5, capCenterZ);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0a2e5c,
      metalness: 0.55,
      roughness: 0.28,
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.castShadow = true;
    cGroup.add(capMesh);

    // 3. 极真实工业丝印聚酯热缩套管
    this.capLabelTexture = paintTexture(1024, 512, (ctx, w, h) => {
      ctx.fillStyle = '#0a2e5c';
      ctx.fillRect(0, 0, w, h);

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

    // 4. 电容器车削金属防爆顶盖
    const ventCapGeo = new THREE.CylinderGeometry(capRadius * 0.96, capRadius * 0.96, 0.003, 32);
    ventCapGeo.translate(0, baseH + capHeight + 0.0015, capCenterZ);
    cGroup.add(new THREE.Mesh(ventCapGeo, labMetal(0xcbd5e1, 0.85, 0.22)));

    // 5. CNC 分体式双耳金属抱箍支架
    const clampGroup = new THREE.Group();
    clampGroup.position.set(0, baseH + 0.022, capCenterZ);

    const ringGeo = new THREE.CylinderGeometry(capRadius + 0.002, capRadius + 0.002, 0.010, 32, 1, true);
    clampGroup.add(new THREE.Mesh(ringGeo, anodizedAluminum(0xe2e8f0, 0.22)));

    const earGeo = new THREE.BoxGeometry(0.008, 0.010, 0.008);
    const lEar = new THREE.Mesh(earGeo, anodizedAluminum(0xe2e8f0, 0.22));
    lEar.position.set(-capRadius - 0.004, 0, 0);
    clampGroup.add(lEar);
    const rEar = new THREE.Mesh(earGeo, anodizedAluminum(0xe2e8f0, 0.22));
    rEar.position.set(capRadius + 0.004, 0, 0);
    clampGroup.add(rEar);

    const thumbNutGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.005, 16);
    thumbNutGeo.rotateZ(Math.PI / 2);
    const thumbMat = polishedGold(0xd4af37);
    const lThumb = new THREE.Mesh(thumbNutGeo, thumbMat);
    lThumb.position.set(-capRadius - 0.009, 0, 0);
    clampGroup.add(lThumb);
    const rThumb = new THREE.Mesh(thumbNutGeo, thumbMat);
    rThumb.position.set(capRadius + 0.009, 0, 0);
    clampGroup.add(rThumb);

    cGroup.add(clampGroup);

    // 6. 前置真实 4mm 香蕉插座接线柱（红+正极、黑-负极）
    // 红（+正极）：世界坐标 (0.168, 0.012, -0.046)
    // 黑（-负极）：世界坐标 (0.112, 0.012, -0.046)
    const postZ = 0.034;
    this.createBindingPost(cGroup, new THREE.Vector3(0.028, baseH, postZ), 0xef4444);  // (+) 红
    this.createBindingPost(cGroup, new THREE.Vector3(-0.028, baseH, postZ), 0x1e293b); // (-) 黑

    // 7. 静电场物理微光光晕
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

  // ================= 4. 单刀双掷开关 (真实教学电木双掷闸刀开关，直接置于桌面) =================
  private buildSpdtSwitch(): void {
    const sGroup = new THREE.Group();
    sGroup.name = 'spdtSwitchGroup';
    // 前排左侧交互操作区，直接置于桌面 y = 0，世界坐标中心 (-0.180, 0, 0.115)
    sGroup.position.set(-0.180, 0, 0.115);
    sGroup.rotation.y = 0;

    const baseW = 0.140;
    const baseH = 0.014;
    const baseD = 0.086;

    // 1. 经典绝缘电木（红棕胶木 Bakelite）高质感底座
    const baseGeo = createChamferedBoxGeometry(baseW, baseH, baseD, 0.008, 0.0018);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x3a1d17,
      metalness: 0.06,
      roughness: 0.22,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    sGroup.add(baseMesh);

    // 四角紧固螺栓
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

    // 2. 三根物理隔离的纯黄铜冲压导电排
    const lBar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0016, 0.040), brassMat);
    lBar.position.set(-0.038, baseH + 0.0008, 0.004);
    sGroup.add(lBar);

    const rBar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0016, 0.040), brassMat);
    rBar.position.set(0.038, baseH + 0.0008, 0.004);
    sGroup.add(rBar);

    const cBar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0016, 0.040), brassMat);
    cBar.position.set(0, baseH + 0.0008, 0.004);
    sGroup.add(cBar);

    // 3. 前置三个实验室纯黄铜滚花接线柱
    // 端子 1 (左极/充电)：对应世界坐标 (-0.225, 0.014, 0.139)
    // 端子 0 (中极/公共)：对应世界坐标 (-0.180, 0.014, 0.139)
    // 端子 2 (右极/放电)：对应世界坐标 (-0.135, 0.014, 0.139)
    const postZ = 0.024;
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(-0.045, baseH, postZ), brassMat, 0xef4444); // 左极（红）
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(0.045, baseH, postZ), brassMat, 0xf59e0b);  // 右极（黄）
    this.createKnurledTerminalPost(sGroup, new THREE.Vector3(0, baseH, postZ), brassMat, 0x0284c7);     // 中极（蓝）

    // 4. 左侧与右侧真实 U 型弹性黄铜触刀夹
    this.switchLeftContactMesh = this.createKnifeJaw(sGroup, new THREE.Vector3(-0.024, baseH, -0.016), brassMat);
    this.switchLeftContactMesh.name = 'switchLeftContact';

    this.switchRightContactMesh = this.createKnifeJaw(sGroup, new THREE.Vector3(0.024, baseH, -0.016), brassMat);
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

    // 6. 动触刀旋转总成
    this.switchLeverGroup = new THREE.Group();
    this.switchLeverGroup.position.set(0, baseH + 0.016, -0.016);

    const bladeGeo = new THREE.BoxGeometry(0.0028, 0.030, 0.010);
    bladeGeo.translate(0, 0.015, 0);
    this.switchKnifeMesh = new THREE.Mesh(bladeGeo, brassMat);
    this.switchKnifeMesh.name = 'switchKnifeBlade';
    this.switchKnifeMesh.castShadow = true;
    this.switchLeverGroup.add(this.switchKnifeMesh);

    // 车削深红胶木手柄
    const handleGroup = new THREE.Group();
    handleGroup.position.set(0, 0.030, 0);

    const gripGeo = new THREE.CylinderGeometry(0.0055, 0.0075, 0.030, 16);
    gripGeo.translate(0, 0.015, 0);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.16, metalness: 0.1 });
    this.switchHandleMesh = new THREE.Mesh(gripGeo, handleMat);
    this.switchHandleMesh.name = 'switchHandle';
    this.switchHandleMesh.castShadow = true;
    handleGroup.add(this.switchHandleMesh);

    const tipGeo = new THREE.SphereGeometry(0.006, 16, 16);
    tipGeo.translate(0, 0.030, 0);
    handleGroup.add(new THREE.Mesh(tipGeo, handleMat));

    this.switchLeverGroup.add(handleGroup);
    sGroup.add(this.switchLeverGroup);

    // 触点瞬态微弱电弧火花点光源
    this.sparkLight = new THREE.PointLight(0x67e8f9, 0, 0.35);
    this.sparkLight.position.set(-0.024, baseH + 0.016, -0.016);
    sGroup.add(this.sparkLight);

    this.group.add(sGroup);
  }

  private createKnifeJaw(parent: THREE.Group, pos: THREE.Vector3, mat: THREE.Material): THREE.Mesh {
    const jawGroup = new THREE.Group();
    jawGroup.position.copy(pos);

    const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.004, 0.014), mat);
    baseBlock.position.set(0, 0.002, 0);
    jawGroup.add(baseBlock);

    const leafGeo = new THREE.BoxGeometry(0.008, 0.018, 0.0016);
    const fLeaf = new THREE.Mesh(leafGeo, mat);
    fLeaf.position.set(0, 0.011, 0.0028);
    jawGroup.add(fLeaf);

    const bLeaf = new THREE.Mesh(leafGeo, mat);
    bLeaf.position.set(0, 0.011, -0.0028);
    jawGroup.add(bLeaf);

    const lipGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 0.008, 8);
    lipGeo.rotateZ(Math.PI / 2);
    const fLip = new THREE.Mesh(lipGeo, mat);
    fLip.position.set(0, 0.020, 0.0036);
    jawGroup.add(fLip);
    const bLip = new THREE.Mesh(lipGeo, mat);
    bLip.position.set(0, 0.020, -0.0036);
    jawGroup.add(bLip);

    const hitGeo = new THREE.BoxGeometry(0.024, 0.028, 0.020);
    hitGeo.translate(0, 0.014, 0);
    const hitMesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    jawGroup.add(hitMesh);

    parent.add(jawGroup);
    return hitMesh;
  }

  private createKnurledTerminalPost(parent: THREE.Group, pos: THREE.Vector3, brassMat: THREE.Material, ringColor: number): void {
    const postGroup = new THREE.Group();
    postGroup.position.copy(pos);

    const ringGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.0024, 16);
    ringGeo.translate(0, 0.0012, 0);
    const ringMat = new THREE.MeshStandardMaterial({ color: ringColor, roughness: 0.3 });
    postGroup.add(new THREE.Mesh(ringGeo, ringMat));

    const studGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.018, 16);
    studGeo.translate(0, 0.009, 0);
    postGroup.add(new THREE.Mesh(studGeo, brassMat));

    const nutGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.008, 20);
    nutGeo.translate(0, 0.010, 0);
    postGroup.add(new THREE.Mesh(nutGeo, brassMat));

    const holeGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, 12);
    holeGeo.translate(0, 0.0145, 0);
    postGroup.add(new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x0f172a })));

    parent.add(postGroup);
  }

  private createKnurledPost(parent: THREE.Group, pos: THREE.Vector3, color: number): void {
    const brassMat = polishedGold(0xd4af37);
    this.createKnurledTerminalPost(parent, pos, brassMat, color);
  }

  // ================= 5. DIS 数字化微电流传感器 (直接置于桌面) =================
  private buildCurrentSensor(): void {
    const sensGroup = new THREE.Group();
    sensGroup.name = 'currentSensorGroup';
    this.currentSensorGroup = sensGroup;

    // 前排右侧操作区，直接置于桌面 y = 0，世界坐标中心 (0.040, 0, 0.115)
    sensGroup.position.set(0.040, 0, 0.115);
    sensGroup.rotation.y = 0;

    const bodyW = 0.110;
    const bodyH = 0.028;
    const bodyD = 0.082;

    // 传感器主体支架倾角总成（12° 人体工学仰角）
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.x = -Math.PI * 0.065;
    tiltGroup.position.set(0, bodyH * 0.5, 0);

    // 1. 阻燃工程白 ABS 外壳（底面平整贴合台面）
    const bodyGeo = createChamferedBoxGeometry(bodyW, bodyH, bodyD, 0.006, 0.0015);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.12, roughness: 0.30 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    tiltGroup.add(body);

    const gripGeo = new THREE.BoxGeometry(0.004, bodyH * 0.85, bodyD * 0.85);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.6 });
    const lGrip = new THREE.Mesh(gripGeo, gripMat);
    lGrip.position.set(-bodyW * 0.501, 0, 0);
    tiltGroup.add(lGrip);
    const rGrip = new THREE.Mesh(gripGeo, gripMat);
    rGrip.position.set(bodyW * 0.501, 0, 0);
    tiltGroup.add(rGrip);

    // 2. 液晶数显仪表屏
    this.sensorDisplayCanvas = document.createElement('canvas');
    this.sensorDisplayCanvas.width = 384;
    this.sensorDisplayCanvas.height = 192;
    this.sensorDisplayTexture = new THREE.CanvasTexture(this.sensorDisplayCanvas);
    this.sensorDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderCurrentSensorDisplay(0.0);

    const dispGeo = new THREE.PlaneGeometry(0.084, 0.044);
    const dispMat = new THREE.MeshBasicMaterial({
      map: this.sensorDisplayTexture,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.position.set(0, bodyH * 0.5 + 0.003, 0.006);
    dispMesh.rotation.x = -Math.PI / 2;
    tiltGroup.add(dispMesh);

    // 3. 采样状态微型指示灯
    const ledGeo = new THREE.SphereGeometry(0.003, 16, 16);
    this.sensorLedMaterial = labGlow(0x38bdf8, 0.9);
    const ledMesh = new THREE.Mesh(ledGeo, this.sensorLedMaterial);
    ledMesh.position.set(0.042, bodyH * 0.5 + 0.003, 0.024);
    tiltGroup.add(ledMesh);

    // 4. 标准实验室 4mm 安全香蕉插座（红+正极输入、黑-负极输出）
    // 红（+正极）：世界坐标 (0.014, 0.014, 0.139)
    // 黑（-负极）：世界坐标 (0.058, 0.014, 0.139)
    this.createBindingPost(tiltGroup, new THREE.Vector3(-0.026, bodyH * 0.5, 0.024), 0xef4444);
    this.createBindingPost(tiltGroup, new THREE.Vector3(0.018, bodyH * 0.5, 0.024), 0x1e293b);

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
    const ctx = this.sensorDisplayCanvas?.getContext('2d');
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

  // ================= 6. 台式数字存储示波器 (直接置于桌面，彻底杜绝闪烁) =================
  private buildOscilloscope(): void {
    const oGroup = new THREE.Group();
    // 右后方仪器区，直接置于桌面 y = 0，世界坐标中心 (0.340, 0, -0.080)，端正正对操作者视线
    oGroup.position.set(0.340, 0, -0.080);
    oGroup.rotation.y = 0;

    const chassisGroup = new THREE.Group();
    chassisGroup.rotation.x = -Math.PI * 0.11; // 18° 人体工学仰角
    chassisGroup.position.y = 0.056;

    const bodyW = 0.190;
    const bodyH = 0.125;
    const bodyD = 0.075;

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

    // 4个稳固防滑机箱支撑底脚（直接接触台面）
    const footGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.006, 16);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const foot1 = new THREE.Mesh(footGeo, footMat);
    foot1.position.set(-bodyW * 0.40, -bodyH * 0.5, bodyD * 0.35);
    chassisGroup.add(foot1);
    const foot2 = new THREE.Mesh(footGeo, footMat);
    foot2.position.set(bodyW * 0.40, -bodyH * 0.5, bodyD * 0.35);
    chassisGroup.add(foot2);
    const foot3 = new THREE.Mesh(footGeo, footMat);
    foot3.position.set(-bodyW * 0.40, -bodyH * 0.5, -bodyD * 0.35);
    chassisGroup.add(foot3);
    const foot4 = new THREE.Mesh(footGeo, footMat);
    foot4.position.set(bodyW * 0.40, -bodyH * 0.5, -bodyD * 0.35);
    chassisGroup.add(foot4);

    // 顶部便携折叠提手
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.060, bodyH * 0.5 + 0.004, 0),
      new THREE.Vector3(-0.048, bodyH * 0.5 + 0.024, 0),
      new THREE.Vector3(0.048, bodyH * 0.5 + 0.024, 0),
      new THREE.Vector3(0.060, bodyH * 0.5 + 0.004, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 20, 0.004, 10, false);
    chassisGroup.add(new THREE.Mesh(handleGeo, anodizedAluminum(0x94a3b8)));

    // 屏幕深黑前突机械外边框 (厚度 0.008m，彻底阻隔机身并消除 Z-fighting)
    const bezelGeo = createChamferedBoxGeometry(0.146, 0.098, 0.008, 0.003, 0.001);
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.18, metalness: 0.85 });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(-0.018, 0.004, bodyD * 0.5 + 0.004);
    chassisGroup.add(bezel);

    this.scopeDisplayCanvas = document.createElement('canvas');
    this.scopeDisplayCanvas.width = 1024;
    this.scopeDisplayCanvas.height = 640;
    this.scopeDisplayTexture = new THREE.CanvasTexture(this.scopeDisplayCanvas);
    this.scopeDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderOscilloscopeDisplay(undefined, []);

    // 屏幕严格浮置于边框正面（远离白色机箱表面 8.2mm，配合 polygonOffset 彻底消除任何闪烁）
    const screenGeo = new THREE.PlaneGeometry(0.140, 0.092);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.scopeDisplayTexture,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.scopeScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.scopeScreenMesh.position.set(-0.018, 0.004, bodyD * 0.5 + 0.0085);
    this.scopeScreenMesh.name = 'scopeScreenMesh';
    chassisGroup.add(this.scopeScreenMesh);

    // 控制区旋钮与按键
    const knobGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.010, 20);
    knobGeo.rotateX(Math.PI / 2);
    const knobMat = anodizedAluminum(0x64748b, 0.2);

    const timeKnob = new THREE.Mesh(knobGeo, knobMat);
    timeKnob.position.set(0.068, 0.034, bodyD * 0.5 + 0.005);
    chassisGroup.add(timeKnob);

    const voltKnob = new THREE.Mesh(knobGeo, knobMat);
    voltKnob.position.set(0.068, 0.006, bodyD * 0.5 + 0.005);
    chassisGroup.add(voltKnob);

    const runBtnGeo = new THREE.BoxGeometry(0.014, 0.010, 0.006);
    this.scopeRunBtnMesh = new THREE.Mesh(runBtnGeo, labGlow(0x10b981, 0.85));
    this.scopeRunBtnMesh.position.set(0.068, -0.020, bodyD * 0.5 + 0.004);
    this.scopeRunBtnMesh.name = 'scopeRunBtn';
    chassisGroup.add(this.scopeRunBtnMesh);

    const clearBtnGeo = new THREE.BoxGeometry(0.014, 0.009, 0.006);
    this.scopeClearBtnMesh = new THREE.Mesh(clearBtnGeo, new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 }));
    this.scopeClearBtnMesh.position.set(0.068, -0.035, bodyD * 0.5 + 0.004);
    this.scopeClearBtnMesh.name = 'scopeClearBtn';
    chassisGroup.add(this.scopeClearBtnMesh);

    // CH1 输入 BNC 金属同轴插座
    const bncOuterGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.012, 16);
    bncOuterGeo.rotateX(Math.PI / 2);
    const bncMesh = new THREE.Mesh(bncOuterGeo, anodizedAluminum(0x94a3b8));
    bncMesh.position.set(0.068, -0.048, bodyD * 0.5 + 0.005);
    chassisGroup.add(bncMesh);

    oGroup.add(chassisGroup);
    this.group.add(oGroup);
  }

  public renderOscilloscopeDisplay(telemetry?: CapacitorTelemetry, samples: readonly WaveformSample[] = []): void {
    if (!this.scopeDisplayCanvas) return;
    const ctx = this.scopeDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.scopeDisplayCanvas.width;
    const h = this.scopeDisplayCanvas.height;

    // 1. 液晶屏背光底色（深邃海洋蓝黑科研面板，杜绝死黑与模糊）
    ctx.fillStyle = '#061325';
    ctx.fillRect(0, 0, w, h);

    // 2. 顶部专业仪器状态顶栏 (Top Status HUD)
    ctx.fillStyle = '#091c36';
    ctx.fillRect(0, 0, w, 44);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.lineTo(w, 44);
    ctx.stroke();

    const switchPos = telemetry?.switchPosition ?? 'neutral';
    const isCharging = switchPos === 'charge';
    const isDischarging = switchPos === 'discharge';

    // 运行状态指示微标
    if (isCharging) {
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(16, 8, 120, 28);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶ 正在充电', 76, 22);
    } else if (isDischarging) {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(16, 8, 120, 28);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶ 正在放电', 76, 22);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(16, 8, 120, 28);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('● 待机就绪', 76, 22);
    }

    // 档位刻度与时基参数（高对比度发光文字）
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#fde047'; // 亮黄 CH1
    ctx.fillText('CH1: 1.00V/div', 156, 22);

    ctx.fillStyle = '#38bdf8'; // 青色 CH2
    ctx.fillText('CH2: 1.00mA/div', 320, 22);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('时基: 500ms/div (100kSa/s)', 490, 22);

    ctx.fillStyle = '#4ade80';
    ctx.textAlign = 'right';
    ctx.fillText('TRIG: AUTO  DC', w - 16, 22);

    // 3. 示波器网格绘图主区域 (10列 x 8行 物理示波网格)
    const padL = 72;
    const padR = 72;
    const padT = 54;
    const padB = 64;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // 绘图区背景（内凹深黑带微蓝荧光对比）
    ctx.fillStyle = '#030c18';
    ctx.fillRect(padL, padT, plotW, plotH);

    // 荧光青色网格线
    const cols = 10;
    const rows = 8;
    ctx.lineWidth = 1.2;
    for (let c = 0; c <= cols; c++) {
      const x = padL + (plotW * c) / cols;
      const isCenter = c === 5;
      ctx.strokeStyle = isCenter ? 'rgba(56, 189, 248, 0.45)' : 'rgba(56, 189, 248, 0.22)';
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();

      // 中心垂直线分度刻度 (5 ticks per div)
      if (isCenter) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.50)';
        for (let r = 0; r < rows; r++) {
          const divTop = padT + (plotH * r) / rows;
          const divStep = (plotH / rows) / 5;
          for (let k = 1; k < 5; k++) {
            const ty = divTop + k * divStep;
            ctx.beginPath();
            ctx.moveTo(x - 4, ty);
            ctx.lineTo(x + 4, ty);
            ctx.stroke();
          }
        }
      }
    }

    for (let r = 0; r <= rows; r++) {
      const y = padT + (plotH * r) / rows;
      const isCenter = r === 4;
      ctx.strokeStyle = isCenter ? 'rgba(56, 189, 248, 0.45)' : 'rgba(56, 189, 248, 0.22)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();

      // 中心水平线分度刻度
      if (isCenter) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.50)';
        for (let c = 0; c < cols; c++) {
          const divL = padL + (plotW * c) / cols;
          const divStep = (plotW / cols) / 5;
          for (let k = 1; k < 5; k++) {
            const tx = divL + k * divStep;
            ctx.beginPath();
            ctx.moveTo(tx, y - 4);
            ctx.lineTo(tx, y + 4);
            ctx.stroke();
          }
        }
      }
    }

    // 网格外框
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // 4. 坐标轴基准线与两侧刻度标签
    // CH1 (电压)：0V 设在从下往上第 1 格 (r = 7, 即 padT + plotH * 7/8)
    // 垂直 1V/div: 1V(r=6), 2V(r=5), 3V(r=4 中心线), 4V(r=3), 5V(r=2)
    const yVolt0 = padT + (plotH * 7) / 8;
    const yCurr0 = padT + (plotH * 4) / 8; // CH2 (电流 0mA) 居中于水平中心线

    // 绘制 0V 与 0mA 标识指针
    // 左侧 CH1 [1 ▶] 游标
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(padL - 26, yVolt0 - 10);
    ctx.lineTo(padL - 6, yVolt0);
    ctx.lineTo(padL - 26, yVolt0 + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', padL - 18, yVolt0);

    // 左侧电压刻度数字 (0V ~ 5V)
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right';
    for (let v = 0; v <= 5; v++) {
      const vy = yVolt0 - (v * plotH) / 8;
      ctx.fillText(`${v}V`, padL - 8, vy);
    }

    // 右侧 CH2 [◀ 2] 游标
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(padL + plotW + 26, yCurr0 - 10);
    ctx.lineTo(padL + plotW + 6, yCurr0);
    ctx.lineTo(padL + plotW + 26, yCurr0 + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2', padL + plotW + 18, yCurr0);

    // 右侧电流刻度数字 (-3mA ~ +3mA)
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    for (let i = -3; i <= 3; i++) {
      const iy = yCurr0 - (i * plotH) / 8;
      const sign = i > 0 ? '+' : '';
      ctx.fillText(`${sign}${i}mA`, padL + plotW + 8, iy);
    }

    // 5. 波形数据投影与连续绘制
    const tWindow = 5.0; // 5.0 秒时间窗口 (10格 x 500ms/div)
    const sampleCount = samples.length;
    const latestTime = sampleCount > 0 ? samples[sampleCount - 1].time : (telemetry?.time ?? 0);
    const tMin = Math.max(0, latestTime - tWindow);

    const toX = (t: number) => padL + ((t - tMin) / tWindow) * plotW;
    const toYVolt = (v: number) => yVolt0 - (v * plotH) / 8;
    const toYCurr = (i: number) => yCurr0 - (i * plotH) / 8;

    // 5.1 绘制 CH1 电压波形 (鲜明亮黄色，带柔和发光)
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4.0;
    ctx.shadowColor = 'rgba(250, 204, 21, 0.45)';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    if (sampleCount >= 2) {
      let started = false;
      let lastX = padL;
      let lastY = yVolt0;
      for (let idx = 0; idx < sampleCount; idx++) {
        const s = samples[idx];
        if (s.time < tMin - 0.2) continue;
        const sx = Math.max(padL, Math.min(padL + plotW, toX(s.time)));
        const sy = Math.max(padT, Math.min(padT + plotH, toYVolt(s.voltageCapacitor)));
        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }
        lastX = sx;
        lastY = sy;
      }
      ctx.stroke();

      // CH1 扫描头高亮亮斑
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 无采样时：绘制当前静止电容电压平扫基线
      const curV = telemetry?.voltageCapacitor ?? 0.0;
      const yNow = toYVolt(curV);
      ctx.moveTo(padL, yNow);
      ctx.lineTo(padL + plotW, yNow);
      ctx.stroke();
    }
    ctx.restore();

    // 5.2 绘制 CH2 瞬态电流波形 (青色发光曲线)
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.2;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    if (sampleCount >= 2) {
      let started = false;
      let lastX = padL;
      let lastY = yCurr0;
      for (let idx = 0; idx < sampleCount; idx++) {
        const s = samples[idx];
        if (s.time < tMin - 0.2) continue;
        const sx = Math.max(padL, Math.min(padL + plotW, toX(s.time)));
        const sy = Math.max(padT, Math.min(padT + plotH, toYCurr(s.currentMa)));
        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }
        lastX = sx;
        lastY = sy;
      }
      ctx.stroke();

      // CH2 扫描头高亮亮斑
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 无采样时：绘制 0mA 中心基准平扫线
      ctx.moveTo(padL, yCurr0);
      ctx.lineTo(padL + plotW, yCurr0);
      ctx.stroke();
    }
    ctx.restore();

    // 6. 底部大型超高清实时测量读数栏 (Bottom Telemetry Bar)
    ctx.fillStyle = '#08172c';
    ctx.fillRect(0, h - 54, w, 54);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(0, h - 54);
    ctx.lineTo(w, h - 54);
    ctx.stroke();

    const curV = telemetry?.voltageCapacitor ?? 0.0;
    const curI = telemetry?.currentMa ?? 0.0;
    const curQ = telemetry?.chargeMilliCoulomb ?? 0.0;
    const curTau = telemetry?.timeConstantTau ?? 1.0;

    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // CH1 (电压)
    ctx.fillStyle = '#facc15';
    ctx.fillText(`CH1(Uc): ${curV.toFixed(2)}V`, 24, h - 27);

    // CH2 (电流)
    ctx.fillStyle = '#38bdf8';
    const sign = curI > 0 ? '+' : '';
    ctx.fillText(`CH2(I): ${sign}${curI.toFixed(2)}mA`, 250, h - 27);

    // Q (电荷量)
    ctx.fillStyle = '#4ade80';
    ctx.fillText(`Q: ${curQ.toFixed(2)}mC`, 490, h - 27);

    // 时间常数 tau
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`τ(RC): ${curTau.toFixed(2)}s`, 680, h - 27);

    // 右侧清屏按键提示
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(w - 120, h - 42, 100, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('清屏重测', w - 70, h - 27);

    this.scopeDisplayTexture.needsUpdate = true;
  }

  // ================= 7. 严格符合工程规范的横平竖直直角走线导线系统 =================
  private buildWiresAndParticles(): void {
    // 实验室接线与规范布局：
    // 1. 所有导线做直，转角处呈标准 90° 直角；
    // 2. 器材排布整齐，前排与后排分别在统一的基准轴线对齐；
    // 3. 所有香蕉插头垂直稳固插入接线端，导线直角折入走线通道。

    // 导线1 (红): 双节电池组正极 -> 单刀双掷开关左极 (充电触点)
    const wire1Pts = [
      new THREE.Vector3(-0.328, 0.050, -0.034), // 电池正极插头顶部
      new THREE.Vector3(-0.328, 0.060, -0.034), // 垂直上升
      new THREE.Vector3(-0.385, 0.060, -0.034), // 直角折向左侧走线区
      new THREE.Vector3(-0.385, 0.006, -0.034), // 直角折向下贴近台面
      new THREE.Vector3(-0.385, 0.006, 0.168),  // 沿左侧纵向直行至前排主通道
      new THREE.Vector3(-0.225, 0.006, 0.168),  // 直角折向右横向直行至开关左端通道
      new THREE.Vector3(-0.225, 0.048, 0.168),  // 直角折向上垂直升起
      new THREE.Vector3(-0.225, 0.048, 0.139),  // 直角折向后平移至插座正上方
      new THREE.Vector3(-0.225, 0.040, 0.139),  // 直角垂直插入开关左触点插头
    ];

    // 导线2 (青): 开关公共极 (中极) -> 电流传感器正输入极 (红极)
    const wire2Pts = [
      new THREE.Vector3(-0.180, 0.040, 0.139), // 开关公共极插头顶部
      new THREE.Vector3(-0.180, 0.048, 0.139), // 垂直上升
      new THREE.Vector3(-0.180, 0.048, 0.168), // 直角折向前至前排主通道
      new THREE.Vector3(-0.180, 0.006, 0.168), // 直角折向下贴近台面
      new THREE.Vector3(0.014, 0.006, 0.168),  // 沿前排通道横向直行至传感器正极端
      new THREE.Vector3(0.014, 0.048, 0.168),  // 直角折向上垂直升起
      new THREE.Vector3(0.014, 0.048, 0.139),  // 直角折向后平移至插座正上方
      new THREE.Vector3(0.014, 0.040, 0.139),  // 直角垂直插入电流传感器正极
    ];

    // 导线3 (蓝): 电流传感器负输出极 (黑极) -> 电容器正极 (红极)
    const wire3Pts = [
      new THREE.Vector3(0.058, 0.040, 0.139),  // 传感器负极插头顶部
      new THREE.Vector3(0.058, 0.048, 0.139),  // 垂直上升
      new THREE.Vector3(0.058, 0.048, 0.168),  // 直角折向前至前排主通道
      new THREE.Vector3(0.058, 0.006, 0.168),  // 直角折向下贴近台面
      new THREE.Vector3(0.168, 0.006, 0.168),  // 横向直行至电容器正极轴线
      new THREE.Vector3(0.168, 0.006, -0.015), // 直角折向后纵向直行至电容器基座前
      new THREE.Vector3(0.168, 0.048, -0.015), // 直角折向上垂直升起
      new THREE.Vector3(0.168, 0.048, -0.046), // 直角折向后平移至插头正上方
      new THREE.Vector3(0.168, 0.038, -0.046), // 直角垂直接入电容器正极插头
    ];

    // 导线4 (黑): 地线总回路 (电容器负极 -> 双节电池组负极)
    const wire4Pts = [
      new THREE.Vector3(0.112, 0.038, -0.046),  // 电容器负极主插头顶部
      new THREE.Vector3(0.112, 0.048, -0.046),  // 垂直上升
      new THREE.Vector3(0.112, 0.048, -0.015),  // 直角折向前移出电容底座
      new THREE.Vector3(0.112, 0.006, -0.015),  // 直角折向下贴近台面
      new THREE.Vector3(0.065, 0.006, -0.015),  // 横向折入变阻器与电容器之间的纵向通道
      new THREE.Vector3(0.065, 0.006, -0.150),  // 直角折向后纵向直行至后排总地线走线槽
      new THREE.Vector3(-0.272, 0.006, -0.150), // 直角折向左横向直行至电池负极轴线
      new THREE.Vector3(-0.272, 0.006, -0.055), // 直角折向前纵向直行至电池负极后侧
      new THREE.Vector3(-0.272, 0.060, -0.055), // 直角折向上垂直升起
      new THREE.Vector3(-0.272, 0.060, -0.034), // 直角折向前平移至插头正上方
      new THREE.Vector3(-0.272, 0.050, -0.034), // 直角垂直接入双节电池组负极插头
    ];

    // 导线5 (黄): 开关放电侧右极 -> 滑动变阻器滑杆端子 C
    const wire5Pts = [
      new THREE.Vector3(-0.135, 0.040, 0.139), // 单刀双掷放电触点插头
      new THREE.Vector3(-0.135, 0.048, 0.139), // 垂直上升
      new THREE.Vector3(-0.135, 0.048, 0.065), // 直角折向后移出开关基座
      new THREE.Vector3(-0.135, 0.006, 0.065), // 直角折向下贴近台面
      new THREE.Vector3(-0.135, 0.006, 0.025), // 直角折向后进入中间横向通道
      new THREE.Vector3(0.045, 0.006, 0.025),  // 沿中间通道横向直行至变阻器右支架外侧
      new THREE.Vector3(0.045, 0.006, -0.080), // 直角折向后纵向直行至端子 C 轴线
      new THREE.Vector3(0.045, 0.088, -0.080), // 直角折向上垂直升起至滑杆高度
      new THREE.Vector3(0.027, 0.088, -0.080), // 直角折向左平移至端子 C 正上方
      new THREE.Vector3(0.027, 0.080, -0.080), // 直角垂直接入滑动变阻器滑杆端子 C 插头
    ];

    // 导线6 (黑): 滑动变阻器接线端 A -> 电容器负极 (叠插于导线4插头后孔中)
    const wire6Pts = [
      new THREE.Vector3(-0.147, 0.048, -0.061), // 滑动变阻器接线端 A
      new THREE.Vector3(-0.147, 0.056, -0.061), // 垂直上升
      new THREE.Vector3(-0.165, 0.056, -0.061), // 直角折向左移出变阻器左侧板
      new THREE.Vector3(-0.165, 0.056, -0.005), // 直角折向前进入中间内侧横向通道
      new THREE.Vector3(-0.165, 0.006, -0.005), // 直角折向下贴近台面
      new THREE.Vector3(0.090, 0.006, -0.005),  // 沿中间通道横向直行至电容器负极前方
      new THREE.Vector3(0.090, 0.006, -0.046),  // 直角折向后纵向直行至电容器负极侧边
      new THREE.Vector3(0.090, 0.072, -0.046),  // 直角折向上升起至叠插高度
      new THREE.Vector3(0.112, 0.072, -0.046),  // 直角折向右平移至叠插孔正上方
      new THREE.Vector3(0.112, 0.064, -0.046),  // 直角垂直插入电容器负极叠插孔
    ];

    // 示波器专用高频探头屏蔽线（自电流传感器 BNC 端口横平竖直敷设至示波器 CH1）
    const bncCablePts = [
      new THREE.Vector3(0.099, 0.014, 0.105),   // 传感器 BNC 输出端口
      new THREE.Vector3(0.125, 0.014, 0.105),   // 直角水平横向引出
      new THREE.Vector3(0.125, 0.006, 0.105),   // 直角折向下贴近台面
      new THREE.Vector3(0.125, 0.006, 0.190),   // 直角折向前进入前外侧电缆通道
      new THREE.Vector3(0.408, 0.006, 0.190),   // 横向直行至示波器 CH1 输入端口正前方
      new THREE.Vector3(0.408, 0.006, 0.010),   // 直角折向后纵向直行至示波器面板前
      new THREE.Vector3(0.408, 0.0252, 0.010),  // 直角垂直上升至 CH1 端口高度
      new THREE.Vector3(0.408, 0.0252, -0.0238),// 直角水平插入示波器 CH1 BNC 端口
    ];

    // 构造高质感横平竖直绝缘导线体
    const wire1Path = this.addOrthogonalWire(wire1Pts, 0xef4444); // 红色电池正极电源线
    const wire2Path = this.addOrthogonalWire(wire2Pts, 0x38bdf8); // 青色传感器输入信号线
    const wire3Path = this.addOrthogonalWire(wire3Pts, 0x0284c7); // 钴蓝电容器充电线
    const wire4Path = this.addOrthogonalWire(wire4Pts, 0x334155); // 经典深灰后槽地回路
    const wire5Path = this.addOrthogonalWire(wire5Pts, 0xf59e0b); // 琥珀黄放电线
    const wire6Path = this.addOrthogonalWire(wire6Pts, 0x334155); // 经典深灰放电回路
    this.addOrthogonalWire(bncCablePts, 0x1e293b, 0.0022);        // 示波器探头同轴线

    const upDir = new THREE.Vector3(0, 1, 0);

    // 为每根导线两端安装真实的 4mm 实验室叠插香蕉插头
    this.addBananaPlug(new THREE.Vector3(-0.328, 0.024, -0.034), upDir, 0xef4444);
    this.addBananaPlug(new THREE.Vector3(-0.225, 0.014, 0.139), upDir, 0xef4444);

    this.addBananaPlug(new THREE.Vector3(-0.180, 0.014, 0.139), upDir, 0x38bdf8);
    this.addBananaPlug(new THREE.Vector3(0.014, 0.014, 0.139), upDir, 0x38bdf8);

    this.addBananaPlug(new THREE.Vector3(0.058, 0.014, 0.139), upDir, 0x0284c7);
    this.addBananaPlug(new THREE.Vector3(0.168, 0.012, -0.046), upDir, 0x0284c7);

    // 电容器负极端：Wire 4 主插头插在接线柱上 (Y=0.012)，Wire 6 叠插头插在 Wire 4 尾部 (Y=0.038)
    this.addBananaPlug(new THREE.Vector3(0.112, 0.012, -0.046), upDir, 0x334155);
    this.addBananaPlug(new THREE.Vector3(-0.272, 0.024, -0.034), upDir, 0x334155);

    this.addBananaPlug(new THREE.Vector3(-0.135, 0.014, 0.139), upDir, 0xf59e0b);
    this.addBananaPlug(new THREE.Vector3(0.027, 0.054, -0.080), upDir, 0xf59e0b);

    this.addBananaPlug(new THREE.Vector3(-0.147, 0.022, -0.061), upDir, 0x334155);
    this.addBananaPlug(new THREE.Vector3(0.112, 0.038, -0.046), upDir, 0x334155); // 叠插头

    // 示波器探头 BNC 双端金属锁紧套管
    const bncPlugGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.014, 16);
    const bncPlugMat = labMetal(0xd1d5db, 0.95, 0.15);

    const sBncPlug = new THREE.Mesh(bncPlugGeo, bncPlugMat);
    sBncPlug.rotateZ(Math.PI / 2);
    sBncPlug.position.set(0.112, 0.014, 0.105);
    this.group.add(sBncPlug);

    const oBncPlug = new THREE.Mesh(bncPlugGeo, bncPlugMat);
    oBncPlug.rotateX(Math.PI / 2);
    oBncPlug.position.set(0.408, 0.0252, -0.010);
    this.group.add(oBncPlug);

    // 导线样条曲线对象，用于粒子巡游
    this.chargeWireSplines = [
      wire1Path,
      wire2Path,
      wire3Path,
      wire4Path,
    ];

    this.dischargeWireSplines = [
      this.createOrthogonalPath(wire3Pts.slice().reverse()),
      this.createOrthogonalPath(wire2Pts.slice().reverse()),
      wire5Path,
      wire6Path,
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

  /**
   * 构建严格横平竖直、转弯处呈标准直角（带微米级高精规整机械导角）的曼哈顿布线路径
   * 杜绝任何斜拉与随性弯垂，所有线段严格平行于坐标轴
   */
  private createOrthogonalPath(waypoints: THREE.Vector3[], cornerRadius = 0.004): THREE.CurvePath<THREE.Vector3> {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const pts: THREE.Vector3[] = [];
    for (const p of waypoints) {
      if (pts.length === 0 || pts[pts.length - 1].distanceTo(p) > 1e-5) {
        pts.push(p);
      }
    }
    if (pts.length < 2) return path;
    if (pts.length === 2) {
      path.add(new THREE.LineCurve3(pts[0], pts[1]));
      return path;
    }

    let prevCornerEnd = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const pPrev = pts[i - 1];
      const pCurr = pts[i];
      const pNext = pts[i + 1];

      const d1 = pCurr.clone().sub(pPrev);
      const d2 = pNext.clone().sub(pCurr);
      const l1 = d1.length();
      const l2 = d2.length();
      if (l1 < 1e-5 || l2 < 1e-5) continue;

      const dir1 = d1.clone().normalize();
      const dir2 = d2.clone().normalize();
      const cross = dir1.clone().cross(dir2);

      // 共线线段直接延续，不添加转角
      if (cross.length() < 1e-4) {
        continue;
      }

      const curR = Math.min(cornerRadius, l1 * 0.45, l2 * 0.45);
      const cornerStart = pCurr.clone().sub(dir1.multiplyScalar(curR));
      const cornerEnd = pCurr.clone().add(dir2.multiplyScalar(curR));

      if (prevCornerEnd.distanceTo(cornerStart) > 1e-5) {
        path.add(new THREE.LineCurve3(prevCornerEnd, cornerStart));
      }
      path.add(new THREE.QuadraticBezierCurve3(cornerStart, pCurr, cornerEnd));
      prevCornerEnd = cornerEnd;
    }

    const lastPt = pts[pts.length - 1];
    if (prevCornerEnd.distanceTo(lastPt) > 1e-5) {
      path.add(new THREE.LineCurve3(prevCornerEnd, lastPt));
    }
    return path;
  }

  private addOrthogonalWire(
    pts: THREE.Vector3[],
    color: number,
    radius = 0.0025,
    cornerR = 0.004
  ): THREE.CurvePath<THREE.Vector3> {
    const path = this.createOrthogonalPath(pts, cornerR);
    const geo = new THREE.TubeGeometry(path, 80, radius, 12, false);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.25 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    this.group.add(mesh);
    return path;
  }

  private addJumperTube(pts: THREE.Vector3[], color: number, radius = 0.0026): void {
    this.addOrthogonalWire(pts, color, radius);
  }

  private getSplinesPoint(splines: THREE.Curve<THREE.Vector3>[], globalU: number): THREE.Vector3 {
    const n = splines.length;
    const scaled = ((globalU % 1) + 1) % 1 * n;
    const idx = Math.min(Math.floor(scaled), n - 1);
    const localU = scaled - idx;
    return splines[idx].getPoint(localU);
  }

  // ================= 8. 标牌 =================
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
      this.targetBladeAngle = -0.96; // 约 -55° 切入左侧中空双簧片内部
      this.triggerSpark();
    } else if (pos === 'discharge') {
      this.targetBladeAngle = 0.96;  // 约 +55° 切入右侧中空双簧片内部
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
        this.sparkLight.position.set(-0.024, 0.022, -0.016);
      } else if (this.lastSwitchPos === 'discharge') {
        this.sparkLight.position.set(0.024, 0.022, -0.016);
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
      const isSwitchChanged = telemetry.switchPosition !== this.lastRenderedPowerSwitchPos;
      if (
        Math.abs(supply - this.lastRenderedSupply) > 0.05 ||
        Math.abs(cur - this.lastRenderedPowerCurrent) > 0.05 ||
        isSwitchChanged
      ) {
        this.lastRenderedSupply = supply;
        this.lastRenderedPowerCurrent = cur;
        this.lastRenderedPowerSwitchPos = telemetry.switchPosition;
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

      // 7. 实时更新桌面示波器小屏幕波形（平滑节流防抖）
      if (samples) {
        const sampleCount = samples.length;
        const curChanged = Math.abs(cur - this.scopeLastCurrent) > 0.02;
        const volChanged = Math.abs(vol - this.scopeLastVoltage) > 0.02;
        const posChanged = telemetry.switchPosition !== this.scopeLastPos;
        const now = performance.now();
        if (
          posChanged ||
          curChanged ||
          volChanged ||
          (sampleCount !== this.scopeLastSampleCount && (now - this.scopeLastRenderTime > 33)) ||
          (now - this.scopeLastRenderTime > 200)
        ) {
          this.scopeLastSampleCount = sampleCount;
          this.scopeLastCurrent = cur;
          this.scopeLastVoltage = vol;
          this.scopeLastPos = telemetry.switchPosition;
          this.scopeLastRenderTime = now;
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
    if (this.nanfuTexture) {
      this.nanfuTexture.dispose();
    }
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
