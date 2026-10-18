/**
 * 悬挂法测物体重心实验 - 待测塑料薄板、孔位与红线重心标靶 3D 模型
 */

import * as THREE from 'three';
import {
  type PlateShapeDef,
  type PlateHoleDef,
  type Line2D,
  PRESET_PLATE_SHAPES,
} from '../../physics/mech/suspensionDynamics.ts';
import { mechMetal, disposeObjectTree } from './mechKit.ts';

export class SuspensionPlateMesh {
  public readonly group = new THREE.Group();

  // 塑料板主体网格与几何体
  public plateMesh!: THREE.Mesh;
  private plateMaterial!: THREE.MeshPhysicalMaterial;
  private plateEdgesLine!: THREE.LineSegments;

  // 孔位组件引用 (便于射线检测与高亮，不使用任何人工遮挡的字母标签)
  public holeHitMeshes: THREE.Mesh[] = [];
  private holeGrommets: THREE.Mesh[] = [];

  // 已绘制的红线与重心标靶 (作为 plateMesh 的子节点，随板同步运动与旋转)
  private lineObjects: THREE.Group[] = [];
  private cogMarkerGroup: THREE.Group | null = null;

  // 当前板形状定义
  public plateDef: PlateShapeDef;

  // 画线动画进度
  private drawingProgress = 1.0;
  private isDrawingLine = false;

  constructor(plateDef: PlateShapeDef = PRESET_PLATE_SHAPES.irregular) {
    this.plateDef = plateDef;
    this.rebuildPlate();
  }

  /**
   * 根据板形状定义重建整个薄板与镂空打孔
   */
  public rebuildPlate(plateDef?: PlateShapeDef): void {
    if (plateDef) {
      this.plateDef = plateDef;
    }

    // 清理旧网格与子部件
    this.clearDrawnLines();
    this.clearCogMarker();
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        if (Array.isArray((child as any).material)) {
          (child as any).material.forEach((m: any) => m.dispose());
        } else {
          (child as any).material.dispose();
        }
      }
    }
    this.holeHitMeshes = [];
    this.holeGrommets = [];

    // 1. 构建带有镂空孔洞的 2D Shape
    const shape = new THREE.Shape();
    const verts = this.plateDef.vertices;
    shape.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) {
      shape.lineTo(verts[i][0], verts[i][1]);
    }
    shape.closePath();

    // 在 Shape 中穿孔 (Holes)
    for (const hole of this.plateDef.holes) {
      const holePath = new THREE.Path();
      holePath.absarc(hole.x, hole.y, hole.radius, 0, Math.PI * 2, true);
      shape.holes.push(holePath);
    }

    // 2. 挤出 3D 实体 (厚度 5mm，带精细微倒角)
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.005,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.0015,
      bevelThickness: 0.0015,
    };
    const plateGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    plateGeo.translate(0, 0, -0.0025);

    // 优质高透微蓝丙烯酸亚克力塑料物理材质
    this.plateMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      transmission: 0.50,
      roughness: 0.15,
      metalness: 0.04,
      clearcoat: 0.95,
      clearcoatRoughness: 0.08,
      reflectivity: 0.90,
      side: THREE.DoubleSide,
    });

    this.plateMesh = new THREE.Mesh(plateGeo, this.plateMaterial);
    this.plateMesh.name = 'suspension-plate';
    this.plateMesh.userData = { isPlate: true };
    this.plateMesh.castShadow = true;
    this.plateMesh.receiveShadow = true;
    this.group.add(this.plateMesh);

    // 边缘精细描边轮廓
    const edgesGeo = new THREE.EdgesGeometry(plateGeo, 25);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.85,
      linewidth: 1.5,
    });
    this.plateEdgesLine = new THREE.LineSegments(edgesGeo, edgesMat);
    this.plateMesh.add(this.plateEdgesLine);

    // 3. 构建孔位的金属扣环与交互检测碰撞体（彻底移除人工 ABCD 标牌）
    for (const hole of this.plateDef.holes) {
      this.createHoleAssembly(hole);
    }
  }

  /**
   * 为小孔创建金属护圈和拾取碰撞体（不注入任何悬浮 ABCD 标牌）
   */
  private createHoleAssembly(hole: PlateHoleDef): void {
    // 正面与背面双面黄铜铆装保护孔圈
    const grommetGeo = new THREE.TorusGeometry(hole.radius + 0.0018, 0.0014, 12, 24);
    const grommetMat = mechMetal(0xf59e0b, 0.9, 0.2); // 黄铜金属加固扣环

    const frontGrommet = new THREE.Mesh(grommetGeo, grommetMat);
    frontGrommet.position.set(hole.x, hole.y, 0.0040);
    this.plateMesh.add(frontGrommet);
    this.holeGrommets.push(frontGrommet);

    const backGrommet = new THREE.Mesh(grommetGeo, grommetMat);
    backGrommet.position.set(hole.x, hole.y, -0.0040);
    this.plateMesh.add(backGrommet);
    this.holeGrommets.push(backGrommet);

    // 交互拾取检测用透明圆柱 (较大半径 2.6cm，方便轻松点选与拖拽)
    const hitGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.03, 16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.rotation.x = Math.PI / 2;
    hitMesh.position.set(hole.x, hole.y, 0);
    hitMesh.name = `plate-hole-${hole.id}`;
    hitMesh.userData = { isHole: true, holeId: hole.id, holeLabel: hole.label };
    this.plateMesh.add(hitMesh);
    this.holeHitMeshes.push(hitMesh);
  }

  /**
   * 设置指定孔的悬停高亮状态 (纯 3D 物理金属光环响应)
   */
  public setHoleHovered(holeId: string | null): void {
    this.plateDef.holes.forEach((hole, idx) => {
      // 每个孔包含正面和背面两个扣环
      const frontGrommet = this.holeGrommets[idx * 2];
      const backGrommet = this.holeGrommets[idx * 2 + 1];

      if (hole.id === holeId) {
        if (frontGrommet) {
          (frontGrommet.material as THREE.MeshStandardMaterial).color.setHex(0x22c55e); // 高亮绿
          frontGrommet.scale.setScalar(1.35);
        }
        if (backGrommet) {
          (backGrommet.material as THREE.MeshStandardMaterial).color.setHex(0x22c55e);
          backGrommet.scale.setScalar(1.35);
        }
      } else {
        if (frontGrommet) {
          (frontGrommet.material as THREE.MeshStandardMaterial).color.setHex(0xf59e0b); // 正常黄铜
          frontGrommet.scale.setScalar(1.0);
        }
        if (backGrommet) {
          (backGrommet.material as THREE.MeshStandardMaterial).color.setHex(0xf59e0b);
          backGrommet.scale.setScalar(1.0);
        }
      }
    });
  }

  /**
   * 计算从悬挂孔出发的铅垂线与薄板多边形边界的精确交点跨度 [tStart, tEnd]
   * 使得红线完美贴合薄板轮廓两端，绝不伸入空气中产生突兀外露
   */
  private computeLineExtentsInPolygon(
    origin: { x: number; y: number },
    direction: { x: number; y: number }
  ): { tStart: number; tEnd: number } {
    const verts = this.plateDef.vertices;
    const n = verts.length;
    const intersections: number[] = [];

    const dx = direction.x;
    const dy = direction.y;

    for (let i = 0; i < n; i++) {
      const x1 = verts[i][0];
      const y1 = verts[i][1];
      const x2 = verts[(i + 1) % n][0];
      const y2 = verts[(i + 1) % n][1];

      const ex = x2 - x1;
      const ey = y2 - y1;

      // 联立求解: origin + t * dir = A + s * (B - A)
      const D = ex * dy - ey * dx;
      if (Math.abs(D) < 1e-7) continue;

      const qx = x1 - origin.x;
      const qy = y1 - origin.y;

      const t = (-ey * qx + ex * qy) / D;
      const s = (dx * qy - dy * qx) / D;

      // 在线段内部 (留出 0.5% 容差)
      if (s >= -0.005 && s <= 1.005) {
        intersections.push(t);
      }
    }

    const backward = intersections.filter((t) => t <= 0.001);
    const forward = intersections.filter((t) => t >= -0.001);

    // backward 取最大的负数（离 origin 最近的上端边界出射点）
    const tStart = backward.length > 0 ? Math.max(...backward) : -0.02;
    // forward 取最小的正数（离 origin 最近的下端边界出射点）
    const tEnd = forward.length > 0 ? Math.min(...forward) : 0.16;

    return { tStart, tEnd };
  }

  /**
   * 在薄板表面精确绘制鲜艳红线
   * 修复深度缓冲与厚度倒角遮挡问题：
   * 1. 定位在正表面微外侧 (Z = 0.0048m)，消除内部深陷被透光表面剔除的缺陷
   * 2. 启用 polygonOffset 与 renderOrder = 99，杜绝深度争夺与透明通道遮挡
   * 3. 去除一切非必要的浮动文本标牌，呈现纯粹真实的板面物理红笔标记
   */
  public addMarkedLine(line: Line2D, lineIndex: number, animated = true): void {
    const lineGroup = new THREE.Group();
    lineGroup.name = `marked-line-${line.holeId}`;
    // 放置在薄板正表面前方 (Z=0.0048m)，彻底解决由于薄板挤出厚度引起的深度剔除缺陷
    lineGroup.position.set(line.origin.x, line.origin.y, 0.0048);

    const dirAngle = Math.atan2(line.direction.y, line.direction.x);
    lineGroup.rotation.z = dirAngle;

    // 计算红线与薄板几何轮廓的起止端点
    const { tStart, tEnd } = this.computeLineExtentsInPolygon(line.origin, line.direction);

    const pStart = new THREE.Vector3(tStart, 0, 0);
    const pEnd = new THREE.Vector3(tEnd, 0, 0);

    // 1. 鲜红铅垂主线 (细高光中心线)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([pStart, pEnd]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xff1e56, // 亮丽正红
      linewidth: 3.0,
      transparent: true,
      opacity: 1.0,
      depthTest: true,
      depthWrite: false,
    });
    const mainLine = new THREE.Line(lineGeo, lineMat);
    mainLine.renderOrder = 98;
    lineGroup.add(mainLine);

    // 2. 物理马克笔红色实体缎带 (解决 WebGL 1px 线宽在高清屏过细及抗锯齿残损问题)
    const ribbonHalfWidth = 0.0013; // 2.6mm 适中物理画笔线宽
    const ribbonGeo = new THREE.BufferGeometry();
    const ribbonVertices = new Float32Array([
      tStart,  ribbonHalfWidth, 0,
      tStart, -ribbonHalfWidth, 0,
      tEnd,    ribbonHalfWidth, 0,

      tStart, -ribbonHalfWidth, 0,
      tEnd,   -ribbonHalfWidth, 0,
      tEnd,    ribbonHalfWidth, 0,
    ]);
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonVertices, 3));
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0xef4444, // 鲜明饱和红色
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbonMesh.renderOrder = 99;
    lineGroup.add(ribbonMesh);

    lineGroup.renderOrder = 99;

    if (animated) {
      this.isDrawingLine = true;
      this.drawingProgress = 0;
      lineGroup.scale.set(0.01, 1, 1);
    } else {
      lineGroup.scale.set(1, 1, 1);
    }

    this.plateMesh.add(lineGroup);
    this.lineObjects.push(lineGroup);
  }

  /**
   * 显示重心测定标靶 (双线交点处)
   */
  public showCenterOfGravityMarker(cg: { x: number; y: number }): void {
    this.clearCogMarker();

    this.cogMarkerGroup = new THREE.Group();
    this.cogMarkerGroup.name = 'center-of-gravity-marker';
    // 定位于红线外层 (Z=0.0055m)，层次分明
    this.cogMarkerGroup.position.set(cg.x, cg.y, 0.0055);

    // 1. 金色外环
    const ringGeo = new THREE.RingGeometry(0.009, 0.013, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15, // 明亮黄金
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.renderOrder = 100;
    this.cogMarkerGroup.add(ringMesh);

    // 2. 核心红点靶心
    const dotGeo = new THREE.CircleGeometry(0.0035, 24);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    dotMesh.renderOrder = 100;
    this.cogMarkerGroup.add(dotMesh);

    // 3. 十字准心线
    const crossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.016, 0, 0.0005),
      new THREE.Vector3(0.016, 0, 0.0005),
      new THREE.Vector3(0, -0.016, 0.0005),
      new THREE.Vector3(0, 0.016, 0.0005),
    ]);
    const crossMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      linewidth: 2.5,
      depthTest: true,
      depthWrite: false,
    });
    const crossLine = new THREE.LineSegments(crossGeo, crossMat);
    crossLine.renderOrder = 100;
    this.cogMarkerGroup.add(crossLine);

    this.cogMarkerGroup.userData = { isCogMarker: true };
    this.cogMarkerGroup.renderOrder = 100;
    this.plateMesh.add(this.cogMarkerGroup);
  }

  /**
   * 清除绘制的红线
   */
  public clearDrawnLines(): void {
    for (const lineObj of this.lineObjects) {
      this.plateMesh.remove(lineObj);
      disposeObjectTree(lineObj);
    }
    this.lineObjects = [];
  }

  /**
   * 清除重心标记
   */
  public clearCogMarker(): void {
    if (this.cogMarkerGroup) {
      this.plateMesh.remove(this.cogMarkerGroup);
      disposeObjectTree(this.cogMarkerGroup);
      this.cogMarkerGroup = null;
    }
  }

  /**
   * 动画更新
   */
  public update(delta: number, elapsed: number): void {
    if (this.isDrawingLine && this.lineObjects.length > 0) {
      this.drawingProgress += delta * 2.8;
      const lastLine = this.lineObjects[this.lineObjects.length - 1];
      if (this.drawingProgress >= 1.0) {
        this.drawingProgress = 1.0;
        this.isDrawingLine = false;
        lastLine.scale.set(1, 1, 1);
      } else {
        lastLine.scale.set(Math.max(0.01, this.drawingProgress), 1, 1);
      }
    }

    if (this.cogMarkerGroup) {
      const pulse = 1.0 + Math.sin(elapsed * 4.0) * 0.08;
      this.cogMarkerGroup.scale.set(pulse, pulse, 1);
    }
  }

  /**
   * 深度释放 GPU 资源
   */
  public dispose(): void {
    this.clearDrawnLines();
    this.clearCogMarker();
    disposeObjectTree(this.group);
  }
}
