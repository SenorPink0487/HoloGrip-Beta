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

  // 孔位组件引用 (便于射线检测与高亮)
  public holeHitMeshes: THREE.Mesh[] = [];
  private holeGrommets: THREE.Mesh[] = [];
  private holeSprites: THREE.Sprite[] = [];

  // 已绘制的红线与重心标靶 (作为 plateMesh 的子节点，保证随板同步运动与旋转)
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
    this.holeSprites = [];

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

    // 2. 挤出 3D 实体 (厚度 4mm，带精致倒角)
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.004,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.0012,
      bevelThickness: 0.0012,
    };
    const plateGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // 居中 Z 轴厚度
    plateGeo.translate(0, 0, -0.002);

    // 纯透/半透微磨砂丙烯酸亚克力塑料物理材质
    this.plateMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.80,
      transmission: 0.55,
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      reflectivity: 0.85,
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
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.7,
      linewidth: 1.2,
    });
    this.plateEdgesLine = new THREE.LineSegments(edgesGeo, edgesMat);
    this.plateMesh.add(this.plateEdgesLine);

    // 3. 构建孔位的金属扣环与交互检测碰撞体
    for (const hole of this.plateDef.holes) {
      this.createHoleAssembly(hole);
    }
  }

  /**
   * 为小孔创建金属护圈、文字标牌和拾取碰撞体
   */
  private createHoleAssembly(hole: PlateHoleDef): void {
    const grommetGeo = new THREE.TorusGeometry(hole.radius + 0.0015, 0.0012, 12, 24);
    const grommetMat = mechMetal(0xf59e0b, 0.85, 0.2); // 黄铜金属加固扣环
    const grommet = new THREE.Mesh(grommetGeo, grommetMat);
    grommet.position.set(hole.x, hole.y, 0.0022);
    this.plateMesh.add(grommet);
    this.holeGrommets.push(grommet);

    // 交互点击/悬停检测用透明圆柱 (略大于孔半径，方便精准拾取)
    const hitGeo = new THREE.CylinderGeometry(hole.radius * 2.6, hole.radius * 2.6, 0.02, 16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.rotation.x = Math.PI / 2;
    hitMesh.position.set(hole.x, hole.y, 0);
    hitMesh.name = `plate-hole-${hole.id}`;
    hitMesh.userData = { isHole: true, holeId: hole.id, holeLabel: hole.label };
    this.plateMesh.add(hitMesh);
    this.holeHitMeshes.push(hitMesh);

    // 高清晰度孔位标牌 Sprite ("A", "B", "C", "D")
    const sprite = this.createHoleLabelSprite(hole.label);
    sprite.position.set(hole.x, hole.y + hole.radius + 0.016, 0.004);
    sprite.scale.set(0.026, 0.026, 1);
    this.plateMesh.add(sprite);
    this.holeSprites.push(sprite);
  }

  /**
   * 创建孔位圆底标牌纹理精灵
   */
  private createHoleLabelSprite(label: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // 绘制圆角胶囊底衬
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();

    // 边框高光
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.stroke();

    // 文字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 66);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.raycast = () => {};
    return sprite;
  }

  /**
   * 设置指定孔的悬停高亮状态
   */
  public setHoleHovered(holeId: string | null): void {
    this.plateDef.holes.forEach((hole, idx) => {
      const grommet = this.holeGrommets[idx];
      const sprite = this.holeSprites[idx];
      if (hole.id === holeId) {
        (grommet.material as THREE.MeshStandardMaterial).color.setHex(0x22c55e); // 高亮绿
        grommet.scale.setScalar(1.35);
        sprite.scale.set(0.034, 0.034, 1);
      } else {
        (grommet.material as THREE.MeshStandardMaterial).color.setHex(0xf59e0b); // 正常黄铜
        grommet.scale.setScalar(1.0);
        sprite.scale.set(0.026, 0.026, 1);
      }
    });
  }

  /**
   * 在薄板局部坐标系下绘制一条鲜明的红色铅垂线
   * 该红线直接挂接在 plateMesh 下，随着薄板自由旋转、移动！
   */
  public addMarkedLine(line: Line2D, lineIndex: number, animated = true): void {
    const lineGroup = new THREE.Group();
    lineGroup.name = `marked-line-${line.holeId}`;

    // 沿方向延长贯穿整个板 (前后各延伸 0.25m)
    const lenBackward = 0.03;
    const lenForward = 0.24;

    const pStart = new THREE.Vector3(
      line.origin.x - line.direction.x * lenBackward,
      line.origin.y - line.direction.y * lenBackward,
      0.0028 // 紧贴薄板表面
    );
    const pEnd = new THREE.Vector3(
      line.origin.x + line.direction.x * lenForward,
      line.origin.y + line.direction.y * lenForward,
      0.0028
    );

    // 1. 核心鲜红铅垂主线
    const lineGeo = new THREE.BufferGeometry().setFromPoints([pStart, pEnd]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xef4444, // 鲜艳警示红
      linewidth: 2.5,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    });
    const mainLine = new THREE.Line(lineGeo, lineMat);
    lineGroup.add(mainLine);

    // 2. 微弱自发光红色光晕缎带 (增强 3D 视觉醒目度与实物描线质感)
    const ribbonDir = new THREE.Vector2(line.direction.x, line.direction.y).normalize();
    const ribbonNormal = new THREE.Vector2(-ribbonDir.y, ribbonDir.x).multiplyScalar(0.0016);

    const ribbonGeo = new THREE.BufferGeometry();
    const ribbonVertices = new Float32Array([
      pStart.x + ribbonNormal.x, pStart.y + ribbonNormal.y, pStart.z,
      pStart.x - ribbonNormal.x, pStart.y - ribbonNormal.y, pStart.z,
      pEnd.x + ribbonNormal.x, pEnd.y + ribbonNormal.y, pEnd.z,

      pStart.x - ribbonNormal.x, pStart.y - ribbonNormal.y, pStart.z,
      pEnd.x - ribbonNormal.x, pEnd.y - ribbonNormal.y, pEnd.z,
      pEnd.x + ribbonNormal.x, pEnd.y + ribbonNormal.y, pEnd.z,
    ]);
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonVertices, 3));
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0xff0033,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    lineGroup.add(ribbonMesh);

    // 3. 悬挂基准线标签 ("① 铅垂线 (A)")
    const labelSprite = this.createLineLabelSprite(`线 ${lineIndex + 1} (${line.holeLabel})`);
    const labelPos = new THREE.Vector3(
      line.origin.x + line.direction.x * 0.14 + ribbonNormal.x * 4,
      line.origin.y + line.direction.y * 0.14 + ribbonNormal.y * 4,
      0.005
    );
    labelSprite.position.copy(labelPos);
    labelSprite.scale.set(0.038, 0.019, 1);
    lineGroup.add(labelSprite);

    if (animated) {
      this.isDrawingLine = true;
      this.drawingProgress = 0;
      lineGroup.scale.set(1, 0.01, 1);
    } else {
      lineGroup.scale.set(1, 1, 1);
    }

    this.plateMesh.add(lineGroup);
    this.lineObjects.push(lineGroup);
  }

  /**
   * 生成线条文字标牌精灵
   */
  private createLineLabelSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    // 红色半透明胶囊边框底衬
    ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 80, 20);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 48);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.raycast = () => {};
    return sprite;
  }

  /**
   * 显示重心测定标靶 (双线交点处)
   */
  public showCenterOfGravityMarker(cg: { x: number; y: number }): void {
    this.clearCogMarker();

    this.cogMarkerGroup = new THREE.Group();
    this.cogMarkerGroup.name = 'center-of-gravity-marker';
    this.cogMarkerGroup.position.set(cg.x, cg.y, 0.0035);

    // 1. 金色外环
    const ringGeo = new THREE.RingGeometry(0.008, 0.011, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15, // 明亮黄金
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.cogMarkerGroup.add(ringMesh);

    // 2. 核心红点靶心
    const dotGeo = new THREE.CircleGeometry(0.0032, 24);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
    });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    this.cogMarkerGroup.add(dotMesh);

    // 3. 十字准心线
    const crossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.015, 0, 0.001),
      new THREE.Vector3(0.015, 0, 0.001),
      new THREE.Vector3(0, -0.015, 0.001),
      new THREE.Vector3(0, 0.015, 0.001),
    ]);
    const crossMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      linewidth: 2,
    });
    const crossLine = new THREE.LineSegments(crossGeo, crossMat);
    this.cogMarkerGroup.add(crossLine);

    // 4. 重心文字标签精灵 ("重心 G")
    const labelSprite = this.createCogLabelSprite();
    labelSprite.position.set(0, 0.024, 0.004);
    labelSprite.scale.set(0.052, 0.026, 1);
    this.cogMarkerGroup.add(labelSprite);

    this.plateMesh.add(this.cogMarkerGroup);
  }

  /**
   * 生成重心专用高光文字精灵
   */
  private createCogLabelSprite(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 110;
    const ctx = canvas.getContext('2d')!;

    // 尊贵金色圆角胶囊
    ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
    ctx.beginPath();
    ctx.roundRect(6, 6, 244, 98, 24);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('重心 G (CG)', 128, 55);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.raycast = () => {};
    return sprite;
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
   * 动画更新 (画线展开动画与重心脉冲)
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
        lastLine.scale.set(1, Math.max(0.01, this.drawingProgress), 1);
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
