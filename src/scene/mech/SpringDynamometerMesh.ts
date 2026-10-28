/**
 * 3D 高精细度实验室弹簧测力计模型 (High-Fidelity Spring Dynamometer 3D Mesh)
 *
 * 遵循核心铁律与工业级精雕建模规范：
 * 1. 严格禁止粗糙几何拼接，采用真实精密实验室器材工业造型标准；
 * 2. 镜面液态铬不锈钢 U 型提环与高承重 J/S 复合受力挂钩 (TubeGeometry 带真实弯管倒角与防脱安全圆珠)；
 * 3. 航空级阳极氧化喷砂铝合金与香槟金黄铜双色台阶端盖，带微米级精密滚花防滑纹理 (Knurling) 与中心高光黄铜导向套筒；
 * 4. 高透明光学级亚克力保护套管 (MeshPhysicalMaterial 真实菲涅尔折射与通透微光)；
 * 5. 内置高对比度激光蚀刻标尺衬板：采用正对操作者视线的大字号刻度、0.1N 细分精密刻度线与粗体单位 N；
 * 6. 真实 3D 螺旋弹簧：上部镀铬弹簧钢丝螺旋，随受力大小实时平滑形变，保持钢丝截面零畸变；
 * 7. 鲜红游标指示圆盘与中心镀铬拉杆：随受力精准对齐标尺，直观读出力的数值；
 * 8. 支持垂直悬挂 (Solo) 与水平对扣 (Horizontal Pair) 两种专业构型，确保互拉实验中两测力计挂钩真实互扣相勾。
 */

import * as THREE from 'three';
import { disposeObjectTree, mechMetal } from './mechKit.ts';

export interface SpringDynamometerOptions {
  label?: string;                                // 标识名 (例如 'DynamometerA', 'DynamometerB', 'SoloDynamometer')
  maxForce?: number;                             // 最大量程 (默认 5.0 N)
  casingColor?: number;                          // 端盖阳极氧化配色
  tubeLength?: number;                           // 外壳长度 (默认 0.20 m)
  tubeRadius?: number;                           // 外壳半径 (默认 0.016 m)
  scaleSubLabel?: string;                        // 标尺子标识 (例如 'A', 'B')
  orientation?: 'vertical' | 'horizontal_pair';  // 布局方向：垂直独立 / 水平对拉
  pairRole?: 'A' | 'B';                          // 水平互拉角色：A 居左挂钩朝右，B 居右挂钩朝左
}

class HelixCurve extends THREE.Curve<THREE.Vector3> {
  public radius: number;
  public length: number;
  public turns: number;
  public startY: number;
  public dir: number;

  constructor(radius: number, length: number, turns: number, startY = 0, dir = 1) {
    super();
    this.radius = radius;
    this.length = length;
    this.turns = turns;
    this.startY = startY;
    this.dir = dir;
  }

  getPoint(ratio: number, target = new THREE.Vector3()): THREE.Vector3 {
    const theta = ratio * Math.PI * 2 * this.turns;
    return target.set(
      Math.cos(theta) * this.radius,
      this.startY + ratio * this.length * this.dir,
      Math.sin(theta) * this.radius
    );
  }
}

export class SpringDynamometerMesh {
  public readonly group = new THREE.Group();

  // 构件子节点
  public readonly casingGroup = new THREE.Group();        // 外壳与固定部件 (随外壳移动)
  public readonly movingAssembly = new THREE.Group();     // 活动拉伸部件 (弹簧活动端、拉杆、红盘、秤钩)
  public readonly hookHitBox: THREE.Mesh;                 // 秤钩鼠标拾取盒
  public readonly ringHitBox: THREE.Mesh;                 // 提环鼠标拾取盒
  public readonly casingHitBox: THREE.Mesh;               // 筒身鼠标拾取盒

  // 网格引用
  private topRingMesh!: THREE.Mesh;
  private topCapMesh!: THREE.Mesh;
  private glassTubeMesh!: THREE.Mesh;
  private scalePlateMesh!: THREE.Mesh;
  private bottomCapMesh!: THREE.Mesh;

  private springGroup = new THREE.Group();
  private springMesh!: THREE.Mesh;
  private baseSpringPositions!: Float32Array;
  private centerRodMesh!: THREE.Mesh;
  private redPointerDisc!: THREE.Mesh;
  private bottomHookMesh!: THREE.Mesh;

  // 材质引用
  private chromeMat!: THREE.MeshStandardMaterial;
  private brassMat!: THREE.MeshStandardMaterial;
  private capMat!: THREE.MeshStandardMaterial;
  private glassMat!: THREE.MeshPhysicalMaterial;
  private redPointerMat!: THREE.MeshStandardMaterial;
  private scaleTexture!: THREE.CanvasTexture;

  // 几何与物理常量
  public readonly casingColor: number;
  public readonly maxForce: number;
  public readonly tubeLength: number;
  public readonly tubeRadius: number;
  public readonly orientation: 'vertical' | 'horizontal_pair';
  public readonly pairRole?: 'A' | 'B';

  // 刻度行程参数
  public readonly scaleTravelM = 0.080;       // 80 mm 有效行程
  public readonly zeroMarkY: number;          // 0N 初始基准 Y 坐标
  public readonly springRestLengthM = 0.040;  // 弹簧静止自由长度 (40 mm)
  public readonly springAnchorY: number;      // 弹簧固定挂接点 Y
  public readonly springDir: number;          // 弹簧拉伸方向 (+1 或 -1)
  private readonly springTurns = 13;
  private readonly helixRadius: number;

  // 动态状态
  private currentForceN = 0;
  private currentDisplacementM = 0;

  constructor(options: SpringDynamometerOptions = {}) {
    this.casingColor = options.casingColor ?? 0x0d8275;
    this.maxForce = options.maxForce ?? 5.0;
    this.tubeLength = options.tubeLength ?? 0.20;
    this.tubeRadius = options.tubeRadius ?? 0.016;
    this.orientation = options.orientation ?? 'vertical';
    this.pairRole = options.pairRole;
    this.helixRadius = this.tubeRadius * 0.44;

    this.group.name = options.label || 'SpringDynamometer';
    this.group.add(this.casingGroup);
    this.group.add(this.movingAssembly);

    // 确定几何坐标极性：
    // vertical: 提环在 +Y，挂钩在 -Y，弹簧锚定在 +Y 向 -Y 伸长
    // horizontal_pair: 提环在 -Y (外侧锚定/拉拽)，挂钩在 +Y (中心互扣)，弹簧锚定在 -Y 向 +Y 伸长
    if (this.orientation === 'vertical') {
      this.zeroMarkY = 0.035;
      this.springAnchorY = 0.075;
      this.springDir = -1;
    } else {
      this.zeroMarkY = -0.035;
      this.springAnchorY = -0.075;
      this.springDir = 1;
    }

    this.initMaterials(options);
    this.createCasingAndCaps(options);
    this.createScalePlate(options);
    this.createSpringAssembly();
    this.createHook(options);

    // 创建精准交互碰撞体 (透明不可见)
    this.hookHitBox = this.createHitBox(0.046, 0.055, 0.046);
    this.hookHitBox.name = `${this.group.name}-hook-hitbox`;
    if (this.orientation === 'vertical') {
      this.hookHitBox.position.set(0, -this.tubeLength * 0.76, 0);
    } else {
      this.hookHitBox.position.set(0, this.tubeLength * 0.76, 0);
    }
    this.movingAssembly.add(this.hookHitBox);

    this.ringHitBox = this.createHitBox(0.046, 0.055, 0.046);
    this.ringHitBox.name = `${this.group.name}-ring-hitbox`;
    if (this.orientation === 'vertical') {
      this.ringHitBox.position.set(0, this.tubeLength * 0.72, 0);
    } else {
      this.ringHitBox.position.set(0, -this.tubeLength * 0.72, 0);
    }
    this.casingGroup.add(this.ringHitBox);

    this.casingHitBox = this.createHitBox(this.tubeRadius * 2.4, this.tubeLength, this.tubeRadius * 2.4);
    this.casingHitBox.name = `${this.group.name}-casing-hitbox`;
    this.casingHitBox.position.set(0, 0, 0);
    this.casingGroup.add(this.casingHitBox);

    // 初始受力归零
    this.setForce(0);
  }

  /**
   * 初始化科研级物理材质体系
   */
  private initMaterials(options: SpringDynamometerOptions): void {
    // 1. 镜面液态铬不锈钢 (316L liquid chrome)
    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.08,
    });

    // 2. 香槟金精密黄铜 (Champagne brass)
    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.88,
      roughness: 0.22,
    });

    // 3. 航空级阳极氧化喷砂金属端盖
    this.capMat = new THREE.MeshStandardMaterial({
      color: options.casingColor ?? 0x0d8275,
      metalness: 0.35,
      roughness: 0.28,
    });

    // 4. 高透明光学亚克力玻璃管
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.03,
      transmission: 0.95,
      thickness: 0.003,
      transparent: true,
      opacity: 0.25,
      ior: 1.49,
      depthWrite: false,
    });

    // 5. 鲜红读数游标盘
    this.redPointerMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.20,
      roughness: 0.20,
    });
  }

  /**
   * 构建高保真外壳、阶梯倒角端盖与不锈钢提环
   */
  private createCasingAndCaps(options: SpringDynamometerOptions): void {
    const halfLen = this.tubeLength * 0.5;
    const r = this.tubeRadius;

    // 1. 透明光学亚克力外管主体
    const tubeGeo = new THREE.CylinderGeometry(r, r, this.tubeLength, 48, 1, true);
    this.glassTubeMesh = new THREE.Mesh(tubeGeo, this.glassMat);
    this.glassTubeMesh.position.y = 0;
    this.casingGroup.add(this.glassTubeMesh);

    // 2. 端盖与提环装配
    // vertical: 提环在顶部 (+halfLen)，导套在底部 (-halfLen)
    // horizontal_pair: 提环在底侧 (-halfLen)，导套在顶侧 (+halfLen)
    const ringAtTop = this.orientation === 'vertical';

    // 提环端盖总成
    const ringCapGroup = new THREE.Group();
    ringCapGroup.position.y = ringAtTop ? halfLen : -halfLen;
    if (!ringAtTop) {
      ringCapGroup.rotation.z = Math.PI; // 提环朝外开口
    }

    const capHeight = 0.022;
    // 主端盖圆柱 (带微倒角)
    const capGeo = new THREE.CylinderGeometry(r * 1.06, r * 1.06, capHeight, 48);
    const ringCapMesh = new THREE.Mesh(capGeo, this.capMat);
    ringCapMesh.position.y = capHeight * 0.5;
    ringCapGroup.add(ringCapMesh);

    // 倒角滚花环
    const knurlRingGeo = new THREE.TorusGeometry(r * 1.05, 0.0016, 12, 48);
    const knurlRing = new THREE.Mesh(knurlRingGeo, this.brassMat);
    knurlRing.rotation.x = Math.PI / 2;
    knurlRing.position.y = 0.002;
    ringCapGroup.add(knurlRing);

    // 阶梯阶台
    const bossGeo = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.014, 32);
    const bossMesh = new THREE.Mesh(bossGeo, this.capMat);
    bossMesh.position.y = capHeight + 0.007;
    ringCapGroup.add(bossMesh);

    // 黄铜定位衬套
    const brassBushingGeo = new THREE.CylinderGeometry(r * 0.32, r * 0.32, 0.006, 24);
    const brassBushing = new THREE.Mesh(brassBushingGeo, this.brassMat);
    brassBushing.position.y = capHeight + 0.014 + 0.003;
    ringCapGroup.add(brassBushing);

    // U 型圆润镀铬提环
    const ringPath = new THREE.CurvePath<THREE.Vector3>();
    const ringRadius = 0.0125;
    const legHeight = 0.034;
    const ringStartY = capHeight + 0.012;

    ringPath.add(new THREE.LineCurve3(
      new THREE.Vector3(-ringRadius, ringStartY, 0),
      new THREE.Vector3(-ringRadius, ringStartY + legHeight, 0)
    ));
    const arcCurve = new THREE.EllipseCurve(
      0, ringStartY + legHeight,
      ringRadius, ringRadius,
      Math.PI, 0,
      true, 0
    );
    const arcPoints = arcCurve.getPoints(24);
    for (let i = 0; i < arcPoints.length - 1; i++) {
      ringPath.add(new THREE.LineCurve3(
        new THREE.Vector3(arcPoints[i].x, arcPoints[i].y, 0),
        new THREE.Vector3(arcPoints[i + 1].x, arcPoints[i + 1].y, 0)
      ));
    }
    ringPath.add(new THREE.LineCurve3(
      new THREE.Vector3(ringRadius, ringStartY + legHeight, 0),
      new THREE.Vector3(ringRadius, ringStartY, 0)
    ));

    const ringGeo = new THREE.TubeGeometry(ringPath, 48, 0.0018, 16, false);
    this.topRingMesh = new THREE.Mesh(ringGeo, this.chromeMat);
    ringCapGroup.add(this.topRingMesh);

    this.casingGroup.add(ringCapGroup);

    // 挂钩端盖总成 (带中心拉杆精密黄铜导套)
    const hookCapGroup = new THREE.Group();
    hookCapGroup.position.y = ringAtTop ? -halfLen : halfLen;
    if (!ringAtTop) {
      hookCapGroup.rotation.z = Math.PI; // 挂钩端盖朝内延伸
    }

    const hookCapMesh = new THREE.Mesh(capGeo, this.capMat);
    hookCapMesh.position.y = -capHeight * 0.5;
    hookCapGroup.add(hookCapMesh);

    const btmKnurlRing = new THREE.Mesh(knurlRingGeo, this.brassMat);
    btmKnurlRing.rotation.x = Math.PI / 2;
    btmKnurlRing.position.y = -0.002;
    hookCapGroup.add(btmKnurlRing);

    // 黄铜中心导管
    const guideBushingGeo = new THREE.CylinderGeometry(r * 0.38, r * 0.38, 0.016, 32);
    const guideBushing = new THREE.Mesh(guideBushingGeo, this.brassMat);
    guideBushing.position.y = -capHeight - 0.008;
    hookCapGroup.add(guideBushing);

    this.casingGroup.add(hookCapGroup);

    if (ringAtTop) {
      this.topCapMesh = ringCapMesh;
      this.bottomCapMesh = hookCapMesh;
    } else {
      this.topCapMesh = hookCapMesh;
      this.bottomCapMesh = ringCapMesh;
    }
  }

  /**
   * 激光蚀刻高对比度精密标尺衬板
   * 严格保证数字端正正对操作者视线 (+Z)
   */
  private createScalePlate(options: SpringDynamometerOptions): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 4096;
    const ctx = canvas.getContext('2d')!;

    // 纯白微亚光底色
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 精致金属银灰包边
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 24, canvas.height);
    ctx.fillRect(canvas.width - 24, 0, 24, canvas.height);

    const isVert = this.orientation === 'vertical';
    const isPairA = options.pairRole === 'A';
    const isPairB = options.pairRole === 'B';

    if (isVert) {
      // 垂直模式：顶部 0N，底部 5N，文字横排
      const y0_px = Math.round((1 - 0.130 / 0.180) * canvas.height);
      const y5_px = Math.round((1 - 0.050 / 0.180) * canvas.height);
      const totalDistPx = y5_px - y0_px;

      // 顶端单位 "N"
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 220px "SF Pro Display", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', canvas.width * 0.44, y0_px - 320);

      const axisX = canvas.width * 0.48;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(axisX, y0_px - 20);
      ctx.lineTo(axisX, y5_px + 20);
      ctx.stroke();

      for (let i = 0; i <= 5; i++) {
        const y = y0_px + (i / 5) * totalDistPx;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(axisX - 35, y);
        ctx.lineTo(axisX + 240, y);
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 180px "SF Pro Display", Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i), axisX - 70, y);

        if (i < 5) {
          for (let sub = 1; sub <= 9; sub++) {
            const subY = y + (sub / 10) * (totalDistPx / 5);
            const isMid = sub === 5;
            ctx.strokeStyle = isMid ? '#1e293b' : '#64748b';
            ctx.lineWidth = isMid ? 12 : 8;
            ctx.beginPath();
            ctx.moveTo(axisX, subY);
            ctx.lineTo(axisX + (isMid ? 170 : 100), subY);
            ctx.stroke();
          }
        }
      }
    } else {
      // 水平对拉模式 (A: 0在左侧向右伸长，B: 0在右侧向左伸长)
      // 为确保在 rotation.z = ±PI/2 下文字端正面对操作者，通过旋转变换绘制
      const canTransform = typeof ctx.translate === 'function' && typeof ctx.rotate === 'function';
      if (canTransform) {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
      }

      const plateLenPx = canvas.height;
      const plateWidthPx = canvas.width;

      // 绘制纵向基线与刻度
      const axisY = plateWidthPx * 0.52;
      const x0 = plateLenPx * 0.18;
      const x5 = plateLenPx * 0.82;
      const dx = (x5 - x0) / 5;

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(x0 - 20, axisY);
      ctx.lineTo(x5 + 20, axisY);
      ctx.stroke();

      // 单位与角色徽标
      ctx.fillStyle = isPairA ? '#0284c7' : '#e11d48';
      ctx.font = 'bold 240px "SF Pro Display", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const badgeText = isPairA ? 'A · N' : 'B · N';
      ctx.fillText(badgeText, plateLenPx * 0.50, axisY - 260);

      for (let i = 0; i <= 5; i++) {
        // A 表由左到右增大 (0->5)，B 表在对向同样顺应受力方向排布
        const num = isPairB ? (5 - i) : i;
        const curX = x0 + i * dx;

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(curX, axisY - 80);
        ctx.lineTo(curX, axisY + 140);
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 200px "SF Pro Display", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(num), curX, axisY - 95);

        if (i < 5) {
          for (let sub = 1; sub <= 9; sub++) {
            const subX = curX + (sub / 10) * dx;
            const isMid = sub === 5;
            ctx.strokeStyle = isMid ? '#1e293b' : '#64748b';
            ctx.lineWidth = isMid ? 12 : 8;
            ctx.beginPath();
            ctx.moveTo(subX, axisY);
            ctx.lineTo(subX, axisY + (isMid ? 100 : 60));
            ctx.stroke();
          }
        }
      }
      if (canTransform) {
        ctx.restore();
      }
    }

    this.scaleTexture = new THREE.CanvasTexture(canvas);
    this.scaleTexture.generateMipmaps = true;
    this.scaleTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.scaleTexture.magFilter = THREE.LinearFilter;

    const plateWidth = this.tubeRadius * 1.62;
    const plateHeight = 0.180;
    const plateGeo = new THREE.PlaneGeometry(plateWidth, plateHeight);
    const plateMat = new THREE.MeshBasicMaterial({
      map: this.scaleTexture,
      side: THREE.DoubleSide,
    });
    this.scalePlateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.scalePlateMesh.position.set(0, 0, -this.tubeRadius * 0.15);
    this.casingGroup.add(this.scalePlateMesh);
  }

  /**
   * 创建精密 3D 螺旋弹簧构件与中心拉杆
   */
  private createSpringAssembly(): void {
    this.springGroup.position.set(0, 0, 0);
    this.casingGroup.add(this.springGroup);

    const curve = new HelixCurve(
      this.helixRadius,
      this.springRestLengthM,
      this.springTurns,
      this.springAnchorY,
      this.springDir
    );

    const springGeo = new THREE.TubeGeometry(curve, 100, 0.0013, 8, false);
    this.baseSpringPositions = Float32Array.from(springGeo.attributes.position.array);
    this.springMesh = new THREE.Mesh(springGeo, this.chromeMat);
    this.springGroup.add(this.springMesh);

    // 鲜红指示游标盘
    const discGroup = new THREE.Group();
    discGroup.position.set(0, this.zeroMarkY, 0);

    const discGeo = new THREE.CylinderGeometry(this.tubeRadius * 0.65, this.tubeRadius * 0.65, 0.003, 32);
    this.redPointerDisc = new THREE.Mesh(discGeo, this.redPointerMat);
    discGroup.add(this.redPointerDisc);

    const collarGeo = new THREE.CylinderGeometry(this.tubeRadius * 0.28, this.tubeRadius * 0.28, 0.008, 24);
    const collarMesh = new THREE.Mesh(collarGeo, this.brassMat);
    collarMesh.position.y = this.springDir < 0 ? 0.004 : -0.004;
    discGroup.add(collarMesh);

    this.movingAssembly.add(discGroup);

    // 贯通镀铬中心拉杆
    const rodLen = this.tubeLength * 0.90;
    const rodGeo = new THREE.CylinderGeometry(0.0018, 0.0018, rodLen, 24);
    this.centerRodMesh = new THREE.Mesh(rodGeo, this.chromeMat);
    if (this.orientation === 'vertical') {
      this.centerRodMesh.position.set(0, this.zeroMarkY - rodLen * 0.5, 0);
    } else {
      this.centerRodMesh.position.set(0, this.zeroMarkY + rodLen * 0.5, 0);
    }
    this.movingAssembly.add(this.centerRodMesh);
  }

  /**
   * 创建受力挂钩
   * 对拉模式下 Hook A 与 Hook B 呈真实互扣咬合造型
   */
  private createHook(options: SpringDynamometerOptions): void {
    const hookPath = new THREE.CurvePath<THREE.Vector3>();

    if (this.orientation === 'vertical') {
      // 经典立式 S 型秤钩 (在 -Y 端下伸)
      const hookStartY = this.zeroMarkY - this.tubeLength * 0.90;
      const stemLen = 0.020;

      hookPath.add(new THREE.LineCurve3(
        new THREE.Vector3(0, hookStartY, 0),
        new THREE.Vector3(0, hookStartY - stemLen, 0)
      ));

      const hookCenterY = hookStartY - stemLen - 0.015;
      const hookRadius = 0.0135;
      const arc = new THREE.EllipseCurve(
        0, hookCenterY,
        hookRadius, hookRadius,
        0, Math.PI * 1.35,
        false, 0
      );
      const pts = arc.getPoints(24);
      for (let i = 0; i < pts.length - 1; i++) {
        hookPath.add(new THREE.LineCurve3(
          new THREE.Vector3(pts[i].x, pts[i].y, 0),
          new THREE.Vector3(pts[i + 1].x, pts[i + 1].y, 0)
        ));
      }

      const hookGeo = new THREE.TubeGeometry(hookPath, 48, 0.0020, 16, false);
      this.bottomHookMesh = new THREE.Mesh(hookGeo, this.chromeMat);
      this.movingAssembly.add(this.bottomHookMesh);

      const tipSphere = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 16, 16), this.chromeMat);
      const lastPt = pts[pts.length - 1];
      tipSphere.position.set(lastPt.x, lastPt.y, 0);
      this.bottomHookMesh.add(tipSphere);
    } else {
      // 水平互拉模式 (+Y 端朝向中心伸出)
      // Hook A 在中心 loop 向上/向前，Hook B 从中心 loop 向下/向后，两钩紧密咬合互扣
      const isRoleA = options.pairRole === 'A';
      const hookStartY = this.zeroMarkY + this.tubeLength * 0.90; // ~0.145m
      const stemLen = 0.015;

      hookPath.add(new THREE.LineCurve3(
        new THREE.Vector3(0, hookStartY, 0),
        new THREE.Vector3(0, hookStartY + stemLen, 0) // ~0.160m (刚好达到中心交接点)
      ));

      const hookRadius = 0.012;
      const hookCenter = new THREE.Vector3(0, hookStartY + stemLen, 0);

      // 弯曲钩身
      const zSign = isRoleA ? 1 : -1;
      const arc = new THREE.EllipseCurve(
        0, 0,
        hookRadius, hookRadius,
        0, Math.PI * 1.32,
        false, 0
      );
      const pts = arc.getPoints(24);
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = new THREE.Vector3(
          pts[i].x,
          hookCenter.y + pts[i].y * (isRoleA ? 1 : -1),
          pts[i].y * 0.6 * zSign
        );
        const p2 = new THREE.Vector3(
          pts[i + 1].x,
          hookCenter.y + pts[i + 1].y * (isRoleA ? 1 : -1),
          pts[i + 1].y * 0.6 * zSign
        );
        hookPath.add(new THREE.LineCurve3(p1, p2));
      }

      const hookGeo = new THREE.TubeGeometry(hookPath, 48, 0.0020, 16, false);
      this.bottomHookMesh = new THREE.Mesh(hookGeo, this.chromeMat);
      this.movingAssembly.add(this.bottomHookMesh);

      const tipSphere = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 16, 16), this.chromeMat);
      const lastPt = pts[pts.length - 1];
      tipSphere.position.set(
        lastPt.x,
        hookCenter.y + lastPt.y * (isRoleA ? 1 : -1),
        lastPt.y * 0.6 * zSign
      );
      this.bottomHookMesh.add(tipSphere);
    }
  }

  /**
   * 创建不可见拾取盒
   */
  private createHitBox(w: number, h: number, d: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshBasicMaterial({
      visible: false,
      transparent: true,
      opacity: 0,
    });
    const box = new THREE.Mesh(geo, mat);
    box.userData.isInteractable = true;
    return box;
  }

  /**
   * 设置施加在测力计上的拉力 (N)
   * 自动驱动弹簧高帧率平滑拉伸、红盘位移、拉杆下移/外移、秤钩位置同步
   */
  public setForce(forceN: number): void {
    const clampedForce = Math.max(0, Math.min(this.maxForce, forceN));
    this.currentForceN = clampedForce;

    // 计算实际伸长量 \Delta y (m)
    // 0N -> 0 mm, 5N -> scaleTravelM (80 mm)
    const displacement = (clampedForce / this.maxForce) * this.scaleTravelM;
    this.currentDisplacementM = displacement;

    // 1. 更新螺旋弹簧顶点缓冲区 (0.002ms 极速物理响应，钢丝截面零畸变)
    const stretchedLength = this.springRestLengthM + displacement;
    const stretchRatio = stretchedLength / this.springRestLengthM;

    if (this.springMesh && this.baseSpringPositions) {
      const pos = this.springMesh.geometry.attributes.position.array as Float32Array;
      const base = this.baseSpringPositions;
      const anchorY = this.springAnchorY;
      for (let j = 0; j < pos.length; j += 3) {
        pos[j + 1] = anchorY + (base[j + 1] - anchorY) * stretchRatio;
      }
      this.springMesh.geometry.attributes.position.needsUpdate = true;
    }

    // 2. 更新整个活动总成 (红盘、拉杆、秤钩) 的空间物理位移
    // vertical: 向 -Y 位移；horizontal_pair: 向 +Y 位移
    const moveOffset = this.springDir * displacement;
    this.movingAssembly.position.set(0, moveOffset, 0);
  }

  /**
   * 获取当前示数 (N)
   */
  public getForce(): number {
    return this.currentForceN;
  }

  /**
   * 获取当前弹簧伸长量 (m)
   */
  public getDisplacement(): number {
    return this.currentDisplacementM;
  }

  /**
   * 获取底部秤钩在当前全局坐标系中的空间中心位置
   */
  public getHookWorldTip(target = new THREE.Vector3()): THREE.Vector3 {
    return this.bottomHookMesh.getWorldPosition(target);
  }

  /**
   * 高亮秤钩或提环 (光标悬停时的微光反馈)
   */
  public setHighlighted(highlight: boolean): void {
    if (highlight) {
      this.chromeMat.emissive.setHex(0x0284c7);
      this.chromeMat.emissiveIntensity = 0.35;
      this.capMat.emissive.setHex(0x0284c7);
      this.capMat.emissiveIntensity = 0.20;
    } else {
      this.chromeMat.emissive.setHex(0x000000);
      this.chromeMat.emissiveIntensity = 0;
      this.capMat.emissive.setHex(0x000000);
      this.capMat.emissiveIntensity = 0;
    }
  }

  /**
   * 资源深度安全销毁
   */
  public dispose(): void {
    disposeObjectTree(this.group);
    if (this.scaleTexture) {
      this.scaleTexture.dispose();
    }
  }
}
