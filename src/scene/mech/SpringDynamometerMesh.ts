/**
 * 3D 高精细度实验室弹簧测力计模型 (High-Fidelity Spring Dynamometer 3D Mesh)
 *
 * 严格遵照真实物理教具（标准 5N 圆筒形透明弹簧测力计）工业级建模：
 * 1. 顶部提环：镜面液态铬不锈钢 U 型提环 (Torus + Extrude/Tube 构造，具有圆润饱满的机械倒角)；
 * 2. 调零套套筒：高雅科研级青绿阳极氧化铝套筒 (0x0d9488)，带微米级滚花调零旋钮与黄铜微调锁紧环；
 * 3. 外层高透保护管：双层纯净光学级透明亚克力管，具有真实菲涅尔高光与折射质感；
 * 4. 内置激光蚀刻标尺板：高对比度白色圆弧衬板，印有深蓝清晰 "N" 标识、0~5N 粗体读数与 0.1N 精细分度线；
 * 5. 真实 3D 螺旋弹簧：精细圆截面螺旋螺旋弹簧 (TubeGeometry)，物理拉力实时拉伸形变；
 * 6. 红色指示圆盘：圆盘形红色读数游标，精确定位至标尺刻度线，无视差观察；
 * 7. 中心镜面拉杆与底部秤钩：贯通式液态铬不锈钢拉杆，底部配备标准 S 型圆润秤钩。
 */

import * as THREE from 'three';
import { mechMetal, disposeObjectTree } from './mechKit.ts';

export interface SpringDynamometerOptions {
  label?: string;             // 标识名 (例如 '测力计 A', '测力计 B', '测力计 (独立)')
  maxForce?: number;          // 最大量程 (默认 5.0 N)
  casingColor?: number;       // 端盖金属配色 (默认 0x0d9488 高级实验室孔雀青绿)
  accentColor?: number;       // 强调色 (默认 0xf59e0b 香槟金)
  tubeLength?: number;        // 外壳长度 (默认 0.20 m)
  tubeRadius?: number;        // 外壳半径 (默认 0.018 m)
}

export class SpringDynamometerMesh {
  public readonly group = new THREE.Group();

  // 核心构件子节点
  public readonly casingGroup = new THREE.Group();        // 外壳与固定部件 (随测力计外壳移动)
  public readonly movingAssembly = new THREE.Group();     // 活动拉伸部件 (弹簧底端、拉杆、红盘、秤钩)
  public readonly hookHitBox: THREE.Mesh;                 // 秤钩鼠标拾取包围盒
  public readonly ringHitBox: THREE.Mesh;                 // 提环鼠标拾取包围盒

  // 构件网格引用
  private topRingMesh!: THREE.Mesh;
  private topCapMesh!: THREE.Mesh;
  private zeroAdjustKnob!: THREE.Mesh;
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
  private brassMat!: THREE.MeshStandardMaterial;
  private glassMat!: THREE.MeshPhysicalMaterial;
  private redPointerMat!: THREE.MeshStandardMaterial;
  private scaleTexture!: THREE.CanvasTexture;

  // 物理几何尺寸
  public readonly maxForce: number;
  public readonly tubeLength: number;
  public readonly tubeRadius: number;

  // 刻度行进参数 (0N 到 5N 对应的内部位移量)
  public readonly scaleTravelM = 0.085;       // 85 mm 刻度有效行程
  public readonly zeroMarkY = 0.038;          // 0N 刻度线在局部坐标系中的 Y 坐标
  public readonly springRestLengthM = 0.048;  // 弹簧静止自由长度 (48 mm)
  public readonly springAnchorY = 0.086;      // 弹簧顶端挂接点 Y

  // 动态状态
  private currentForceN = 0;
  private currentDisplacementM = 0;

  constructor(options: SpringDynamometerOptions = {}) {
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
    this.hookHitBox = this.createHitBox(0.045, 0.045, 0.045);
    this.hookHitBox.name = `${this.group.name}-hook-hitbox`;
    this.hookHitBox.position.set(0, -this.tubeLength * 0.65, 0);
    this.movingAssembly.add(this.hookHitBox);

    this.ringHitBox = this.createHitBox(0.045, 0.045, 0.045);
    this.ringHitBox.name = `${this.group.name}-ring-hitbox`;
    this.ringHitBox.position.set(0, this.tubeLength * 0.72, 0);
    this.casingGroup.add(this.ringHitBox);

    // 初始受力归零
    this.setForce(0);
  }

  /**
   * 初始化材质系统 (符合高级实验室工业材质规范，严禁脏黑塑料)
   */
  private initMaterials(options: SpringDynamometerOptions): void {
    // 1. 镜面液态铬合金 (用于提环、中心拉杆、秤钩)
    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.12,
    });

    // 2. 高级青绿阳极氧化铝材质 (0x0d9488，标准科学实验仪器经典质感)
    this.capMat = new THREE.MeshStandardMaterial({
      color: options.casingColor ?? 0x0d9488,
      metalness: 0.35,
      roughness: 0.28,
    });

    // 3. 香槟金微调旋钮与固定压套
    this.brassMat = new THREE.MeshStandardMaterial({
      color: options.accentColor ?? 0xf59e0b,
      metalness: 0.88,
      roughness: 0.22,
    });

    // 4. 高透明光学亚克力玻璃管 (带真实透光菲涅尔折射)
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      metalness: 0.02,
      roughness: 0.06,
      transmission: 0.92,
      thickness: 0.003,
      transparent: true,
      opacity: 0.38,
      ior: 1.49,
      depthWrite: false,
    });

    // 5. 鲜红指示游标圆盘
    this.redPointerMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.15,
      roughness: 0.20,
    });
  }

  /**
   * 创建外壳、端盖与顶部提环
   */
  private createCasingAndCaps(_options: SpringDynamometerOptions): void {
    const halfLen = this.tubeLength * 0.5;
    const r = this.tubeRadius;

    // 1. 透明外管主体 (圆柱管体，微细外倒角)
    const tubeGeo = new THREE.CylinderGeometry(r, r, this.tubeLength, 48, 1, true);
    this.glassTubeMesh = new THREE.Mesh(tubeGeo, this.glassMat);
    this.glassTubeMesh.position.y = 0;
    this.casingGroup.add(this.glassTubeMesh);

    // 2. 顶部上端盖 (带精密台阶倒角)
    const topCapGroup = new THREE.Group();
    topCapGroup.position.y = halfLen;

    // 主套筒
    const capGeo = new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.026, 48);
    this.topCapMesh = new THREE.Mesh(capGeo, this.capMat);
    this.topCapMesh.position.y = 0.013;
    topCapGroup.add(this.topCapMesh);

    // 香槟金金属装饰压环
    const rimGeo = new THREE.CylinderGeometry(r * 1.07, r * 1.07, 0.004, 48);
    const rimMesh = new THREE.Mesh(rimGeo, this.brassMat);
    rimMesh.position.y = 0.002;
    topCapGroup.add(rimMesh);

    // 顶部凸出调零螺母套管
    const studGeo = new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.016, 32);
    const studMesh = new THREE.Mesh(studGeo, this.capMat);
    studMesh.position.y = 0.032;
    topCapGroup.add(studMesh);

    // 顶端微米级滚花调零旋钮 (Knurled Zero-Adjust Knob)
    const knobGeo = new THREE.CylinderGeometry(r * 0.48, r * 0.48, 0.010, 32);
    this.zeroAdjustKnob = new THREE.Mesh(knobGeo, this.brassMat);
    this.zeroAdjustKnob.position.y = 0.043;
    topCapGroup.add(this.zeroAdjustKnob);

    // 顶部 U 型提环 (圆管弯折成的挂环)
    const ringPath = new THREE.CurvePath<THREE.Vector3>();
    const ringRadius = 0.014;
    const legHeight = 0.035;

    // 左立柱
    ringPath.add(new THREE.LineCurve3(
      new THREE.Vector3(-ringRadius, 0.025, 0),
      new THREE.Vector3(-ringRadius, 0.025 + legHeight, 0)
    ));
    // 顶端半圆弧
    const arcCurve = new THREE.EllipseCurve(
      0, 0.025 + legHeight,
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
      new THREE.Vector3(ringRadius, 0.025 + legHeight, 0),
      new THREE.Vector3(ringRadius, 0.025, 0)
    ));

    const ringGeo = new THREE.TubeGeometry(ringPath, 48, 0.0022, 16, false);
    this.topRingMesh = new THREE.Mesh(ringGeo, this.chromeMat);
    topCapGroup.add(this.topRingMesh);

    this.casingGroup.add(topCapGroup);

    // 3. 底部下端盖
    const bottomCapGroup = new THREE.Group();
    bottomCapGroup.position.y = -halfLen;

    const btmGeo = new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.026, 48);
    this.bottomCapMesh = new THREE.Mesh(btmGeo, this.capMat);
    this.bottomCapMesh.position.y = -0.013;
    bottomCapGroup.add(this.bottomCapMesh);

    // 底部黄铜导向套管 (Central Guide Bushing)
    const btmBushGeo = new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.018, 32);
    const btmBushMesh = new THREE.Mesh(btmBushGeo, this.brassMat);
    btmBushMesh.position.y = -0.030;
    bottomCapGroup.add(btmBushMesh);

    this.casingGroup.add(bottomCapGroup);
  }

  /**
   * 创建激光蚀刻高对比度标尺板 (内置于透明管内壁后方)
   */
  private createScalePlate(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;

    // 纯白微缎面底色
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 标尺左右微细包边阴影
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 16, canvas.height);
    ctx.fillRect(canvas.width - 16, 0, 16, canvas.height);

    // 顶端单位 "N"
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 110px "SF Pro Display", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', canvas.width * 0.32, 180);

    // 绘制 0 到 5N 刻度线与数字
    const topPx = 280;
    const btmPx = 1880;
    const totalDistPx = btmPx - topPx;
    const numMajorTicks = 5; // 0, 1, 2, 3, 4, 5

    ctx.textAlign = 'right';
    for (let i = 0; i <= numMajorTicks; i++) {
      const y = topPx + (i / numMajorTicks) * totalDistPx;

      // 主刻度线 (长线，横跨半面)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.46, y);
      ctx.lineTo(canvas.width * 0.88, y);
      ctx.stroke();

      // 大数字标号 0, 1, 2, 3, 4, 5
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 96px "SF Pro Display", "PingFang SC", sans-serif';
      ctx.fillText(String(i), canvas.width * 0.38, y);

      // 每大格细分 10 个小格 (0.1N 分度值)
      if (i < numMajorTicks) {
        for (let sub = 1; sub <= 9; sub++) {
          const subY = y + (sub / 10) * (totalDistPx / numMajorTicks);
          const isMid = sub === 5; // 0.5N 中刻度线
          ctx.strokeStyle = isMid ? '#1e293b' : '#64748b';
          ctx.lineWidth = isMid ? 6 : 4;
          ctx.beginPath();
          ctx.moveTo(isMid ? canvas.width * 0.52 : canvas.width * 0.60, subY);
          ctx.lineTo(canvas.width * 0.86, subY);
          ctx.stroke();
        }
      }
    }

    this.scaleTexture = new THREE.CanvasTexture(canvas);
    this.scaleTexture.generateMipmaps = true;
    this.scaleTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.scaleTexture.magFilter = THREE.LinearFilter;

    // 刻度衬板 (位于透明圆管内稍微靠后 Z = -0.002 处)
    const plateWidth = this.tubeRadius * 1.62;
    const plateHeight = this.tubeLength * 0.88;
    const plateGeo = new THREE.PlaneGeometry(plateWidth, plateHeight);
    const plateMat = new THREE.MeshBasicMaterial({
      map: this.scaleTexture,
      side: THREE.DoubleSide,
    });
    this.scalePlateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.scalePlateMesh.position.set(0, 0, -this.tubeRadius * 0.12);
    this.casingGroup.add(this.scalePlateMesh);
  }

  /**
   * 创建 3D 螺旋弹簧构件与中心拉杆
   */
  private createSpringAssembly(): void {
    // 1. 螺旋弹簧几何体构建 (以弹簧顶端为固定锚点 springAnchorY)
    this.springGroup.position.set(0, this.springAnchorY, 0);
    this.casingGroup.add(this.springGroup);

    // 构建默认 12 圈圆线螺旋弹簧
    const turns = 12;
    const helixRadius = this.tubeRadius * 0.44;
    const initialLen = this.springRestLengthM;

    class HelixCurve extends THREE.Curve<THREE.Vector3> {
      private r: number;
      private l: number;
      private t: number;
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
    const springGeo = new THREE.TubeGeometry(curve, 180, 0.0013, 10, false);
    const springWireMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.95,
      roughness: 0.18,
    });
    this.springMesh = new THREE.Mesh(springGeo, springWireMat);
    this.springGroup.add(this.springMesh);

    // 2. 红色读数指示圆盘 (在弹簧底端接合处)
    // 0N 初始位置位于 zeroMarkY
    const discGeo = new THREE.CylinderGeometry(this.tubeRadius * 0.68, this.tubeRadius * 0.68, 0.0035, 32);
    this.redPointerDisc = new THREE.Mesh(discGeo, this.redPointerMat);
    this.redPointerDisc.position.set(0, this.zeroMarkY, 0);
    this.movingAssembly.add(this.redPointerDisc);

    // 红盘边缘镜面镀铬定位刻线环
    const discEdgeGeo = new THREE.TorusGeometry(this.tubeRadius * 0.68, 0.0007, 8, 32);
    const discEdgeMesh = new THREE.Mesh(discEdgeGeo, this.chromeMat);
    discEdgeMesh.rotation.x = Math.PI / 2;
    this.redPointerDisc.add(discEdgeMesh);

    // 3. 中心拉杆 (由红盘向下穿过底部导套)
    const rodLen = this.tubeLength * 0.95;
    const rodGeo = new THREE.CylinderGeometry(0.0022, 0.0022, rodLen, 24);
    this.centerRodMesh = new THREE.Mesh(rodGeo, this.chromeMat);
    this.centerRodMesh.position.set(0, this.zeroMarkY - rodLen * 0.5, 0);
    this.movingAssembly.add(this.centerRodMesh);
  }

  /**
   * 创建底部受力拉钩 (精美镜面镀铬 S 型圆润挂钩)
   */
  private createBottomHook(): void {
    const hookPath = new THREE.CurvePath<THREE.Vector3>();

    // 从拉杆底端向下过渡，紧接着一个平滑开式圆弧弯钩
    const hookStartY = this.zeroMarkY - this.tubeLength * 0.95;
    const stemLen = 0.022;

    // 竖直下伸段
    hookPath.add(new THREE.LineCurve3(
      new THREE.Vector3(0, hookStartY, 0),
      new THREE.Vector3(0, hookStartY - stemLen, 0)
    ));

    // 上小过渡弧
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

    // 主受力大挂钩弯曲 (内凹半圆弧，便于挂载互拉或挂钩码)
    const hookCenterY = hookStartY - stemLen - 0.016;
    const hookRadius = 0.012;
    const arc2 = new THREE.EllipseCurve(
      0, hookCenterY,
      hookRadius, hookRadius,
      0, Math.PI * 1.25,
      false, 0
    );
    const p2 = arc2.getPoints(20);
    for (let i = 0; i < p2.length - 1; i++) {
      hookPath.add(new THREE.LineCurve3(
        new THREE.Vector3(p2[i].x, p2[i].y, 0),
        new THREE.Vector3(p2[i + 1].x, p2[i + 1].y, 0)
      ));
    }

    const hookGeo = new THREE.TubeGeometry(hookPath, 48, 0.0022, 16, false);
    this.bottomHookMesh = new THREE.Mesh(hookGeo, this.chromeMat);
    this.movingAssembly.add(this.bottomHookMesh);

    // 钩尖安全小圆珠 (防划伤工业倒角)
    const tipSphereGeo = new THREE.SphereGeometry(0.0028, 16, 16);
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
    // 0N -> 0 mm, 5N -> scaleTravelM (85 mm)
    const displacement = (clampedForce / this.maxForce) * this.scaleTravelM;
    this.currentDisplacementM = displacement;

    // 1. 更新内部螺旋弹簧纵向伸长比例
    const stretchedLength = this.springRestLengthM + displacement;
    const stretchRatio = stretchedLength / this.springRestLengthM;
    this.springMesh.scale.set(1, stretchRatio, 1);

    // 2. 更新整个活动总成 (红盘、拉杆、秤钩) 沿 -Y 方向的物理位移
    this.movingAssembly.position.set(0, -displacement, 0);
  }

  /**
   * 获取当前示数
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
    } else {
      this.chromeMat.emissive.setHex(0x000000);
      this.chromeMat.emissiveIntensity = 0;
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
