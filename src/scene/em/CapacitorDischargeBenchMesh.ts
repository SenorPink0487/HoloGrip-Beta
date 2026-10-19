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
 * 创建面向 +Z 方向的正视圆角矩形机箱几何体
 * X 宽度、Y 高度，4 个转角采用平滑圆角过渡，在 XY 平面建模并沿 Z 轴挤出，
 * 具备精密机械前后边缘倒角，完美还原参考图机箱外观
 */
function createFrontFacingRoundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.003,
  bevelSegments = 4
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.001, radius);
  const w = width * 0.5 - rx;
  const h = height * 0.5 - rx;

  shape.moveTo(-w, -h - rx);
  shape.lineTo(w, -h - rx);
  shape.quadraticCurveTo(w + rx, -h - rx, w + rx, -h);
  shape.lineTo(w + rx, h);
  shape.quadraticCurveTo(w + rx, h + rx, w, h + rx);
  shape.lineTo(-w, h + rx);
  shape.quadraticCurveTo(-w - rx, h + rx, -w - rx, h);
  shape.lineTo(-w - rx, -h);
  shape.quadraticCurveTo(-w - rx, -h - rx, -w, -h - rx);

  const bSize = Math.min(rx * 0.5, bevel);
  const extrudeDepth = Math.max(0.001, depth - bSize * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: bevelSegments,
  });
  geo.center();
  return geo;
}

/**
 * 创建带机械斜切倒角的仪器梯形支撑底脚几何体
 * 完美还原参考图底部左右两侧斜切梯形防滑底脚
 */
function createTrapezoidFootGeometry(
  widthTop: number,
  widthBottom: number,
  height: number,
  depth: number,
  bevel = 0.0015
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfTop = widthTop * 0.5;
  const halfBot = widthBottom * 0.5;

  shape.moveTo(-halfTop, height);
  shape.lineTo(halfTop, height);
  shape.lineTo(halfBot, 0);
  shape.lineTo(-halfBot, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.center();
  geo.translate(0, height * 0.5, 0);
  return geo;
}

/**
 * 3D 螺旋线曲线，用于创建逼真的不锈钢受压螺旋弹簧
 */
class HelicalSpringCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    public radius: number,
    public height: number,
    public turns: number
  ) {
    super();
  }
  getPoint(t: number): THREE.Vector3 {
    const angle = t * Math.PI * 2 * this.turns;
    const x = Math.cos(angle) * this.radius;
    const y = (t - 0.5) * this.height;
    const z = Math.sin(angle) * this.radius;
    return new THREE.Vector3(x, y, z);
  }
}

/**
 * 创建高仿真实验室 12 瓣竖槽防滑滚花旋钮几何体 (Fluted Thumb Nut)
 * 完美对应参考图 J2354 变阻器红/黑接线柱外壳
 */
function createFlutedThumbNutGeometry(
  outerR = 0.0055,
  innerR = 0.0046,
  height = 0.009,
  flutes = 12
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const count = flutes * 2;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0006,
    bevelSegments: 2,
  });
  geo.center();
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * 创建真实工业级压铸端板支架实体几何体 (J2354 Cast Iron Side Bracket)
 * 具备双桥形接触底脚、中心拱形镂空避空、中央瓷管承窝、倾斜收腰筋板、前端接线耳板以及顶部滑杆支承座
 */
function createRheostatCastBracketGeometry(bW = 0.012): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // 在 (Z, Y) 坐标平面绘制支架侧轮廓
  // 后底脚底面: z from -0.022 to -0.010, y = 0 (紧贴台面)
  shape.moveTo(-0.022, 0);
  shape.lineTo(-0.010, 0);

  // 底面中央拱形镂空避空槽: z from -0.010 to +0.012, 向上拱起至 y = 0.0045
  shape.quadraticCurveTo(0.001, 0.005, 0.012, 0);

  // 前底脚底面: z from +0.012 to +0.026, y = 0 (紧贴台面)
  shape.lineTo(0.026, 0);

  // 前底脚前立面垂直上升至 y = 0.010
  shape.lineTo(0.026, 0.010);

  // 斜切过渡至前端接线耳台阶
  shape.lineTo(0.024, 0.016);

  // 前端接线耳上安装台面: y = 0.022, z 从 0.024 回退至 0.014 (端子中心 z = 0.019)
  shape.lineTo(0.024, 0.022);
  shape.lineTo(0.014, 0.022);

  // 斜向收腰过渡至中央瓷管安装承窝前沿
  shape.lineTo(0.012, 0.028);

  // 倾斜加强筋柱向上延伸至顶部滑杆承窝前沿
  shape.lineTo(0.006, 0.054);

  // 顶部滑杆支承座平滑圆弧包顶
  shape.quadraticCurveTo(0, 0.061, -0.006, 0.054);

  // 后部斜面平滑过渡回中央瓷管承窝后沿
  shape.lineTo(-0.014, 0.028);

  // 倾斜背脊向下过渡至后底脚上表面
  shape.lineTo(-0.022, 0.010);

  // 闭合轮廓
  shape.closePath();

  const extrudeSettings = {
    steps: 1,
    depth: bW,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 3,
  };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // 沿厚度 Z 轴居中
  geo.translate(0, 0, -bW * 0.5);
  // 绕 Y 轴旋转 -90°，使厚度转为 X 轴，Y 为高度，Z 为前后进深，完美对齐世界坐标系
  geo.rotateY(-Math.PI / 2);
  return geo;
}

/**
 * 冲压不锈钢十字沉头紧固螺丝 (Phillips Machine Screw Head)
 */
function createPhillipsScrewMesh(radius = 0.0018, height = 0.0010): THREE.Mesh {
  const headGeo = new THREE.CylinderGeometry(radius, radius * 0.88, height, 16);
  headGeo.rotateX(Math.PI / 2);
  const texture = paintTexture(128, 128, (rawCtx, w, h) => {
    const c = rawCtx as unknown as CanvasRenderingContext2D;
    c.fillStyle = '#cbd5e1';
    c.fillRect(0, 0, w, h);

    if (typeof c.createRadialGradient === 'function') {
      const grad = c.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
      grad.addColorStop(0, '#f8fafc');
      grad.addColorStop(0.7, '#cbd5e1');
      grad.addColorStop(1, '#64748b');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }

    // 十字槽 (Phillips Cross Slot)
    c.fillStyle = '#1e293b';
    const cw = 16;
    const cl = 80;
    c.fillRect((w - cw) / 2, (h - cl) / 2, cw, cl);
    c.fillRect((w - cl) / 2, (h - cw) / 2, cl, cw);

    // 中心微型冲压下凹
    c.fillStyle = '#0f172a';
    c.beginPath();
    c.arc(w / 2, h / 2, 9, 0, Math.PI * 2);
    c.fill();
  });
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.92,
    roughness: 0.22,
  });
  return new THREE.Mesh(headGeo, mat);
}

/**
 * 经典电磁学与RC电路实验台：电容器充放电实验
 * 实验器材直接置于实验桌台面（无多余底板），规范柔性重力自然下垂导线敷设，杜绝粗糙穿模与屏幕闪烁
 */
export class CapacitorDischargeBenchMesh {
  public group: THREE.Group;

  // 可交互 3D 目标（用于射线检测拾取与点击）
  public switchKnifeMesh!: THREE.Mesh;
  public switchLeftContactMesh!: THREE.Group | THREE.Mesh;
  public switchRightContactMesh!: THREE.Group | THREE.Mesh;
  public switchHandleMesh!: THREE.Mesh;
  public switchLeverGroup!: THREE.Group;
  public spdtSwitchGroup!: THREE.Group;
  public powerKnobMesh!: THREE.Mesh;
  public powerSwitchMesh!: THREE.Mesh;
  public batteryPackGroup!: THREE.Group; // 双节干电池串联组
  public rheostatGroup!: THREE.Group;
  public rheostatSliderGroup!: THREE.Group;
  private rheostatPlateTexture?: THREE.CanvasTexture;
  private rheostatPlateCanvas?: HTMLCanvasElement;
  public capacitorGroup!: THREE.Group;
  public currentSensorGroup!: THREE.Group;

  // 单刀双掷开关动触刀组件（围绕铰链轴平滑旋转）
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
  private renderRheostatPlate(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    resistanceOhm: number
  ): void {
    // 航天级阳极氧化喷砂银铝拉丝底纹
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);

    // 精细金属拉丝质感横纹
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? '#f1f5f9' : '#cbd5e1';
      ctx.fillRect(0, y, w, 1);
    }

    // 工业级外围双重冲压暗边框
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // 四角冲压固定实心铆钉
    const rivetR = 5;
    for (const [rx, ry] of [
      [12, 12],
      [w - 12, 12],
      [12, h - 12],
      [w - 12, h - 12],
    ]) {
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(rx, ry, rivetR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (typeof ctx.fillText === 'function') {
      // 顶部型号与品名
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('J2354 滑动变阻器', w / 2, 12);

      // 下部核心额定参数：阻值与额定电流
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 36px monospace';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${resistanceOhm.toFixed(0)}Ω  0.5A`, w / 2, h - 12);
    }
  }

  private createJ2354BindingPost(
    parent: THREE.Group,
    pos: THREE.Vector3,
    color: number,
    nutMat?: THREE.Material
  ): THREE.Group {
    const postGroup = new THREE.Group();
    postGroup.position.copy(pos);

    // 1. 底层黄铜六角紧固螺母 (M4 Brass Hex Base Nut)
    const brassMat = polishedGold(0xd4af37);
    const hexGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.0024, 6);
    hexGeo.translate(0, 0.0012, 0);
    postGroup.add(new THREE.Mesh(hexGeo, brassMat));

    // 2. 镀黄铜螺纹导电立柱 (Brass Threaded Stud)
    const studGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.014, 16);
    studGeo.translate(0, 0.007, 0);
    postGroup.add(new THREE.Mesh(studGeo, brassMat));

    // 3. 12 瓣竖槽防滑滚花绝缘工程塑料旋钮套 (12-Fluted Knurled Thumb Nut)
    const thumbMat = nutMat ?? new THREE.MeshStandardMaterial({
      color,
      roughness: color === 0xdc2626 ? 0.28 : 0.35,
      metalness: color === 0xdc2626 ? 0.12 : 0.15,
    });
    const thumbGeo = createFlutedThumbNutGeometry(0.0055, 0.0046, 0.009, 12);
    thumbGeo.translate(0, 0.008, 0);
    const thumbMesh = new THREE.Mesh(thumbGeo, thumbMat);
    thumbMesh.castShadow = true;
    postGroup.add(thumbMesh);

    // 4. 顶部标准 4mm 安全香蕉插头插孔 (Banana Plug Socket Bore)
    const holeGeo = new THREE.CylinderGeometry(0.0021, 0.0021, 0.005, 16);
    holeGeo.translate(0, 0.0125, 0);
    postGroup.add(new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x0f172a })));

    parent.add(postGroup);
    return postGroup;
  }

  private createCastBracket(
    parent: THREE.Group,
    isLeft: boolean,
    length: number,
    bW = 0.012
  ): THREE.Group {
    const bGroup = new THREE.Group();
    const xPos = isLeft ? (-length * 0.5 - bW * 0.5) : (length * 0.5 + bW * 0.5);
    bGroup.position.set(xPos, 0, 0);

    // 1. 压铸深灰铸铁本体 (深邃炭黑铸铁微光质感，拒绝廉价塑料黑)
    const bracketGeo = createRheostatCastBracketGeometry(bW);
    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0x22272e,
      roughness: 0.52,
      metalness: 0.40,
    });
    const bracketMesh = new THREE.Mesh(bracketGeo, bracketMat);
    bracketMesh.castShadow = true;
    bracketMesh.receiveShadow = true;
    bGroup.add(bracketMesh);

    // 2. 底脚沉头台面安装螺栓孔细节 (前后两处防震固定螺丝孔)
    const counterboreGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 16);
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.85 });

    // 前底脚沉孔
    const fBolt = new THREE.Mesh(counterboreGeo, boltMat);
    fBolt.position.set(0, 0.006, 0.019);
    bGroup.add(fBolt);

    // 后底脚沉孔
    const rBolt = new THREE.Mesh(counterboreGeo, boltMat);
    rBolt.position.set(0, 0.006, -0.016);
    bGroup.add(rBolt);

    // 3. 内侧瓷管端头承窝金属衬套圈
    const hubGeo = new THREE.CylinderGeometry(0.0175, 0.0175, 0.0025, 32);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMesh = new THREE.Mesh(hubGeo, anodizedAluminum(0x475569, 0.38));
    hubMesh.position.set(isLeft ? 0.006 : -0.006, 0.028, 0);
    bGroup.add(hubMesh);

    // 4. 顶部滑杆紧固五金件
    const rodY = 0.054;
    if (isLeft) {
      // 左端外侧：阶梯黄铜锁紧衬套 + 不锈钢外六角固定螺栓头
      const bushingGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.0025, 20);
      bushingGeo.rotateZ(Math.PI / 2);
      const bushing = new THREE.Mesh(bushingGeo, polishedGold(0xd4af37));
      bushing.position.set(-bW * 0.5 - 0.0012, rodY, 0);
      bGroup.add(bushing);

      const boltGeo = new THREE.CylinderGeometry(0.0038, 0.0038, 0.0025, 6);
      boltGeo.rotateZ(Math.PI / 2);
      const bolt = new THREE.Mesh(boltGeo, labMetal(0xd1d5db, 0.95, 0.15));
      bolt.position.set(-bW * 0.5 - 0.003, rodY, 0);
      bGroup.add(bolt);
    } else {
      // 右端外侧：滑杆贯通延伸端部 + 黄铜导电套筒与右上端子 C
      const sleeveGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 20);
      sleeveGeo.rotateZ(Math.PI / 2);
      const sleeve = new THREE.Mesh(sleeveGeo, polishedGold(0xd4af37));
      sleeve.position.set(0, rodY, 0);
      bGroup.add(sleeve);
    }

    parent.add(bGroup);
    return bGroup;
  }

  private buildResistor(resistanceOhm: number): void {
    const rGroup = new THREE.Group();
    rGroup.name = 'rheostatGroup';
    this.rheostatGroup = rGroup;

    // 横卧在中后排正中央，直接置于桌面 y = 0，滑杆与接线端正对操作者视线 (+Z)
    rGroup.position.set(-0.060, 0, -0.080);
    rGroup.rotation.y = 0;

    const length = 0.160;
    const tubeR = 0.016;
    const tubeY = 0.028;
    const rodY = 0.054;
    const bW = 0.012;

    // 1. 高光绝缘黑色陶瓷圆柱管本体 (Vitreous Black Porcelain Tube)
    const tubeGeo = new THREE.CylinderGeometry(tubeR, tubeR, length, 36);
    tubeGeo.rotateZ(-Math.PI / 2);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x14171a,
      roughness: 0.12,
      metalness: 0.08,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.position.set(0, tubeY, 0);
    tubeMesh.castShadow = true;
    rGroup.add(tubeMesh);

    // 瓷管两端中空管壁真实机械倒角内环 (Hollow Ceramic Rim)
    const rimGeo = new THREE.CylinderGeometry(tubeR * 0.78, tubeR * 0.78, 0.002, 24);
    rimGeo.rotateZ(-Math.PI / 2);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x0a0c0e });
    const lRim = new THREE.Mesh(rimGeo, rimMat);
    lRim.position.set(-length * 0.5 - 0.0005, tubeY, 0);
    rGroup.add(lRim);
    const rRim = new THREE.Mesh(rimGeo, rimMat);
    rRim.position.set(length * 0.5 + 0.0005, tubeY, 0);
    rGroup.add(rRim);

    // 2. 密绕氧化镍铬高阻合金丝圈与顶部动触头精密刮漆裸导电接触滑道 (Nichrome Coil & Scraped Track)
    const wireTexture = paintTexture(512, 1024, (ctx, w, h) => {
      // 底层：黑色高温绝缘漆底
      ctx.fillStyle = '#14171a';
      ctx.fillRect(0, 0, w, h);

      // 左右两端露出约 12% 绝缘陶瓷管黑釉 (端部未绕线区域)
      const coilStartY = Math.floor(h * 0.12);
      const coilEndY = Math.floor(h * 0.88);

      // 密绕镍铬高阻合金丝 (Nichrome Resistance Wire, 细密排列 ~220 圈)
      const turnStep = 3.5;
      for (let y = coilStartY; y < coilEndY; y += turnStep) {
        // 丝圈阴影凹槽
        ctx.fillStyle = '#111418';
        ctx.fillRect(0, y, w, 1.0);

        // 合金丝金属渐变本体
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(0, y + 1.0, w, 1.5);

        // 合金丝微米级高光反光脊
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, y + 1.6, w, 0.9);
      }

      // 顶部滑块动触头刮除氧化层的裸金属导电打磨滑道 (Scraped Bare Metal Contact Track)
      // 正对顶部 u = 0.25 (对应 rotateZ(-Math.PI / 2) 后的正上方 +Y 轴向)
      const trackW = w * 0.055;
      const trackX = w * 0.25;
      const trackLeft = trackX - trackW * 0.5;

      // 刮漆裸金属抛光镍铬银白基面
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(trackLeft, coilStartY, trackW, coilEndY - coilStartY);

      // 触轨正中心抛光镜面反光亮带
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(trackX - trackW * 0.22, coilStartY, trackW * 0.44, coilEndY - coilStartY);

      // 滑道两侧机械打磨过渡微暗边
      ctx.fillStyle = 'rgba(75, 85, 99, 0.45)';
      ctx.fillRect(trackLeft, coilStartY, 1.5, coilEndY - coilStartY);
      ctx.fillRect(trackLeft + trackW - 1.5, coilStartY, 1.5, coilEndY - coilStartY);

      // 保持滑道内部真实的细微丝圈接缝纹理 (金属磨平但匝间分界依然清晰)
      for (let y = coilStartY; y < coilEndY; y += turnStep) {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.35)';
        ctx.fillRect(trackLeft, y, trackW, 0.8);
      }
    });

    const coilGeo = new THREE.CylinderGeometry(tubeR + 0.0004, tubeR + 0.0004, length, 36);
    coilGeo.rotateZ(-Math.PI / 2);
    const coilMat = new THREE.MeshStandardMaterial({
      map: wireTexture,
      metalness: 0.88,
      roughness: 0.24,
    });
    const coilMesh = new THREE.Mesh(coilGeo, coilMat);
    coilMesh.position.set(0, tubeY, 0);
    rGroup.add(coilMesh);

    // 3. 线圈两端拉丝不锈钢冲压锁紧抱箍环与真实机械紧固螺栓 (Stainless Steel Clamping Collars)
    const collarX = length * 0.38; // 约 ±0.0608m
    const collarMat = labMetal(0xd1d5db, 0.92, 0.20);
    const bandGeo = new THREE.CylinderGeometry(tubeR + 0.0010, tubeR + 0.0010, 0.006, 32);
    bandGeo.rotateZ(-Math.PI / 2);

    for (const cx of [-collarX, collarX]) {
      // 抱箍圆环
      const band = new THREE.Mesh(bandGeo, collarMat);
      band.position.set(cx, tubeY, 0);
      rGroup.add(band);

      // 前部冲压锁紧双耳 (Clamping Lugs)
      const lugGeo = createChamferedBoxGeometry(0.0048, 0.0052, 0.0036, 0.0008, 0.0004);
      const lug = new THREE.Mesh(lugGeo, collarMat);
      lug.position.set(cx, tubeY, tubeR + 0.0028);
      rGroup.add(lug);

      // 前端真实不锈钢十字沉头紧固螺丝 (Phillips Head Screw)
      const screw = createPhillipsScrewMesh(0.0018, 0.0010);
      screw.position.set(cx, tubeY, tubeR + 0.0048);
      rGroup.add(screw);

      // 后部 M3 六角防松螺母 (Hex Nut)
      const hexNutGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.0012, 6);
      hexNutGeo.rotateX(Math.PI / 2);
      const hexNut = new THREE.Mesh(hexNutGeo, labMetal(0xcbd5e1, 0.90, 0.25));
      hexNut.position.set(cx, tubeY, tubeR + 0.0008);
      rGroup.add(hexNut);

      // 顶部定位固定铜片与紧固螺钉
      const topStrapGeo = new THREE.BoxGeometry(0.004, 0.0012, 0.005);
      const topStrap = new THREE.Mesh(topStrapGeo, polishedGold(0xd97706));
      topStrap.position.set(cx, tubeY + tubeR + 0.0012, 0);
      rGroup.add(topStrap);

      // 底部冲压紫铜导电引流带：自抱箍引下连至底座接线耳 (Copper Lead Strap)
      const strapGeo = new THREE.BoxGeometry(0.003, 0.016, 0.001);
      const strapMat = polishedGold(0xd97706);
      const strap = new THREE.Mesh(strapGeo, strapMat);
      strap.position.set(cx, tubeY * 0.5, tubeR * 0.6);
      strap.rotation.x = Math.PI * 0.12;
      rGroup.add(strap);
    }

    // 4. 左右两侧压铸深灰铸铁端板支架 (双桥形接触底脚，底面紧贴桌面 y = 0)
    this.createCastBracket(rGroup, true, length, bW);
    this.createCastBracket(rGroup, false, length, bW);

    // 5. 顶部镜面抛光不锈钢圆截面精密导电滑杆
    const rodR = 0.0035;
    const rodGeo = new THREE.CylinderGeometry(rodR, rodR, length + bW * 2 + 0.010, 24);
    rodGeo.rotateZ(Math.PI / 2);
    const rodMat = labMetal(0xffffff, 0.98, 0.05);
    const rodMesh = new THREE.Mesh(rodGeo, rodMat);
    rodMesh.position.set(0, rodY, 0);
    rGroup.add(rodMesh);

    // 6. 高仿真精密滑块触头组件 (Ergonomic ABS Slider Assembly)
    const sliderGroup = new THREE.Group();
    // 初始处于中间偏右位置，严格对应 1000Ω 设定
    sliderGroup.position.set(0.015, rodY, 0);
    this.rheostatSliderGroup = sliderGroup;

    // 6.1 阻燃工程黑 ABS 滑动手柄主体 (人体工学抓握轮廓，带 7 道横向防滑凸棱)
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.35,
      metalness: 0.15,
    });
    const handleBodyGeo = createChamferedBoxGeometry(0.022, 0.013, 0.024, 0.003, 0.001);
    const handleBody = new THREE.Mesh(handleBodyGeo, handleMat);
    handleBody.position.set(0, 0.0085, 0);
    handleBody.castShadow = true;
    sliderGroup.add(handleBody);

    // 手柄顶部 7 道防滑咬花横向凸棱
    const ridgeGeo = new THREE.BoxGeometry(0.0012, 0.0010, 0.018);
    const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.4 });
    for (let ri = -3; ri <= 3; ri++) {
      const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
      ridge.position.set(ri * 0.0024, 0.0155, 0);
      sliderGroup.add(ridge);
    }

    // 6.2 导向滑套铜衬套 (Brass Bushing Insert)
    const sleeveGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.022, 24);
    sleeveGeo.rotateZ(Math.PI / 2);
    const sleeveMesh = new THREE.Mesh(sleeveGeo, handleMat);
    sliderGroup.add(sleeveMesh);

    const bRingGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.0016, 20);
    bRingGeo.rotateZ(Math.PI / 2);
    const bRingMat = polishedGold(0xd4af37);
    const lBRing = new THREE.Mesh(bRingGeo, bRingMat);
    lBRing.position.set(-0.0105, 0, 0);
    sliderGroup.add(lBRing);
    const rBRing = new THREE.Mesh(bRingGeo, bRingMat);
    rBRing.position.set(0.0105, 0, 0);
    sliderGroup.add(rBRing);

    // 6.3 垂直柱塞弹簧套管与高质感 3D 不锈钢受压螺旋弹簧 (Helical Compression Spring)
    const plungerTubeGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.005, 16);
    plungerTubeGeo.translate(0, -0.003, 0);
    sliderGroup.add(new THREE.Mesh(plungerTubeGeo, handleMat));

    const springGeo = new THREE.TubeGeometry(new HelicalSpringCurve(0.0026, 0.006, 4.5), 40, 0.0005, 8, false);
    const springMat = labMetal(0xd1d5db, 0.95, 0.15);
    const springMesh = new THREE.Mesh(springGeo, springMat);
    springMesh.position.set(0, -0.004, 0);
    sliderGroup.add(springMesh);

    // 6.4 冲压镀镍磷青铜双片弹性电刷靴 (Phosphor Bronze Contact Wiper Shoe)
    // 刷尖呈滑雪板雪橇状向上微翘，平滑紧压于瓷管上部打磨滑道 (y = tubeY + tubeR = 0.044)
    const wiperMat = labMetal(0xd4d4d8, 0.88, 0.20);
    const wiperStemGeo = new THREE.BoxGeometry(0.006, 0.008, 0.0012);
    const wiperStem = new THREE.Mesh(wiperStemGeo, wiperMat);
    wiperStem.position.set(0, -0.0065, 0.001);
    sliderGroup.add(wiperStem);

    // 接触靴底板
    const shoeGeo = new THREE.BoxGeometry(0.007, 0.0008, 0.005);
    const shoeMesh = new THREE.Mesh(shoeGeo, wiperMat);
    shoeMesh.position.set(0, -0.010, 0);
    sliderGroup.add(shoeMesh);

    // 前后上翘防卡死滑靴边缘
    const tipGeo = new THREE.BoxGeometry(0.007, 0.0006, 0.0015);
    const fTip = new THREE.Mesh(tipGeo, wiperMat);
    fTip.position.set(0, -0.0094, 0.003);
    fTip.rotation.x = Math.PI * 0.15;
    sliderGroup.add(fTip);
    const bTip = new THREE.Mesh(tipGeo, wiperMat);
    bTip.position.set(0, -0.0094, -0.003);
    bTip.rotation.x = -Math.PI * 0.15;
    sliderGroup.add(bTip);

    // 电刷紧固微型一字开槽沉头螺丝
    const wiperScrewGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.0008, 12);
    wiperScrewGeo.rotateX(Math.PI / 2);
    const wiperScrew = new THREE.Mesh(wiperScrewGeo, polishedGold(0xd4af37));
    wiperScrew.position.set(0, -0.005, 0.002);
    sliderGroup.add(wiperScrew);

    rGroup.add(sliderGroup);

    // 7. 三个国标物理实验 J2354 专业接线柱 (接线端完全对齐导线走线坐标)
    const postX = length * 0.5 + bW * 0.5; // 0.086m
    // 端子 A (左下)：世界坐标 (-0.147, 0.022, -0.061) -> 本地 (-0.087, 0.022, 0.019)
    this.createJ2354BindingPost(rGroup, new THREE.Vector3(-postX, 0.022, 0.019), 0x111827);

    // 端子 B (右下)：世界坐标 (0.027, 0.022, -0.061) -> 本地 (+0.087, 0.022, 0.019)
    this.createJ2354BindingPost(rGroup, new THREE.Vector3(postX, 0.022, 0.019), 0xdc2626);

    // 端子 C (右上滑杆)：世界坐标 (0.027, 0.054, -0.080) -> 本地 (+0.087, 0.054, 0)
    this.createJ2354BindingPost(rGroup, new THREE.Vector3(postX, rodY, 0), 0xd4af37, polishedGold(0xd4af37));

    // 8. 真实物理教学仪器高精度激光蚀刻拉丝铝质规格铭牌 (Specification Nameplate)
    const plateW = 0.068;
    const plateH = 0.014;
    const plateGeo = new THREE.PlaneGeometry(plateW, plateH);
    this.rheostatPlateCanvas = document.createElement('canvas');
    this.rheostatPlateCanvas.width = 512;
    this.rheostatPlateCanvas.height = 128;
    const plateCtx = this.rheostatPlateCanvas.getContext('2d');
    if (plateCtx) {
      this.renderRheostatPlate(plateCtx, 512, 128, resistanceOhm);
    }
    this.rheostatPlateTexture = new THREE.CanvasTexture(this.rheostatPlateCanvas);
    this.rheostatPlateTexture.colorSpace = THREE.SRGBColorSpace;

    const plateMat = new THREE.MeshBasicMaterial({
      map: this.rheostatPlateTexture,
      toneMapped: false,
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    // 安装于前端下部中央，正向正对操作者视线 (+Z)
    plateMesh.position.set(0, 0.010, 0.0255);
    rGroup.add(plateMesh);

    // 铭牌背板机械加厚铝板与四角凸圆铆钉
    const plateBackGeo = createChamferedBoxGeometry(plateW + 0.002, plateH + 0.002, 0.0012, 0.0006, 0.0003);
    const plateBack = new THREE.Mesh(plateBackGeo, anodizedAluminum(0x64748b, 0.3));
    plateBack.position.set(0, 0.010, 0.0248);
    rGroup.add(plateBack);

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
    this.spdtSwitchGroup = sGroup;
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
    this.switchLeftContactMesh = this.createKnifeJaw(sGroup, new THREE.Vector3(-0.024, baseH, -0.016), brassMat, 'switchLeftContact');
    this.switchRightContactMesh = this.createKnifeJaw(sGroup, new THREE.Vector3(0.024, baseH, -0.016), brassMat, 'switchRightContact');

    // 5. 中间双耳 U 型铰链座与横向枢轴销钉
    const hingeGroup = new THREE.Group();
    hingeGroup.name = 'switchHingeGroup';
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
    this.switchLeverGroup.name = 'switchLeverGroup';
    this.switchLeverGroup.position.set(0, baseH + 0.016, -0.016);

    const bladeGeo = new THREE.BoxGeometry(0.0028, 0.030, 0.010);
    bladeGeo.translate(0, 0.015, 0);
    this.switchKnifeMesh = new THREE.Mesh(bladeGeo, brassMat);
    this.switchKnifeMesh.name = 'switchKnifeBlade';
    this.switchKnifeMesh.castShadow = true;
    this.switchLeverGroup.add(this.switchKnifeMesh);

    // 车削深红胶木手柄
    const handleGroup = new THREE.Group();
    handleGroup.name = 'switchHandleGroup';
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
    const tipMesh = new THREE.Mesh(tipGeo, handleMat);
    tipMesh.name = 'switchHandleTip';
    handleGroup.add(tipMesh);

    this.switchLeverGroup.add(handleGroup);
    sGroup.add(this.switchLeverGroup);

    // 触点瞬态微弱电弧火花点光源
    this.sparkLight = new THREE.PointLight(0x67e8f9, 0, 0.35);
    this.sparkLight.position.set(-0.024, baseH + 0.016, -0.016);
    sGroup.add(this.sparkLight);

    this.group.add(sGroup);
  }

  private createKnifeJaw(parent: THREE.Group, pos: THREE.Vector3, mat: THREE.Material, name: string): THREE.Group {
    const jawGroup = new THREE.Group();
    jawGroup.position.copy(pos);
    jawGroup.name = name;

    const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.004, 0.014), mat);
    baseBlock.position.set(0, 0.002, 0);
    baseBlock.name = name;
    jawGroup.add(baseBlock);

    const leafGeo = new THREE.BoxGeometry(0.008, 0.018, 0.0016);
    const fLeaf = new THREE.Mesh(leafGeo, mat);
    fLeaf.position.set(0, 0.011, 0.0028);
    fLeaf.name = name;
    jawGroup.add(fLeaf);

    const bLeaf = new THREE.Mesh(leafGeo, mat);
    bLeaf.position.set(0, 0.011, -0.0028);
    bLeaf.name = name;
    jawGroup.add(bLeaf);

    const lipGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 0.008, 8);
    lipGeo.rotateZ(Math.PI / 2);
    const fLip = new THREE.Mesh(lipGeo, mat);
    fLip.position.set(0, 0.020, 0.0036);
    fLip.name = name;
    jawGroup.add(fLip);
    const bLip = new THREE.Mesh(lipGeo, mat);
    bLip.position.set(0, 0.020, -0.0036);
    bLip.name = name;
    jawGroup.add(bLip);

    const hitGeo = new THREE.BoxGeometry(0.028, 0.034, 0.024);
    hitGeo.translate(0, 0.014, 0);
    const hitMesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    hitMesh.name = name;
    jawGroup.add(hitMesh);

    parent.add(jawGroup);
    return jawGroup;
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

  // ================= 6. 台式数字存储示波器 (外观严格还原参考图，纯净大屏，物理曲线) =================
  private buildOscilloscope(): void {
    const oGroup = new THREE.Group();
    // 置于右后方实验台面，端正正对操作者视线 (+Z)
    oGroup.position.set(0.340, 0, -0.080);
    oGroup.rotation.y = 0;

    const chassisGroup = new THREE.Group();
    // 人体工学仰角：~12.6°，正视操作者视线
    chassisGroup.rotation.x = -Math.PI * 0.07;
    chassisGroup.position.y = 0.068;

    const bodyW = 0.208;
    const bodyH = 0.120;
    const bodyD = 0.070;

    // 1. 机壳主体：纯净高质感实验室离白/浅灰倒角机身 (严格禁止脏黑塑料)
    const bodyGeo = createFrontFacingRoundedBox(bodyW, bodyH, bodyD, 0.014, 0.0035, 4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.12,
      roughness: 0.28,
    });
    this.scopeChassisMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.scopeChassisMesh.name = 'scopeChassisMesh';
    this.scopeChassisMesh.castShadow = true;
    this.scopeChassisMesh.receiveShadow = true;
    chassisGroup.add(this.scopeChassisMesh);

    // 2. 屏幕内凹深黑精密边框 (提供视觉深度感，彻底杜绝 Z-fighting)
    const bezelW = 0.180;
    const bezelH = 0.098;
    const bezelD = 0.006;
    const bezelGeo = createFrontFacingRoundedBox(bezelW, bezelH, bezelD, 0.004, 0.001, 2);
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x0c131f,
      roughness: 0.35,
      metalness: 0.40,
    });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(0, 0, bodyD * 0.5 + 0.001);
    chassisGroup.add(bezel);

    // 3. 液晶屏 (Edge-to-edge 超大视野高清屏幕，严格对齐参考图宽高比)
    const screenW = 0.174;
    const screenH = 0.088;
    this.scopeDisplayCanvas = document.createElement('canvas');
    this.scopeDisplayCanvas.width = 1280;
    this.scopeDisplayCanvas.height = 640;
    this.scopeDisplayTexture = new THREE.CanvasTexture(this.scopeDisplayCanvas);
    this.scopeDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderOscilloscopeDisplay(undefined, []);

    const screenGeo = new THREE.PlaneGeometry(screenW, screenH);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.scopeDisplayTexture,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.scopeScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.scopeScreenMesh.position.set(0, 0, bodyD * 0.5 + 0.0052);
    this.scopeScreenMesh.name = 'scopeScreenMesh';
    chassisGroup.add(this.scopeScreenMesh);

    // 保持兼容旧交互接口引用
    this.scopeRunBtnMesh = this.scopeScreenMesh;
    this.scopeClearBtnMesh = this.scopeScreenMesh;

    // 4. 底部稳固防滑斜切梯形底脚 (完全对应参考图左右两个灰色梯形支脚)
    const footWTop = 0.024;
    const footWBot = 0.017;
    const footH = 0.014;
    const footD = 0.026;
    const footMat = new THREE.MeshStandardMaterial({
      color: 0x525b6a,
      roughness: 0.65,
      metalness: 0.20,
    });

    const lFootGeo = createTrapezoidFootGeometry(footWTop, footWBot, footH, footD, 0.0012);
    const rFootGeo = createTrapezoidFootGeometry(footWTop, footWBot, footH, footD, 0.0012);

    // 左前支脚
    const lFootFront = new THREE.Mesh(lFootGeo, footMat);
    lFootFront.position.set(-bodyW * 0.38, -bodyH * 0.5 - footH * 0.5, bodyD * 0.25);
    lFootFront.castShadow = true;
    chassisGroup.add(lFootFront);

    // 右前支脚
    const rFootFront = new THREE.Mesh(rFootGeo, footMat);
    rFootFront.position.set(bodyW * 0.38, -bodyH * 0.5 - footH * 0.5, bodyD * 0.25);
    rFootFront.castShadow = true;
    chassisGroup.add(rFootFront);

    // 左后与右后支脚 (确保台面物理接触真实稳定)
    const lFootRear = new THREE.Mesh(lFootGeo, footMat);
    lFootRear.position.set(-bodyW * 0.38, -bodyH * 0.5 - footH * 0.5, -bodyD * 0.25);
    chassisGroup.add(lFootRear);

    const rFootRear = new THREE.Mesh(rFootGeo, footMat);
    rFootRear.position.set(bodyW * 0.38, -bodyH * 0.5 - footH * 0.5, -bodyD * 0.25);
    chassisGroup.add(rFootRear);

    // 5. 机箱后侧散热栅格细节 (3D 全视角工业细节，正面纯净无杂质)
    const ventGeo = new THREE.BoxGeometry(bodyW * 0.65, 0.002, 0.002);
    const ventMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.5 });
    for (let vi = -2; vi <= 2; vi++) {
      const vent = new THREE.Mesh(ventGeo, ventMat);
      vent.position.set(0, vi * 0.010, -bodyD * 0.5 - 0.001);
      chassisGroup.add(vent);
    }

    oGroup.add(chassisGroup);
    this.group.add(oGroup);
  }

  public renderOscilloscopeDisplay(telemetry?: CapacitorTelemetry, samples: readonly WaveformSample[] = []): void {
    if (!this.scopeDisplayCanvas) return;
    const ctx = this.scopeDisplayCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.scopeDisplayCanvas.width;
    const h = this.scopeDisplayCanvas.height;

    // 1. 液晶屏底色：深邃海洋蓝黑背景 (Deep Oceanic Navy Black)，杜绝粗糙纯黑
    ctx.fillStyle = '#050c18';
    ctx.fillRect(0, 0, w, h);

    // 2. 示波器 10列 x 8行 专业示波网格 (Graticule)，占满整个视窗，边缘规整
    const padX = 36;
    const padY = 28;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;
    const cols = 10;
    const rows = 8;
    const dx = plotW / cols;
    const dy = plotH / rows;

    // 2.1 荧光青色细密点虚线网格 (参考图中精致的 Dotted Grid)
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(38, 166, 154, 0.35)';

    for (let c = 1; c < cols; c++) {
      if (c === 5) continue; // 中心轴后续单独以实线及刻度绘制
      const x = padX + c * dx;
      ctx.beginPath();
      ctx.moveTo(x, padY);
      ctx.lineTo(x, padY + plotH);
      ctx.stroke();
    }

    for (let r = 1; r < rows; r++) {
      if (r === 4) continue; // 中心水平轴单独绘制
      const y = padY + r * dy;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(padX + plotW, y);
      ctx.stroke();
    }
    ctx.setLineDash([]); // 还原实线

    // 2.2 中心水平轴与中心垂直轴（清晰亮青色实线 + 5分度刻度，完全对标参考图十字分度标准）
    const cx = padX + 5 * dx;
    const cy = padY + 4 * dy;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.70)';
    ctx.lineWidth = 1.6;

    // 中心水平轴
    ctx.beginPath();
    ctx.moveTo(padX, cy);
    ctx.lineTo(padX + plotW, cy);
    ctx.stroke();

    // 中心水平轴刻度 (每大格 5 小格刻度，tick marks)
    const totalSubX = cols * 5;
    const subDx = plotW / totalSubX;
    for (let k = 0; k <= totalSubX; k++) {
      const tx = padX + k * subDx;
      const isMajor = k % 5 === 0;
      const tLen = isMajor ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(tx, cy - tLen);
      ctx.lineTo(tx, cy + tLen);
      ctx.stroke();
    }

    // 中心垂直轴
    ctx.beginPath();
    ctx.moveTo(cx, padY);
    ctx.lineTo(cx, padY + plotH);
    ctx.stroke();

    // 中心垂直轴刻度
    const totalSubY = rows * 5;
    const subDy = plotH / totalSubY;
    for (let m = 0; m <= totalSubY; m++) {
      const ty = padY + m * subDy;
      const isMajor = m % 5 === 0;
      const tLen = isMajor ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(cx - tLen, ty);
      ctx.lineTo(cx + tLen, ty);
      ctx.stroke();
    }

    // 2.3 网格外围高精度封闭边框
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.75)';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(padX, padY, plotW, plotH);

    // 3. 严格符合经典电磁学与RC电路物理原理的真实动态电容器充放电曲线 (Real Physical Waveform)
    const curV = telemetry?.voltageCapacitor ?? 0.0;
    const curI = telemetry?.currentMa ?? 0.0;
    const vSupply = telemetry?.voltageSupply ?? 3.0;
    const tau = telemetry?.timeConstantTau ?? 1.0;
    const switchPos = telemetry?.switchPosition ?? 'neutral';
    const simTime = telemetry?.time ?? (samples.length > 0 ? samples[samples.length - 1].time : 0.0);

    // 时基与时域窗口计算 (标准 500ms/div 时基，满屏 10 大格跨度 5.0 秒)
    const timePerDiv = 0.5;
    const windowSpan = cols * timePerDiv; // 5.0s
    let tStart = 0;
    let tEnd = windowSpan;

    if (simTime > windowSpan) {
      // 连续平滑 Roll 滚动模式 (最新数据贴靠右侧边缘，历史波形匀速向左滚动)
      tStart = simTime - windowSpan;
      tEnd = simTime;
    } else {
      // 初始扫描模式 (0 ~ 5.0s，电子束自左向右平滑扫描绘制)
      tStart = 0;
      tEnd = windowSpan;
    }

    // 时间转屏幕 X 坐标
    const timeToX = (t: number) => {
      const clampedT = Math.max(tStart, Math.min(tEnd, t));
      return padX + ((clampedT - tStart) / (tEnd - tStart)) * plotW;
    };

    // 电压标度 (CH1): 供电 <= 4.5V 时为 1.00V/div，供电 > 4.5V 时自动换挡至 2.00V/div
    const voltsPerDiv = vSupply > 4.5 ? 2.0 : 1.0;
    // 零电平基准线 (Ground Baseline): 设定在第 6 大格水平线上 (距离下边框 2 大格)，完全留出充放电动态视野
    const yZero = padY + 6.0 * dy;

    // 电压转屏幕 Y 坐标
    const voltToY = (v: number) => {
      const y = yZero - (v / voltsPerDiv) * dy;
      return Math.max(padY + 2, Math.min(padY + plotH - 2, y));
    };

    // 3.1 绘制 CH1 地线参考电平标记 (Ground Marker: ▶ 1)
    ctx.save();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(padX - 18, yZero - 7);
    ctx.lineTo(padX - 4, yZero);
    ctx.lineTo(padX - 18, yZero + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#050c18';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', padX - 12, yZero);
    ctx.restore();

    // 3.2 绘制高保真真实物理实时波形 (Physical Real-time Waveform)
    ctx.save();
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 4.4;
    ctx.shadowColor = 'rgba(255, 230, 0, 0.70)';
    ctx.shadowBlur = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    let started = false;
    let liveX = padX;
    let liveY = yZero;

    if (samples && samples.length > 0) {
      // 快速检索当前视窗内的第一采样点 (保留一个前置点以使线段平滑贯穿左边缘)
      let startIdx = 0;
      while (startIdx < samples.length - 1 && samples[startIdx + 1].time < tStart) {
        startIdx++;
      }

      for (let i = startIdx; i < samples.length; i++) {
        const s = samples[i];
        if (s.time > tEnd + 0.05) break;

        const sx = timeToX(s.time);
        const sy = voltToY(s.voltageCapacitor);

        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }
        liveX = sx;
        liveY = sy;
      }
    }

    // 平滑引伸至当前瞬时位置
    const curScreenX = timeToX(simTime);
    const curScreenY = voltToY(curV);

    if (!started) {
      ctx.moveTo(padX, curScreenY);
      ctx.lineTo(curScreenX, curScreenY);
      liveX = curScreenX;
      liveY = curScreenY;
    } else if (curScreenX > liveX + 0.5) {
      ctx.lineTo(curScreenX, curScreenY);
      liveX = curScreenX;
      liveY = curScreenY;
    }

    ctx.stroke();

    // 3.3 示波器电子束前沿实时高亮荧光光斑 (Phosphor Electron Beam Spot)
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(liveX, liveY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. 紧凑、极简、高对比度微型仪器角落字符角标 (不遮挡中央大面积波形)
    ctx.font = 'bold 13px monospace';
    ctx.shadowBlur = 0;

    // 左上：CH1 刻度与耦合状态
    ctx.fillStyle = 'rgba(254, 240, 138, 0.90)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`CH1: ${voltsPerDiv.toFixed(2)}V/div  DC 1MΩ`, padX + 8, padY + 6);

    // 顶部中央：DSO 触发采集中状态
    ctx.fillStyle = '#4ade80';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('● ROLL  100Sa/s', cx, padY + 6);

    // 右上：时基与时间常数物理指标
    ctx.fillStyle = 'rgba(56, 189, 248, 0.90)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`τ(RC) = ${tau.toFixed(2)}s  500ms/div`, padX + plotW - 8, padY + 6);

    // 左下：电容器当前实时端电压与瞬时电流
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const iSign = curI >= 0 ? '+' : '';
    ctx.fillText(`Uc: ${curV.toFixed(2)}V   I: ${iSign}${curI.toFixed(2)}mA`, padX + 8, padY + plotH - 6);

    // 右下：触发模式与当前状态
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    if (switchPos === 'charge') {
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('⚡ TRIG: CHARGE (充电)', padX + plotW - 8, padY + plotH - 6);
    } else if (switchPos === 'discharge') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('🔄 TRIG: DISCHG (放电)', padX + plotW - 8, padY + plotH - 6);
    } else {
      ctx.fillStyle = '#4ade80';
      ctx.fillText('⚪ TRIG: READY (中立)', padX + plotW - 8, padY + plotH - 6);
    }

    ctx.restore();

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

      // 7. 实时更新桌面示波器小屏幕波形（30 FPS 丝滑物理 Roll 滚动）
      if (samples) {
        const now = performance.now();
        const timeDiff = now - this.scopeLastRenderTime;
        const curChanged = Math.abs(cur - this.scopeLastCurrent) > 0.01;
        const volChanged = Math.abs(vol - this.scopeLastVoltage) > 0.01;
        const posChanged = telemetry.switchPosition !== this.scopeLastPos;

        if (posChanged || curChanged || volChanged || timeDiff >= 33) {
          this.scopeLastSampleCount = samples.length;
          this.scopeLastCurrent = cur;
          this.scopeLastVoltage = vol;
          this.scopeLastPos = telemetry.switchPosition;
          this.scopeLastRenderTime = now;
          this.renderOscilloscopeDisplay(telemetry, samples);
        }
      }
    }
  }

  public setResistance(resistanceOhm: number): void {
    if (this.rheostatSliderGroup) {
      // 导电滑杆 length = 0.160，滑块可在 [-0.050, 0.050] 之间滑动 (避免碰触两端抱箍)
      // 阻值 200Ω ~ 3000Ω 对应左端到右端
      const clampedR = Math.max(200, Math.min(3000, resistanceOhm));
      const ratio = (clampedR - 200) / (3000 - 200);
      const minX = -0.050;
      const maxX = 0.050;
      this.rheostatSliderGroup.position.x = minX + ratio * (maxX - minX);
    }
    if (this.rheostatPlateTexture) {
      const canvas = this.rheostatPlateTexture.image as HTMLCanvasElement;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          this.renderRheostatPlate(ctx, canvas.width, canvas.height, resistanceOhm);
          this.rheostatPlateTexture.needsUpdate = true;
        }
      }
    }
  }

  /**
   * 拖拽滑动变阻器滑块时直接设置滑块 X 坐标与阻值（零延迟高帧率响应）
   */
  public setSliderX(x: number, resistanceOhm: number): void {
    if (this.rheostatSliderGroup) {
      this.rheostatSliderGroup.position.x = Math.max(-0.050, Math.min(0.050, x));
    }
    if (this.rheostatPlateTexture) {
      const canvas = this.rheostatPlateTexture.image as HTMLCanvasElement;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          this.renderRheostatPlate(ctx, canvas.width, canvas.height, resistanceOhm);
          this.rheostatPlateTexture.needsUpdate = true;
        }
      }
    }
  }

  /**
   * 拖拽拨动单刀双掷动触刀时直接设置当前刀闸倾角（单位：弧度）
   */
  public setBladeAngle(angle: number): void {
    this.currentBladeAngle = angle;
    this.targetBladeAngle = angle;
    if (this.switchLeverGroup) {
      this.switchLeverGroup.rotation.z = angle;
    }
  }

  public setCapacitance(capacitanceUf: number): void {
    if (this.capLabelTexture) {
      const canvas = this.capLabelTexture.image as HTMLCanvasElement;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx && typeof ctx.fillText === 'function') {
          const w = canvas.width;
          const h = canvas.height;
          ctx.fillStyle = '#0a2e5c';
          ctx.fillRect(0, 0, w, h);

          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(80, 0, 110, h);

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
          ctx.fillText('CD293', 250, 120);
          ctx.fillText(`${capacitanceUf.toFixed(0)} µF  25V`, 250, 180);

          ctx.font = '500 32px monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('-40℃ ~ +105℃', 250, 240);
          ctx.fillText('VENT SAFETY', 250, 290);

          this.capLabelTexture.needsUpdate = true;
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
    if (this.rheostatPlateTexture) {
      this.rheostatPlateTexture.dispose();
    }
    disposeObjectTree(this.group);
  }
}
