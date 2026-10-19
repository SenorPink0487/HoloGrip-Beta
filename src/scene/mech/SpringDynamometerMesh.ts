/**
 * 3D 高精细度实验室弹簧测力计模型 (High-Fidelity Spring Dynamometer 3D Mesh)
 *
 * 严格按照标准 5N 圆筒形透明弹簧测力计实物教具工业级精雕建模：
 * 1. 顶部提环：镜面液态铬不锈钢 U 型提环 (TubeGeometry，具有光滑圆润的机械倒角，直插上端盖中凸台座)；
 * 2. 上下端盖：科研级孔雀青绿工程材质 (0x0d8275)，带精密机械阶梯台阶、倒角唇边与中心轴承导向套筒；
 * 3. 外层高透保护管：纯净光学级透明亚克力管，具备通透折射与微光菲涅尔反射；
 * 4. 内置激光蚀刻标尺衬板：纯白衬板，居中纵向基线，左侧印有粗体 "N" 与 0~5 刻度读数，右侧印有 0.1N 激光精密分度刻线；
 * 5. 真实 3D 螺旋弹簧：上部高光镀铬螺旋弹簧 (TubeGeometry 实体金属丝)，随受力大小实时伸长形变；
 * 6. 红色指示读数盘：鲜红读数游标盘附于弹簧下端接头，横向红缘准确对齐标尺刻度线；
 * 7. 中心镜面拉杆与 S 型秤钩：贯通式液态铬不锈钢拉杆，穿过下端盖延伸至标准 S 型圆润挂钩。
 */

import * as THREE from 'three';
import { disposeObjectTree } from './mechKit.ts';

export interface SpringDynamometerOptions {
  label?: string;             // 标识名 (例如 'DynamometerA', 'DynamometerB', 'SoloDynamometer')
  maxForce?: number;          // 最大量程 (默认 5.0 N)
  casingColor?: number;       // 端盖金属配色 (默认 0x0d8275 实验室经典青绿)
  tubeLength?: number;        // 外壳长度 (默认 0.20 m)
  tubeRadius?: number;        // 外壳半径 (默认 0.018 m)
  scaleSubLabel?: string;     // 标尺子标识 (例如 'A', 'B')
}

export class SpringDynamometerMesh {
  public readonly group = new THREE.Group();

  // 构件子节点
  public readonly casingGroup = new THREE.Group();        // 外壳与固定部件 (随外壳移动)
  public readonly movingAssembly = new THREE.Group();     // 活动拉伸部件 (弹簧底端、拉杆、红盘、秤钩)
  public readonly hookHitBox: THREE.Mesh;                 // 秤钩鼠标拾取盒
  public readonly ringHitBox: THREE.Mesh;                 // 提环鼠标拾取盒
  public readonly casingHitBox: THREE.Mesh;               // 筒身鼠标拾取盒

  // 构件网格引用
  private topRingMesh!: THREE.Mesh;
  private topCapMesh!: THREE.Mesh;
  private glassTubeMesh!: THREE.Mesh;
  private scalePlateMesh!: THREE.Mesh;
  private bottomCapMesh!: THREE.Mesh;

  private springGroup = new THREE.Group();
  private springMesh!: THREE.Mesh;
  private centerRodMesh!: THREE.Mesh;
  private redPointerDisc!: THREE.Mesh;
  private bottomHookMesh!: THREE.Mesh;

  // 材质引用
  private chromeMat!: THREE.MeshStandardMaterial;
  private capMat!: THREE.MeshStandardMaterial;
  private glassMat!: THREE.MeshPhysicalMaterial;
  private redPointerMat!: THREE.MeshStandardMaterial;
  private scaleTexture!: THREE.CanvasTexture;

  // 物理几何尺寸
  public readonly casingColor: number;
  public readonly maxForce: number;
  public readonly tubeLength: number;
  public readonly tubeRadius: number;

  // 刻度行进参数 (0N 到 5N 对应的内部位移量，经由 UV 纹理与 3D 尺寸微米级严格对齐)
  public readonly scaleTravelM = 0.080;       // 80 mm 刻度有效行程
  public readonly zeroMarkY = 0.040;          // 0N 刻度线在局部坐标系中的 Y 坐标
  public readonly springRestLengthM = 0.042;  // 弹簧静止自由长度 (42 mm)
  public readonly springAnchorY = 0.082;      // 弹簧顶端挂接点 Y

  // 动态状态
  private currentForceN = 0;
  private currentDisplacementM = 0;

  constructor(options: SpringDynamometerOptions = {}) {
    this.casingColor = options.casingColor ?? 0x0d8275;
    this.maxForce = options.maxForce ?? 5.0;
    this.tubeLength = options.tubeLength ?? 0.20;
    this.tubeRadius = options.tubeRadius ?? 0.018;

    this.group.name = options.label || 'SpringDynamometer';
    this.group.add(this.casingGroup);
    this.group.add(this.movingAssembly);

    this.initMaterials(options);
    this.createCasingAndCaps(options);
    this.createScalePlate();
    this.createSpringAssembly();
    this.createBottomHook();

    // 创建交互热区 (不渲染，用于精准光标拖拽拾取)
    this.hookHitBox = this.createHitBox(0.042, 0.050, 0.042);
    this.hookHitBox.name = `${this.group.name}-hook-hitbox`;
    this.hookHitBox.position.set(0, -this.tubeLength * 0.72, 0);
    this.movingAssembly.add(this.hookHitBox);

    this.ringHitBox = this.createHitBox(0.042, 0.055, 0.042);
    this.ringHitBox.name = `${this.group.name}-ring-hitbox`;
    this.ringHitBox.position.set(0, this.tubeLength * 0.75, 0);
    this.casingGroup.add(this.ringHitBox);

    this.casingHitBox = this.createHitBox(this.tubeRadius * 2.2, this.tubeLength, this.tubeRadius * 2.2);
    this.casingHitBox.name = `${this.group.name}-casing-hitbox`;
    this.casingHitBox.position.set(0, 0, 0);
    this.casingGroup.add(this.casingHitBox);

    // 初始受力归零
    this.setForce(0);
  }

  /**
   * 初始化材质系统 (严格遵照实物教具标准)
   */
  private initMaterials(options: SpringDynamometerOptions): void {
    // 1. 镜面液态铬不锈钢 (用于提环、中心拉杆、螺旋弹簧、秤钩)
    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.10,
    });

    // 2. 实验室经典青绿工程材质 (实物教具原色 0x0d8275)
    this.capMat = new THREE.MeshStandardMaterial({
      color: options.casingColor ?? 0x0d8275,
      metalness: 0.15,
      roughness: 0.32,
    });

    // 3. 高透明光学亚克力玻璃管
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.04,
      transmission: 0.96,
      thickness: 0.003,
      transparent: true,
      opacity: 0.28,
      ior: 1.50,
      depthWrite: false,
    });

    // 4. 鲜红指示游标圆盘
    this.redPointerMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.12,
      roughness: 0.24,
    });
  }

  /**
   * 创建透明外管、上下青绿端盖与顶部 U 型提环
   */
  private createCasingAndCaps(_options: SpringDynamometerOptions): void {
    const halfLen = this.tubeLength * 0.5;
    const r = this.tubeRadius;

    // 1. 透明外管主体 (圆柱管体，微细外倒角)
    const tubeGeo = new THREE.CylinderGeometry(r, r, this.tubeLength, 48, 1, true);
    this.glassTubeMesh = new THREE.Mesh(tubeGeo, this.glassMat);
    this.glassTubeMesh.position.y = 0;
    this.casingGroup.add(this.glassTubeMesh);

    // 2. 顶部上端盖 (带阶梯凸台与提环套孔)
    const topCapGroup = new THREE.Group();
    topCapGroup.position.y = halfLen;

    // 主套筒
    const capHeight = 0.024;
    const capGeo = new THREE.CylinderGeometry(r * 1.05, r * 1.05, capHeight, 48);
    this.topCapMesh = new THREE.Mesh(capGeo, this.capMat);
    this.topCapMesh.position.y = capHeight * 0.5;
    topCapGroup.add(this.topCapMesh);

    // 套筒底边缘圆润过渡倒角环
    const lipGeo = new THREE.TorusGeometry(r * 1.04, 0.0016, 12, 48);
    const lipMesh = new THREE.Mesh(lipGeo, this.capMat);
    lipMesh.rotation.x = Math.PI / 2;
    lipMesh.position.y = 0.001;
    topCapGroup.add(lipMesh);

    // 顶部凸起阶梯台座 (实物教具特征)
    const bossGeo = new THREE.CylinderGeometry(r * 0.44, r * 0.44, 0.016, 32);
    const bossMesh = new THREE.Mesh(bossGeo, this.capMat);
    bossMesh.position.y = capHeight + 0.008;
    topCapGroup.add(bossMesh);

    const subBossGeo = new THREE.CylinderGeometry(r * 0.28, r * 0.28, 0.006, 32);
    const subBossMesh = new THREE.Mesh(subBossGeo, this.capMat);
    subBossMesh.position.y = capHeight + 0.016 + 0.003;
    topCapGroup.add(subBossMesh);

    // 顶部 U 型提环 (圆润弯折不锈钢圆线)
    const ringPath = new THREE.CurvePath<THREE.Vector3>();
    const ringRadius = 0.0135;
    const legHeight = 0.038;
    const ringStartY = capHeight + 0.012;

    // 左立柱
    ringPath.add(new THREE.LineCurve3(
      new THREE.Vector3(-ringRadius, ringStartY, 0),
      new THREE.Vector3(-ringRadius, ringStartY + legHeight, 0)
    ));
    // 顶端半圆弧
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
    // 右立柱
    ringPath.add(new THREE.LineCurve3(
      new THREE.Vector3(ringRadius, ringStartY + legHeight, 0),
      new THREE.Vector3(ringRadius, ringStartY, 0)
    ));

    const ringGeo = new THREE.TubeGeometry(ringPath, 48, 0.0018, 16, false);
    this.topRingMesh = new THREE.Mesh(ringGeo, this.chromeMat);
    topCapGroup.add(this.topRingMesh);

    this.casingGroup.add(topCapGroup);

    // 3. 底部下端盖
    const bottomCapGroup = new THREE.Group();
    bottomCapGroup.position.y = -halfLen;

    const btmGeo = new THREE.CylinderGeometry(r * 1.05, r * 1.05, capHeight, 48);
    this.bottomCapMesh = new THREE.Mesh(btmGeo, this.capMat);
    this.bottomCapMesh.position.y = -capHeight * 0.5;
    bottomCapGroup.add(this.bottomCapMesh);

    // 下端盖顶边倒角环
    const btmLipMesh = new THREE.Mesh(lipGeo, this.capMat);
    btmLipMesh.rotation.x = Math.PI / 2;
    btmLipMesh.position.y = -0.001;
    bottomCapGroup.add(btmLipMesh);

    // 底部凸台套筒
    const btmBossGeo = new THREE.CylinderGeometry(r * 0.46, r * 0.46, 0.016, 32);
    const btmBossMesh = new THREE.Mesh(btmBossGeo, this.capMat);
    btmBossMesh.position.y = -capHeight - 0.008;
    bottomCapGroup.add(btmBossMesh);

    // 底部挂钩导套
    const btmEyeletGeo = new THREE.CylinderGeometry(r * 0.26, r * 0.26, 0.010, 24);
    const btmEyeletMesh = new THREE.Mesh(btmEyeletGeo, this.capMat);
    btmEyeletMesh.position.y = -capHeight - 0.016 - 0.005;
    bottomCapGroup.add(btmEyeletMesh);

    this.casingGroup.add(bottomCapGroup);
  }

  /**
   * 创建激光蚀刻高对比度标尺板 (内置于透明管内壁后方)
   * 0N 到 5N 刻度线与 3D 位移量严格一一对应：
   * 0N 位于 Y = zeroMarkY (+0.040 m)
   * 5N 位于 Y = zeroMarkY - scaleTravelM (-0.040 m)
   */
  private createScalePlate(options: SpringDynamometerOptions = {}): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 4096;
    const ctx = canvas.getContext('2d')!;

    // 纯白微亚光底色
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 左右包边微细阴影线条
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 24, canvas.height);
    ctx.fillRect(canvas.width - 24, 0, 24, canvas.height);

    // 标尺板高度 0.180m，对应 4096 像素
    // 0N 对应 Y = +0.040m (从板底向上 0.130m，比例 0.130/0.180 ≈ 0.7222)
    // 5N 对应 Y = -0.040m (从板底向上 0.050m，比例 0.050/0.180 ≈ 0.2778)
    const y0_px = Math.round((1 - 0.130 / 0.180) * canvas.height); // ~1138 px
    const y5_px = Math.round((1 - 0.050 / 0.180) * canvas.height); // ~2958 px
    const totalDistPx = y5_px - y0_px;

    // 顶端单位 "N"
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 220px "SF Pro Display", "PingFang SC", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', canvas.width * 0.44, y0_px - 360);

    // 若指定了测力计子标识 (如 'A' 或 'B')，绘制高对比度标志
    if (options.scaleSubLabel) {
      const hexColor = options.casingColor ? `#${options.casingColor.toString(16).padStart(6, '0')}` : '#0284c7';
      ctx.fillStyle = hexColor;
      ctx.font = 'bold 180px "SF Pro Display", "PingFang SC", Arial, sans-serif';
      ctx.fillText(options.scaleSubLabel, canvas.width * 0.76, y0_px - 360);
    }

    // 纵向参考基线
    const axisX = canvas.width * 0.48;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(axisX, y0_px - 20);
    ctx.lineTo(axisX, y5_px + 20);
    ctx.stroke();

    // 绘制 0 到 5N 刻度线与数字
    const numMajorTicks = 5;
    for (let i = 0; i <= numMajorTicks; i++) {
      const y = y0_px + (i / numMajorTicks) * totalDistPx;

      // 主刻度线 (长线，横跨基线两侧)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(axisX - 35, y);
      ctx.lineTo(axisX + 240, y);
      ctx.stroke();

      // 粗体数字 0, 1, 2, 3, 4, 5
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 180px "SF Pro Display", "PingFang SC", Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i), axisX - 70, y);

      // 每大格细分 10 个小格 (0.1N 分度值)
      if (i < numMajorTicks) {
        for (let sub = 1; sub <= 9; sub++) {
          const subY = y + (sub / 10) * (totalDistPx / numMajorTicks);
          const isMid = sub === 5; // 0.5N 中刻度线
          ctx.strokeStyle = isMid ? '#1e293b' : '#64748b';
          ctx.lineWidth = isMid ? 12 : 8;
          ctx.beginPath();
          ctx.moveTo(axisX, subY);
          ctx.lineTo(axisX + (isMid ? 170 : 100), subY);
          ctx.stroke();
        }
      }
    }

    this.scaleTexture = new THREE.CanvasTexture(canvas);
    this.scaleTexture.generateMipmaps = true;
    this.scaleTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.scaleTexture.magFilter = THREE.LinearFilter;

    // 刻度衬板 (位于透明圆管内稍微靠后 Z = -tubeRadius * 0.15 处)
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
   * 创建 3D 螺旋弹簧构件与中心拉杆
   */
  private createSpringAssembly(): void {
    // 1. 螺旋弹簧几何体构建 (以弹簧顶端挂接点为基准)
    this.springGroup.position.set(0, this.springAnchorY, 0);
    this.casingGroup.add(this.springGroup);

    const turns = 13;
    const helixRadius = this.tubeRadius * 0.42;
    const initialLen = this.springRestLengthM;

    class HelixCurve extends THREE.Curve<THREE.Vector3> {
      public r: number;
      public l: number;
      public t: number;
      constructor(r: number, l: number, t: number) {
        super();
        this.r = r;
        this.l = l;
        this.t = t;
      }
      getPoint(ratio: number, target = new THREE.Vector3()): THREE.Vector3 {
        const theta = ratio * Math.PI * 2 * this.t;
        return target.set(
          Math.cos(theta) * this.r,
          -ratio * this.l,
          Math.sin(theta) * this.r
        );
      }
    }

    const curve = new HelixCurve(helixRadius, initialLen, turns);
    const springGeo = new THREE.TubeGeometry(curve, 180, 0.0012, 12, false);
    this.springMesh = new THREE.Mesh(springGeo, this.chromeMat);
    this.springGroup.add(this.springMesh);

    // 2. 红色读数指示圆盘 (实物教具红色法兰盘)
    // 0N 初始位置位于 zeroMarkY
    const discGroup = new THREE.Group();
    discGroup.position.set(0, this.zeroMarkY, 0);

    // 鲜红指示凸缘盘
    const discGeo = new THREE.CylinderGeometry(this.tubeRadius * 0.65, this.tubeRadius * 0.65, 0.0028, 32);
    this.redPointerDisc = new THREE.Mesh(discGeo, this.redPointerMat);
    discGroup.add(this.redPointerDisc);

    // 红色套筒接头
    const collarGeo = new THREE.CylinderGeometry(this.tubeRadius * 0.28, this.tubeRadius * 0.28, 0.008, 24);
    const collarMesh = new THREE.Mesh(collarGeo, this.redPointerMat);
    collarMesh.position.y = 0.004;
    discGroup.add(collarMesh);

    this.movingAssembly.add(discGroup);

    // 3. 镀铬中心拉杆 (由红盘向下贯通外壳)
    const rodLen = this.tubeLength * 0.95;
    const rodGeo = new THREE.CylinderGeometry(0.0018, 0.0018, rodLen, 24);
    this.centerRodMesh = new THREE.Mesh(rodGeo, this.chromeMat);
    this.centerRodMesh.position.set(0, this.zeroMarkY - rodLen * 0.5, 0);
    this.movingAssembly.add(this.centerRodMesh);
  }

  /**
   * 创建底部受力拉钩 (高保真实物 S 型圆润挂钩)
   */
  private createBottomHook(): void {
    const hookPath = new THREE.CurvePath<THREE.Vector3>();

    const hookStartY = this.zeroMarkY - this.tubeLength * 0.95;
    const stemLen = 0.024;

    // 竖直下伸段
    hookPath.add(new THREE.LineCurve3(
      new THREE.Vector3(0, hookStartY, 0),
      new THREE.Vector3(0, hookStartY - stemLen, 0)
    ));

    // 上部小过渡弯
    const arc1 = new THREE.EllipseCurve(
      0.006, hookStartY - stemLen,
      0.006, 0.006,
      Math.PI, 0,
      true, 0
    );
    const p1 = arc1.getPoints(12);
    for (let i = 0; i < p1.length - 1; i++) {
      hookPath.add(new THREE.LineCurve3(
        new THREE.Vector3(p1[i].x, p1[i].y, 0),
        new THREE.Vector3(p1[i + 1].x, p1[i + 1].y, 0)
      ));
    }

    // 主受力 S 大弯钩
    const hookCenterY = hookStartY - stemLen - 0.018;
    const hookRadius = 0.0135;
    const arc2 = new THREE.EllipseCurve(
      0, hookCenterY,
      hookRadius, hookRadius,
      0, Math.PI * 1.28,
      false, 0
    );
    const p2 = arc2.getPoints(24);
    for (let i = 0; i < p2.length - 1; i++) {
      hookPath.add(new THREE.LineCurve3(
        new THREE.Vector3(p2[i].x, p2[i].y, 0),
        new THREE.Vector3(p2[i + 1].x, p2[i + 1].y, 0)
      ));
    }

    const hookGeo = new THREE.TubeGeometry(hookPath, 48, 0.0020, 16, false);
    this.bottomHookMesh = new THREE.Mesh(hookGeo, this.chromeMat);
    this.movingAssembly.add(this.bottomHookMesh);

    // 钩尖安全小圆珠
    const tipSphereGeo = new THREE.SphereGeometry(0.0026, 16, 16);
    const tipSphere = new THREE.Mesh(tipSphereGeo, this.chromeMat);
    const lastPoint = p2[p2.length - 1];
    tipSphere.position.set(lastPoint.x, lastPoint.y, 0);
    this.bottomHookMesh.add(tipSphere);
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
   * 自动驱动弹簧拉伸、红盘位移、拉杆下移、秤钩位置更新
   */
  public setForce(forceN: number): void {
    const clampedForce = Math.max(0, Math.min(this.maxForce, forceN));
    this.currentForceN = clampedForce;

    // 计算实际伸长量 \Delta y (m)
    // 0N -> 0 mm, 5N -> scaleTravelM (80 mm)
    const displacement = (clampedForce / this.maxForce) * this.scaleTravelM;
    this.currentDisplacementM = displacement;

    // 1. 更新螺旋弹簧纵向伸长比例
    const stretchedLength = this.springRestLengthM + displacement;
    const stretchRatio = stretchedLength / this.springRestLengthM;
    this.springMesh.scale.set(1, stretchRatio, 1);

    // 2. 更新整个活动总成 (红盘、拉杆、秤钩) 沿 -Y 方向的物理位移
    this.movingAssembly.position.set(0, -displacement, 0);
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
   * 获取底部秤钩在当前父级坐标系中的空间中心位置
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
   * 资源安全销毁
   */
  public dispose(): void {
    disposeObjectTree(this.group);
    if (this.scaleTexture) {
      this.scaleTexture.dispose();
    }
  }
}
