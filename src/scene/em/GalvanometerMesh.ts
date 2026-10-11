import * as THREE from 'three';
import { labMetal, labGlass, polishedGold } from './labKit.ts';
import { disposeObjectTree } from './disposeObject.ts';

export class GalvanometerMesh {
  public readonly group = new THREE.Group();
  public readonly needlePivot = new THREE.Group();
  public readonly needleMesh: THREE.Mesh;

  // 标称全量程参数 (-300 到 +300 µA)
  public static readonly FULL_SCALE_UA = 300;

  // 外部接线端子世界坐标位置 (供导线精确吸附连接)
  public readonly terminalRedPos = new THREE.Vector3();
  public readonly terminalBlackPos = new THREE.Vector3();

  private dialTexture: THREE.CanvasTexture;
  private dialMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.group.name = 'GalvanometerG';
    this.dialTexture = this.createDialTexture();
    this.needleMesh = this.buildApparatus();
  }

  /**
   * 绘制 1:1 还原真实照片的高精度象牙白搪瓷表盘贴图
   */
  private createDialTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const w = canvas.width;
      const h = canvas.height;

      // 1. 米白底色与微磨砂质感
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      // 外周细边线
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 4;
      ctx.strokeRect?.(20, 20, w - 40, h - 40);

      // 四个固定黄铜/钢制螺丝沉孔
      const drawScrew = (x: number, y: number) => {
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 8, y);
        ctx.lineTo(x + 8, y);
        ctx.stroke();
      };
      drawScrew(48, 48);
      drawScrew(w - 48, 48);
      drawScrew(48, h - 48);
      drawScrew(w - 48, h - 48);

      const cx = w * 0.5;
      const cy = h * 0.88; // 轴心位于表盘偏下方
      const arcR = w * 0.56;

      // 2. 防视差反射银镜弧带 (Anti-parallax mirror strip)
      ctx.beginPath();
      ctx.arc(cx, cy, arcR - 36, -Math.PI * 0.73, -Math.PI * 0.27, false);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 16;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, arcR - 36, -Math.PI * 0.73, -Math.PI * 0.27, false);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 6;
      ctx.stroke();

      // 3. 主刻度圆弧基线
      ctx.beginPath();
      ctx.arc(cx, cy, arcR, -Math.PI * 0.74, -Math.PI * 0.26, false);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      ctx.stroke();

      // 4. 细分刻度与主刻度线
      const numDivisions = 60;
      const startAngle = -Math.PI * 0.73;
      const endAngle = -Math.PI * 0.27;
      const stepAngle = (endAngle - startAngle) / numDivisions;

      for (let i = 0; i <= numDivisions; i++) {
        const theta = startAngle + i * stepAngle;
        const isMajor = i % 10 === 0;
        const isMid = i % 5 === 0;
        const tickLen = isMajor ? 32 : isMid ? 20 : 12;

        const x1 = cx + (arcR - tickLen) * Math.cos(theta);
        const y1 = cy + (arcR - tickLen) * Math.sin(theta);
        const x2 = cx + arcR * Math.cos(theta);
        const y2 = cy + arcR * Math.sin(theta);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = isMajor ? 5 : isMid ? 3.5 : 2;
        ctx.stroke();
      }

      // 5. 主刻度数字标注 (-300, -200, -100, 0, 100, 200, 300)
      const majorLabels = [
        { val: -300, theta: -Math.PI * 0.73 },
        { val: -200, theta: -Math.PI * 0.653 },
        { val: -100, theta: -Math.PI * 0.577 },
        { val: 0,    theta: -Math.PI * 0.5 },
        { val: 100,  theta: -Math.PI * 0.423 },
        { val: 200,  theta: -Math.PI * 0.347 },
        { val: 300,  theta: -Math.PI * 0.27 },
      ];

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      majorLabels.forEach((item) => {
        const textR = arcR - 64;
        const tx = cx + textR * Math.cos(item.theta);
        const ty = cy + textR * Math.sin(item.theta);
        ctx.font = 'bold 38px "SF Pro Display", sans-serif';
        const str = item.val === 0 ? '0' : String(item.val);
        ctx.fillText?.(str, tx, ty);
      });

      // 6. 经典居中超大黑体 "G"
      ctx.font = 'bold 96px "SF Pro Display", serif';
      ctx.fillText?.('G', cx, cy - arcR * 0.42);

      // 7. 规格等级标注
      ctx.font = '600 24px "SF Pro Display", sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText?.('CLASS 0.5 · 300µA', cx, cy - arcR * 0.24);

      // 8. 动圈机芯透明观测窗下半区底色
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy, arcR * 0.26, Math.PI, 0, false);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  private buildApparatus(): THREE.Mesh {
    const caseWidth = 0.22;
    const caseHeight = 0.18;
    const caseDepth = 0.16;

    // 1. 采用 ExtrudeGeometry 生成流线型倒角注塑仪器外壳 (后高前低梯形倾斜，非纯圆柱或方块拼接！)
    const profileShape = new THREE.Shape();
    // 侧面轮廓路径：底面 -> 前凸台阶台面 -> 65度倾斜表盘斜面 -> 顶面 -> 后面
    const baseD = caseDepth;
    const frontStepH = 0.038; // 前端接线端子台高度
    const frontStepW = 0.045; // 前端接线台深度

    profileShape.moveTo(0, 0); // 后下角
    profileShape.lineTo(baseD, 0); // 前下角
    profileShape.lineTo(baseD, frontStepH); // 前立面
    profileShape.lineTo(baseD - frontStepW, frontStepH); // 前台阶面
    profileShape.lineTo(0.018, caseHeight); // 斜向表面视窗
    profileShape.lineTo(0, caseHeight); // 顶后沿
    profileShape.closePath();

    const caseGeo = new THREE.ExtrudeGeometry(profileShape, {
      depth: caseWidth,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.005,
      bevelThickness: 0.005,
    });
    // 居中外壳
    caseGeo.center();

    const caseMat = labMetal(0x18181b, 0.2, 0.45); // 经典磨砂黑工程塑胶
    const caseMesh = new THREE.Mesh(caseGeo, caseMat);
    caseMesh.rotation.y = Math.PI * 0.5; // 旋转至正面朝向观察者
    caseMesh.position.set(0, caseHeight * 0.5, 0);
    this.group.add(caseMesh);

    // 2. 表盘倾角计算 (斜切面板法线)
    const inclineAngle = Math.atan2(caseHeight - frontStepH, baseD - frontStepW - 0.018);
    const dialAngleX = -(Math.PI * 0.5 - inclineAngle);

    // 表头视窗组
    const dialGroup = new THREE.Group();
    // 视窗中心定位在斜面板中央
    dialGroup.position.set(0, (caseHeight + frontStepH) * 0.52, -0.008);
    dialGroup.rotation.x = dialAngleX;

    // 表盘底板
    const dialW = caseWidth * 0.88;
    const dialH = caseHeight * 0.74;

    this.dialMaterial = new THREE.MeshStandardMaterial({
      map: this.dialTexture,
      roughness: 0.35,
      metalness: 0.05,
    });
    const dialMesh = new THREE.Mesh(new THREE.PlaneGeometry(dialW, dialH), this.dialMaterial);
    dialMesh.position.set(0, 0, 0.002);
    dialGroup.add(dialMesh);

    // 3. 动圈机芯透明观测窗与内部精密机械 (Moving Coil Mechanism)
    const coreWindow = new THREE.Group();
    coreWindow.position.set(0, -dialH * 0.34, 0.004);

    // 黄铜机芯支架桥
    const bridgeGeo = new THREE.BoxGeometry(0.048, 0.007, 0.004);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, polishedGold(0xca8a04));
    coreWindow.add(bridgeMesh);

    // 同心青铜细螺旋游丝 (Spiral hairspring)
    for (let r of [0.008, 0.012, 0.016]) {
      const springRing = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.0012, 24),
        new THREE.MeshBasicMaterial({ color: 0xb45309, side: THREE.DoubleSide })
      );
      coreWindow.add(springRing);
    }

    // 轴心红宝石轴承盖帽
    const jewelCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.005, 16),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.1, metalness: 0.6 })
    );
    jewelCap.rotation.x = Math.PI * 0.5;
    coreWindow.add(jewelCap);

    dialGroup.add(coreWindow);

    // 4. 真实防尘平整玻璃视窗
    const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(dialW * 1.02, dialH * 1.02), labGlass(0.18));
    glassMesh.position.set(0, 0, 0.008);
    dialGroup.add(glassMesh);

    // 5. 动圈二阶物理指针系统 (旋转轴心位于表盘刻度焦点)
    this.needlePivot.position.set(0, -dialH * 0.34, 0.006);

    // 刀锋红色指针 (针长经过严格计算恰好触及刻度内弧，带圆形平衡重锤)
    const needleLen = dialH * 0.72;
    const needleShape = new THREE.Shape();
    needleShape.moveTo(-0.0014, 0);
    needleShape.lineTo(-0.0004, needleLen);
    needleShape.lineTo(0.0004, needleLen);
    needleShape.lineTo(0.0014, 0);
    // 尾部平衡锤
    needleShape.lineTo(0.003, -0.016);
    needleShape.lineTo(-0.003, -0.016);
    needleShape.closePath();

    const needleGeo = new THREE.ExtrudeGeometry(needleShape, {
      depth: 0.0006,
      bevelEnabled: false,
    });
    needleGeo.center();
    // 重新将枢轴对齐到原点 (0, 0)
    needleGeo.translate(0, (needleLen - 0.016) * 0.5 - (needleLen * 0.5 - 0.008), 0);

    const needleMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const needleMesh = new THREE.Mesh(needleGeo, needleMat);
    this.needlePivot.add(needleMesh);

    // 轴心保护铜帽
    const needleCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 16),
      polishedGold(0xd97706)
    );
    needleCap.rotation.x = Math.PI * 0.5;
    this.needlePivot.add(needleCap);

    dialGroup.add(this.needlePivot);
    this.group.add(dialGroup);

    // 6. 前端专用精密绝缘香蕉插座 (黑色端子在左，红色端子在右)
    const terminalZ = caseDepth * 0.5 - 0.024;
    const terminalY = frontStepH + 0.008;

    const postBlack = this.createMachinedBindingPost(0x0f172a);
    postBlack.position.set(-0.065, terminalY, terminalZ);
    this.group.add(postBlack);
    this.terminalBlackPos.set(-0.065, terminalY + 0.016, terminalZ);

    const postRed = this.createMachinedBindingPost(0xdc2626);
    postRed.position.set(0.065, terminalY, terminalZ);
    this.group.add(postRed);
    this.terminalRedPos.set(0.065, terminalY + 0.016, terminalZ);

    return needleMesh;
  }

  /**
   * 创建车削加工质感的工业绝缘接线柱
   */
  private createMachinedBindingPost(colorHex: number): THREE.Group {
    const post = new THREE.Group();
    // 绝缘底座法兰
    const baseFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.012, 0.006, 20),
      labMetal(0x1e293b, 0.3, 0.4)
    );
    post.add(baseFlange);

    // 纯铜螺柱
    const screwShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.024, 16),
      polishedGold(0xca8a04)
    );
    screwShaft.position.set(0, 0.012, 0);
    post.add(screwShaft);

    // 色标滚花绝缘旋钮套帽
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.014, 20),
      new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.3, roughness: 0.35 })
    );
    cap.position.set(0, 0.016, 0);
    post.add(cap);

    // 香蕉插头插孔 (中心孔)
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.006, 12),
      labMetal(0x020617, 0.9, 0.1)
    );
    hole.position.set(0, 0.024, 0);
    post.add(hole);

    return post;
  }

  /**
   * 更新检流计指针旋转偏角
   * @param normalizedAngle -1.0 到 +1.0 对应 -300 到 +300 µA
   */
  public setNeedle(normalizedAngle: number): void {
    // 最大偏转角约为 ±42 度 (±0.733 rad)
    const maxSweepRad = 0.733;
    const clamped = Math.max(-1.12, Math.min(1.12, normalizedAngle));
    this.needlePivot.rotation.z = -clamped * maxSweepRad;
  }

  public dispose(): void {
    if (this.dialTexture) this.dialTexture.dispose();
    if (this.dialMaterial) this.dialMaterial.dispose();
    disposeObjectTree(this.group);
  }
}
