import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { disposeObjectTree } from './disposeObject.ts';
import { labGlow } from './labKit.ts';
import {
  DEFAULT_CHARGE_ELEVATION,
  type ElectrostaticTelemetry,
  type FieldLine,
  type PointCharge,
  type TestChargeState,
} from '../../physics/em/electrostatic.ts';
import type { EquipotentialSurface, GaussianSurface } from '../../physics/em/fieldSurfaces.ts';

const INITIAL_MAX_SEGMENTS = 65536;
const DEFAULT_MAX_CONES = 1200;

// 与电荷精确匹配的基准颜色
export const CHARGE_POS_COLOR = { r: 1.0, g: 0.133, b: 0.267 }; // #ff2244 (发光珊瑚红)
export const CHARGE_NEG_COLOR = { r: 0.0, g: 0.533, b: 1.0 };   // #0088ff (发光科技蓝)
export const PROBE_COLOR = { r: 0.984, g: 0.749, b: 0.141 };     // #fbbf24 (金黄色试探电荷)

function sealOffPointer(object: THREE.Object3D): void {
  object.raycast = () => {};
}

function buildGraticulePositions(): Float32Array {
  const segments: number[] = [];
  const meridians = 12;
  const meridianSteps = 72;
  for (let meridian = 0; meridian < meridians; meridian++) {
    const lambda = (meridian / meridians) * Math.PI;
    const cosL = Math.cos(lambda);
    const sinL = Math.sin(lambda);
    for (let step = 0; step < meridianSteps; step++) {
      const a0 = (step / meridianSteps) * Math.PI * 2;
      const a1 = ((step + 1) / meridianSteps) * Math.PI * 2;
      segments.push(
        Math.cos(a0) * cosL, Math.sin(a0), Math.cos(a0) * sinL,
        Math.cos(a1) * cosL, Math.sin(a1), Math.cos(a1) * sinL,
      );
    }
  }

  const latitudes = [-62, -38, -16, 16, 38, 62];
  const latitudeSteps = 80;
  for (const degrees of latitudes) {
    const phi = (degrees * Math.PI) / 180;
    const y = Math.sin(phi);
    const ring = Math.cos(phi);
    for (let step = 0; step < latitudeSteps; step++) {
      const a0 = (step / latitudeSteps) * Math.PI * 2;
      const a1 = ((step + 1) / latitudeSteps) * Math.PI * 2;
      segments.push(
        ring * Math.cos(a0), y, ring * Math.sin(a0),
        ring * Math.cos(a1), y, ring * Math.sin(a1),
      );
    }
  }
  return Float32Array.from(segments);
}

export interface FieldBenchVisualState {
  charges: PointCharge[];
  lines: FieldLine[];
  telemetry: ElectrostaticTelemetry;
  selectedChargeId: string | null;
  showLines: boolean;
  showFlow?: boolean;
  testCharge?: TestChargeState | null;
  showGaussian?: boolean;
  showEquipotential?: boolean;
  gaussianSurfaces?: readonly GaussianSurface[];
  equipotentials?: readonly EquipotentialSurface[];
}

export class FieldBenchMesh {
  public readonly group = new THREE.Group();
  public readonly platform: THREE.Mesh;
  public readonly chargesGroup = new THREE.Group();
  public readonly linesGroup = new THREE.Group();
  public readonly gaussianGroup = new THREE.Group();
  public readonly equipotentialGroup = new THREE.Group();
  public readonly selectionRing: THREE.Mesh;

  // 活跃电荷映射表（公开以供高速拾取检测）
  public readonly chargeMeshes = new Map<string, THREE.Group>();

  // 可移动试探电荷探针（q₀）组
  public readonly testChargeGroup = new THREE.Group();
  private readonly probeCoreMat: THREE.MeshStandardMaterial;
  private readonly probeHaloMat: THREE.MeshBasicMaterial;
  private readonly probeArrowGroup = new THREE.Group();
  private readonly probeArrowShaft: THREE.Mesh;
  private readonly probeArrowTip: THREE.Mesh;

  // 电荷材质
  private readonly posCoreMat: THREE.MeshStandardMaterial;
  private readonly negCoreMat: THREE.MeshStandardMaterial;
  private readonly posHaloMat: THREE.MeshBasicMaterial;
  private readonly negHaloMat: THREE.MeshBasicMaterial;

  // 方向箭头圆锥
  private readonly arrowConeGeo: THREE.ConeGeometry;
  private readonly arrowConeMat: THREE.MeshBasicMaterial;
  private arrowConesMesh: THREE.InstancedMesh;

  // 高可见度宽电场线（LineSegments2 屏幕空间光带）
  private readonly lineGeo = new LineSegmentsGeometry();
  private readonly lineMat: LineMaterial;
  private readonly linesMesh: LineSegments2;
  private linePosArray = new Float32Array(INITIAL_MAX_SEGMENTS * 6);
  private lineColArray = new Float32Array(INITIAL_MAX_SEGMENTS * 6);

  private readonly gaussianUnits = new Map<string, THREE.Group>();
  private readonly graticuleGeo: LineSegmentsGeometry;
  private readonly graticuleMat: LineMaterial;
  private readonly gaussSphereGeo: THREE.SphereGeometry;
  private readonly gaussGlowGeo: THREE.SphereGeometry;
  private readonly equatorGeo: THREE.TorusGeometry;
  private readonly gaussPosMat: THREE.MeshPhysicalMaterial;
  private readonly gaussNegMat: THREE.MeshPhysicalMaterial;
  private readonly gaussGlowPos: THREE.MeshBasicMaterial;
  private readonly gaussGlowNeg: THREE.MeshBasicMaterial;
  private readonly equatorMat: THREE.MeshStandardMaterial;
  private readonly equipotentialMeshes: THREE.Mesh[] = [];
  private lastEquipotentials: readonly EquipotentialSurface[] | null = null;

  constructor() {
    this.group.name = 'FieldBench';

    // 高对比度自发光基础材质（消除漫反射暗沉感）
    this.posCoreMat = labGlow(0xff2244, 1.4);
    this.negCoreMat = labGlow(0x0088ff, 1.4);
    this.posHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff3b5c,
      transparent: true,
      opacity: 0.32,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.negHaloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.32,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // 箭头圆锥体（自发光、锐利展陈风格）
    this.arrowConeGeo = new THREE.ConeGeometry(0.006, 0.020, 12);
    this.arrowConeGeo.rotateX(Math.PI / 2);
    this.arrowConeMat = new THREE.MeshBasicMaterial({
      toneMapped: false,
    });
    this.arrowConesMesh = new THREE.InstancedMesh(this.arrowConeGeo, this.arrowConeMat, DEFAULT_MAX_CONES);
    this.arrowConesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowConesMesh.count = 0;

    // 1. 用于背景交互点击的透明电场平面（开阔的探索区域）
    const platMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.platform = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.6), platMat);
    this.platform.name = 'FieldPlatform';
    this.group.add(this.platform);

    // 2. 选中指示环（围绕当前选中电荷的柔和发光光晕）
    const ringGeo = new THREE.RingGeometry(0.038, 0.046, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.visible = false;
    this.selectionRing.position.z = 0.002;
    this.group.add(this.selectionRing);

    // 3. 高可见度宽电场线（LineSegments2 光带，屏幕宽度 3.2px）
    const width = typeof window !== 'undefined' ? window.innerWidth : 800;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;
    this.lineMat = new LineMaterial({
      linewidth: 3.2,
      vertexColors: true,
      alphaToCoverage: true,
      worldUnits: false,
      resolution: new THREE.Vector2(width, height),
    });
    this.linesMesh = new LineSegments2(this.lineGeo, this.lineMat);
    this.linesMesh.position.z = 0.0;
    this.linesGroup.add(this.linesMesh);
    this.linesGroup.add(this.arrowConesMesh);
    this.group.add(this.linesGroup);

    // 4. 源电荷容器组
    this.group.add(this.chargesGroup);

    // 5. 试探电荷探针（q₀）组件
    this.testChargeGroup.name = 'TestChargeProbe';
    this.probeCoreMat = labGlow(0xfbbf24, 1.5);
    this.probeHaloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const probeCore = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 24), this.probeCoreMat);
    probeCore.name = 'ProbeCore';
    this.testChargeGroup.add(probeCore);

    const probeHalo = new THREE.Mesh(new THREE.SphereGeometry(0.023, 20, 20), this.probeHaloMat);
    probeHalo.name = 'ProbeHalo';
    this.testChargeGroup.add(probeHalo);

    const probeRingGeo = new THREE.RingGeometry(0.026, 0.030, 32);
    const probeRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const probeRing = new THREE.Mesh(probeRingGeo, probeRingMat);
    probeRing.name = 'ProbeRing';
    this.testChargeGroup.add(probeRing);

    // 便于拖拽的无形拾取目标
    const probeHitGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const probeHitMat = new THREE.MeshBasicMaterial({ visible: false });
    const probeHit = new THREE.Mesh(probeHitGeo, probeHitMat);
    probeHit.name = 'ProbeHitTarget';
    this.testChargeGroup.add(probeHit);

    // 电场强度 E 的 3D 矢量指示箭头
    this.probeArrowGroup.name = 'ProbeArrowGroup';
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, toneMapped: false });
    const shaftGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 12);
    this.probeArrowShaft = new THREE.Mesh(shaftGeo, arrowMat);
    this.probeArrowShaft.name = 'Shaft';
    this.probeArrowGroup.add(this.probeArrowShaft);

    const tipGeo = new THREE.ConeGeometry(0.009, 0.024, 12);
    this.probeArrowTip = new THREE.Mesh(tipGeo, arrowMat);
    this.probeArrowTip.name = 'Tip';
    this.probeArrowGroup.add(this.probeArrowTip);

    this.testChargeGroup.add(this.probeArrowGroup);

    this.testChargeGroup.visible = false;
    this.group.add(this.testChargeGroup);

    // 6. 高斯面：光学玻璃球壳 + 经纬刻线 + 赤道金属大圆
    const widthPx = typeof window !== 'undefined' ? window.innerWidth : 800;
    const heightPx = typeof window !== 'undefined' ? window.innerHeight : 800;
    this.gaussSphereGeo = new THREE.SphereGeometry(1, 72, 48);
    this.gaussGlowGeo = new THREE.SphereGeometry(1, 40, 28);
    this.equatorGeo = new THREE.TorusGeometry(1, 0.026, 16, 96);
    this.gaussPosMat = new THREE.MeshPhysicalMaterial({
      color: 0xffe4ea,
      emissive: 0xff2244,
      emissiveIntensity: 0.16,
      roughness: 0.05,
      metalness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.gaussNegMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      emissive: 0x0284c7,
      emissiveIntensity: 0.16,
      roughness: 0.05,
      metalness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.gaussGlowPos = new THREE.MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.gaussGlowNeg = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.equatorMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.9,
      roughness: 0.22,
      emissive: 0xf8fafc,
      emissiveIntensity: 0.06,
    });
    this.graticuleGeo = new LineSegmentsGeometry();
    this.graticuleGeo.setPositions(buildGraticulePositions());
    this.graticuleMat = new LineMaterial({
      color: 0xf8fafc,
      linewidth: 1.45,
      transparent: true,
      opacity: 0.82,
      worldUnits: false,
      resolution: new THREE.Vector2(widthPx, heightPx),
    });
    this.gaussianGroup.name = 'GaussianSurfaces';
    this.gaussianGroup.visible = false;
    this.group.add(this.gaussianGroup);

    // 7. 等势面容器（网格在同步时按电势重建）
    this.equipotentialGroup.name = 'EquipotentialSurfaces';
    this.equipotentialGroup.visible = false;
    this.group.add(this.equipotentialGroup);
  }

  /**
   * 将可视化图元与当前物理仿真状态同步
   */
  public sync(state: FieldBenchVisualState): void {
    // 1. 同步源电荷网格
    this.syncCharges(state.charges, state.selectedChargeId);

    // 2. 更新选中指示环位置
    if (state.selectedChargeId) {
      const selected = state.charges.find((c) => c.id === state.selectedChargeId);
      if (selected) {
        this.selectionRing.visible = true;
        this.selectionRing.position.set(selected.x, selected.y, selected.z ?? DEFAULT_CHARGE_ELEVATION);
        const ringScale = 0.024 + 0.008 * Math.cbrt(Math.abs(selected.q));
        this.selectionRing.scale.set(ringScale / 0.038, ringScale / 0.038, 1);
      } else {
        this.selectionRing.visible = false;
      }
    } else {
      this.selectionRing.visible = false;
    }

    // 3. 同步电场线与方向箭头圆锥
    this.linesGroup.visible = state.showLines;
    this.arrowConesMesh.visible = state.showLines;
    if (state.showLines) {
      this.syncFieldLines(state.lines);
    }

    // 4. 同步试探电荷探针
    this.syncTestCharge(state.testCharge ?? null);

    // 5. 高斯面与等势面
    this.syncGaussian(state.gaussianSurfaces ?? [], Boolean(state.showGaussian));
    this.syncEquipotentials(state.equipotentials ?? [], Boolean(state.showEquipotential));
  }

  /**
   * 同步试探电荷探针位置、电场强度矢量箭头与 HUD 徽标
   */
  public syncTestCharge(probe: TestChargeState | null): void {
    if (!probe || !probe.visible) {
      this.testChargeGroup.visible = false;
      return;
    }

    this.testChargeGroup.visible = true;
    this.testChargeGroup.position.set(probe.x, probe.y, probe.z ?? DEFAULT_CHARGE_ELEVATION);

    // 更新沿 E 方向指向的 3D 矢量箭头
    const E = probe.fieldMagnitude;
    if (E > 1e-3) {
      const uX = probe.fieldVector.x / E;
      const uY = probe.fieldVector.y / E;
      const uZ = probe.fieldVector.z / E;
      const unitDir = new THREE.Vector3(uX, uY, uZ);
      this.probeArrowGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unitDir);

      const len = Math.max(0.06, Math.min(0.24, 0.05 + 0.16 * Math.sqrt(E / 5000)));
      const shaftLen = Math.max(0.02, len - 0.022);
      this.probeArrowShaft.scale.set(1, shaftLen, 1);
      this.probeArrowShaft.position.set(0, shaftLen * 0.5, 0);
      this.probeArrowTip.position.set(0, shaftLen + 0.011, 0);
      this.probeArrowGroup.visible = true;
    } else {
      this.probeArrowGroup.visible = false;
    }
  }

  /**
   * 推进电荷头部的轻柔悬浮呼吸动效（非粒子系统）
   */
  public updateFlow(_dt?: number, _lines?: readonly FieldLine[], elapsed = 0): void {
    this.update(elapsed);
  }

  public update(elapsed = 0): void {
    if (this.graticuleMat && typeof window !== 'undefined') {
      this.graticuleMat.resolution.set(window.innerWidth, window.innerHeight);
    }
    if (this.gaussianGroup.visible) {
      const pulse = 0.12 + 0.045 * Math.sin(elapsed * 1.6);
      this.gaussPosMat.emissiveIntensity = pulse;
      this.gaussNegMat.emissiveIntensity = pulse;
    }

    if (this.chargeMeshes.size > 0 && elapsed > 0) {
      for (const [id, group] of this.chargeMeshes.entries()) {
        const head = group.getObjectByName('Head');
        const baseZ = (group.userData?.baseZ as number) ?? DEFAULT_CHARGE_ELEVATION;
        const phase = (id.charCodeAt(id.length - 1) * 1.7) % (Math.PI * 2);
        const floatZ = baseZ + 0.0035 * Math.sin(elapsed * 2.2 + phase);

        if (head) {
          head.position.z = floatZ;
        }
      }
    }
  }

  private syncCharges(charges: PointCharge[], _selectedId: string | null): void {
    const activeIds = new Set<string>();

    for (const c of charges) {
      activeIds.add(c.id);
      let group = this.chargeMeshes.get(c.id);
      const isPos = c.q >= 0;
      const radius = 0.022 + 0.008 * Math.cbrt(Math.abs(c.q));
      const baseZ = c.z ?? DEFAULT_CHARGE_ELEVATION;

      if (!group) {
        group = new THREE.Group();
        group.name = `Charge_${c.id}`;
        group.userData = { chargeId: c.id, baseZ, radius };

        // 1. 简洁的悬浮头部（内核 + 光晕，无字母或符号）
        const head = new THREE.Group();
        head.name = 'Head';
        head.position.set(0, 0, baseZ);

        const core = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 28), isPos ? this.posCoreMat : this.negCoreMat);
        core.name = 'Core';
        head.add(core);

        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.36, 24, 24), isPos ? this.posHaloMat : this.negHaloMat);
        halo.name = 'Halo';
        head.add(halo);

        // 便于鼠标与触控交互的扩展无形拾取目标
        const hitGeo = new THREE.SphereGeometry(1.6, 12, 12);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitTarget = new THREE.Mesh(hitGeo, hitMat);
        hitTarget.name = 'HitTarget';
        head.add(hitTarget);

        group.add(head);
        this.chargesGroup.add(group);
        this.chargeMeshes.set(c.id, group);
      }

      // 更新实验台平面上的位置
      group.position.set(c.x, c.y, 0);
      group.userData.baseZ = baseZ;
      group.userData.radius = radius;

      // 更新电荷头部
      const head = group.getObjectByName('Head') as THREE.Group;
      if (head) {
        head.position.set(0, 0, baseZ);
        head.scale.set(radius, radius, radius);

        const core = head.getObjectByName('Core') as THREE.Mesh;
        const halo = head.getObjectByName('Halo') as THREE.Mesh;
        if (core) core.material = isPos ? this.posCoreMat : this.negCoreMat;
        if (halo) halo.material = isPos ? this.posHaloMat : this.negHaloMat;
      }
    }

    // 移除已删除的电荷
    for (const [id, mesh] of this.chargeMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.chargesGroup.remove(mesh);
        disposeObjectTree(mesh);
        this.chargeMeshes.delete(id);
      }
    }
  }

  private ensureLineCapacity(totalSegments: number): void {
    const requiredFloats = totalSegments * 6;
    if (this.linePosArray.length < requiredFloats) {
      const newCapacity = Math.max(requiredFloats, this.linePosArray.length * 2, INITIAL_MAX_SEGMENTS * 6);
      this.linePosArray = new Float32Array(newCapacity);
      this.lineColArray = new Float32Array(newCapacity);
    }
  }

  private ensureConeCapacity(neededCones: number): void {
    const currentMax = this.arrowConesMesh.instanceMatrix.count;
    if (currentMax >= neededCones) return;
    const newCap = Math.max(neededCones, currentMax * 2, DEFAULT_MAX_CONES);
    this.linesGroup.remove(this.arrowConesMesh);
    this.arrowConesMesh.dispose();
    this.arrowConesMesh = new THREE.InstancedMesh(this.arrowConeGeo, this.arrowConeMat, newCap);
    this.arrowConesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowConesMesh.count = 0;
    this.linesGroup.add(this.arrowConesMesh);
  }

  private syncFieldLines(lines: readonly FieldLine[]): void {
    if (typeof window !== 'undefined' && this.lineMat) {
      this.lineMat.resolution.set(window.innerWidth, window.innerHeight);
    }

    // 1. 计算所有有效电场线所需的总线段数
    let totalSegments = 0;
    for (let l = 0; l < lines.length; l++) {
      const len = lines[l].points.length;
      if (len >= 2) {
        totalSegments += len - 1;
      }
    }

    // 2. 确保动态缓冲区容量充足，防止电场线被意外截断
    this.ensureLineCapacity(totalSegments);

    let segCount = 0;
    const pos = this.linePosArray;
    const col = this.lineColArray;
    const renderedLineIndices: number[] = [];

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      const pts = line.points;
      const len = pts.length;
      if (len < 2) continue;

      const isBridging = Boolean(line.sourceChargeId && line.targetChargeId);
      const isPosOnly = Boolean(line.sourceChargeId && !line.targetChargeId);
      const isNegOnly = Boolean(!line.sourceChargeId && line.targetChargeId);

      for (let i = 0; i < len - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const idx = segCount * 6;

        pos[idx] = p0.x;
        pos[idx + 1] = p0.y;
        pos[idx + 2] = p0.z;

        pos[idx + 3] = p1.x;
        pos[idx + 4] = p1.y;
        pos[idx + 5] = p1.z;

        // 电场线颜色与源/汇电荷颜色严格对应
        const t0 = i / (len - 1);
        const t1 = (i + 1) / (len - 1);

        this.setSegmentColor(col, idx, t0, isBridging, isPosOnly, isNegOnly);
        this.setSegmentColor(col, idx + 3, t1, isBridging, isPosOnly, isNegOnly);

        segCount++;
      }
      renderedLineIndices.push(l);
    }

    if (segCount > 0) {
      this.lineGeo.setPositions(this.linePosArray.subarray(0, segCount * 6));
      this.lineGeo.setColors(this.lineColArray.subarray(0, segCount * 6));
      this.linesMesh.visible = true;
    } else {
      this.lineGeo.setPositions([]);
      this.linesMesh.visible = false;
    }

    // 更新方向箭头圆锥（严格按照展陈级间距排布）
    // 仅在实际渲染出的电场线上放置箭头圆锥
    const maxNeededCones = renderedLineIndices.length * 2;
    this.ensureConeCapacity(maxNeededCones);

    let coneCount = 0;
    const maxCones = this.arrowConesMesh.instanceMatrix.count;
    const dummy = new THREE.Object3D();
    const unitZ = new THREE.Vector3(0, 0, 1);
    const tangent = new THREE.Vector3();
    const coneColor = new THREE.Color();

    for (let i = 0; i < renderedLineIndices.length; i++) {
      const l = renderedLineIndices[i];
      const line = lines[l];
      const pts = line.points;
      const len = pts.length;
      if (len < 12) continue; // 跳过靠近电荷内核极短的线段片段

      const isBridging = Boolean(line.sourceChargeId && line.targetChargeId);
      const isPosOnly = Boolean(line.sourceChargeId && !line.targetChargeId);
      const isNegOnly = Boolean(!line.sourceChargeId && line.targetChargeId);
      const sampleIndices: number[] = [];

      if (isBridging) {
        if (len < 26) {
          sampleIndices.push(Math.floor(len * 0.50));
        } else {
          sampleIndices.push(Math.floor(len * 0.35));
          sampleIndices.push(Math.floor(len * 0.68));
        }
      } else {
        // 延伸至无穷远或来自无穷远的电场线：在飞行中段放置单个清晰箭头
        sampleIndices.push(Math.floor(len * 0.48));
      }

      for (const idx of sampleIndices) {
        if (coneCount >= maxCones) break;
        if (idx <= 0 || idx >= len - 1) continue;

        const pPrev = pts[idx - 1];
        const pCurr = pts[idx];
        const pNext = pts[idx + 1];

        tangent.set(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);
        if (tangent.lengthSq() < 1e-6) continue;
        tangent.normalize();

        dummy.position.set(pCurr.x, pCurr.y, pCurr.z);
        dummy.quaternion.setFromUnitVectors(unitZ, tangent);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();

        this.arrowConesMesh.setMatrixAt(coneCount, dummy.matrix);

        // 箭头圆锥颜色与流线该处颜色严格一致
        const t = idx / (len - 1);
        this.getSampleColor(t, isBridging, isPosOnly, isNegOnly, coneColor);
        this.arrowConesMesh.setColorAt(coneCount, coneColor);

        coneCount++;
      }
      if (coneCount >= maxCones) break;
    }

    this.arrowConesMesh.count = coneCount;
    this.arrowConesMesh.instanceMatrix.needsUpdate = true;
    if (this.arrowConesMesh.instanceColor) {
      this.arrowConesMesh.instanceColor.needsUpdate = true;
    }
  }

  private setSegmentColor(
    targetArray: Float32Array,
    offset: number,
    t: number,
    isBridging: boolean,
    isPosOnly: boolean,
    _isNegOnly: boolean,
  ): void {
    if (isPosOnly) {
      targetArray[offset] = CHARGE_POS_COLOR.r;
      targetArray[offset + 1] = CHARGE_POS_COLOR.g;
      targetArray[offset + 2] = CHARGE_POS_COLOR.b;
    } else if (isBridging) {
      targetArray[offset] = CHARGE_POS_COLOR.r + (CHARGE_NEG_COLOR.r - CHARGE_POS_COLOR.r) * t;
      targetArray[offset + 1] = CHARGE_POS_COLOR.g + (CHARGE_NEG_COLOR.g - CHARGE_POS_COLOR.g) * t;
      targetArray[offset + 2] = CHARGE_POS_COLOR.b + (CHARGE_NEG_COLOR.b - CHARGE_POS_COLOR.b) * t;
    } else {
      targetArray[offset] = CHARGE_NEG_COLOR.r;
      targetArray[offset + 1] = CHARGE_NEG_COLOR.g;
      targetArray[offset + 2] = CHARGE_NEG_COLOR.b;
    }
  }

  private getSampleColor(
    t: number,
    isBridging: boolean,
    isPosOnly: boolean,
    _isNegOnly: boolean,
    outColor: THREE.Color,
  ): void {
    if (isPosOnly) {
      outColor.setRGB(CHARGE_POS_COLOR.r, CHARGE_POS_COLOR.g, CHARGE_POS_COLOR.b);
    } else if (isBridging) {
      outColor.setRGB(
        CHARGE_POS_COLOR.r + (CHARGE_NEG_COLOR.r - CHARGE_POS_COLOR.r) * t,
        CHARGE_POS_COLOR.g + (CHARGE_NEG_COLOR.g - CHARGE_POS_COLOR.g) * t,
        CHARGE_POS_COLOR.b + (CHARGE_NEG_COLOR.b - CHARGE_POS_COLOR.b) * t,
      );
    } else {
      outColor.setRGB(CHARGE_NEG_COLOR.r, CHARGE_NEG_COLOR.g, CHARGE_NEG_COLOR.b);
    }
  }

  private syncGaussian(surfaces: readonly GaussianSurface[], show: boolean): void {
    const active = new Set<string>();
    for (const surface of surfaces) {
      active.add(surface.chargeId);
      const positive = surface.enclosedChargeMicroC >= 0;
      const unit = this.ensureGaussianUnit(surface.chargeId);
      unit.position.set(surface.center.x, surface.center.y, surface.center.z);
      unit.scale.setScalar(surface.radius);
      unit.visible = true;
      const shell = unit.getObjectByName('Shell') as THREE.Mesh | null;
      const glow = unit.getObjectByName('Glow') as THREE.Mesh | null;
      if (shell) shell.material = positive ? this.gaussPosMat : this.gaussNegMat;
      if (glow) glow.material = positive ? this.gaussGlowPos : this.gaussGlowNeg;
    }

    for (const [id, unit] of this.gaussianUnits) {
      if (active.has(id)) continue;
      this.gaussianGroup.remove(unit);
      this.gaussianUnits.delete(id);
    }

    this.gaussianGroup.visible = show && this.gaussianUnits.size > 0;
  }

  private ensureGaussianUnit(id: string): THREE.Group {
    const existing = this.gaussianUnits.get(id);
    if (existing) return existing;

    const unit = new THREE.Group();
    unit.name = `Gaussian_${id}`;
    unit.frustumCulled = false;

    const shell = new THREE.Mesh(this.gaussSphereGeo, this.gaussPosMat);
    shell.name = 'Shell';
    shell.renderOrder = 3;
    sealOffPointer(shell);
    unit.add(shell);

    const glow = new THREE.Mesh(this.gaussGlowGeo, this.gaussGlowPos);
    glow.name = 'Glow';
    glow.scale.setScalar(1.02);
    glow.renderOrder = 2;
    sealOffPointer(glow);
    unit.add(glow);

    const graticule = new LineSegments2(this.graticuleGeo, this.graticuleMat);
    graticule.name = 'Graticule';
    graticule.scale.setScalar(0.992);
    graticule.frustumCulled = false;
    graticule.renderOrder = 4;
    sealOffPointer(graticule);
    unit.add(graticule);

    const equator = new THREE.Mesh(this.equatorGeo, this.equatorMat);
    equator.name = 'Equator';
    equator.renderOrder = 5;
    sealOffPointer(equator);
    unit.add(equator);

    this.gaussianGroup.add(unit);
    this.gaussianUnits.set(id, unit);
    return unit;
  }

  private syncEquipotentials(surfaces: readonly EquipotentialSurface[], show: boolean): void {
    if (surfaces !== this.lastEquipotentials) {
      this.lastEquipotentials = surfaces;
      this.rebuildEquipotentialMeshes(surfaces);
    }
    this.equipotentialGroup.visible = show && this.equipotentialMeshes.length > 0;
  }

  private rebuildEquipotentialMeshes(surfaces: readonly EquipotentialSurface[]): void {
    for (const mesh of this.equipotentialMeshes) {
      this.equipotentialGroup.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
    this.equipotentialMeshes.length = 0;

    surfaces.forEach((surface, index) => {
      if (surface.positions.length < 9) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(surface.normals, 3));
      const mesh = new THREE.Mesh(geometry, equipotentialMaterial(surface.potential, index));
      mesh.name = `Equipotential_${index}`;
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      sealOffPointer(mesh);
      this.equipotentialGroup.add(mesh);
      this.equipotentialMeshes.push(mesh);
    });
  }

  public dispose(): void {
    disposeObjectTree(this.group);
    this.lineGeo.dispose();
    this.lineMat.dispose();
    this.arrowConeGeo.dispose();
    this.arrowConeMat.dispose();
    this.arrowConesMesh.dispose();
    this.posHaloMat.dispose();
    this.negHaloMat.dispose();
    this.probeCoreMat.dispose();
    this.probeHaloMat.dispose();
    this.graticuleGeo.dispose();
    this.graticuleMat.dispose();
    this.gaussSphereGeo.dispose();
    this.gaussGlowGeo.dispose();
    this.equatorGeo.dispose();
    this.gaussPosMat.dispose();
    this.gaussNegMat.dispose();
    this.gaussGlowPos.dispose();
    this.gaussGlowNeg.dispose();
    this.equatorMat.dispose();
    for (const mesh of this.equipotentialMeshes) {
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
    this.equipotentialMeshes.length = 0;
    this.chargesGroup.clear();
    this.chargeMeshes.clear();
    this.gaussianUnits.clear();
  }
}

function equipotentialMaterial(potential: number, _index: number): THREE.MeshStandardMaterial {
  const isZero = Math.abs(potential) < 1;
  const positive = potential > 0;
  const color = isZero ? 0xf8fafc : positive ? 0xfb7185 : 0x38bdf8;
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: isZero ? 0.18 : 0.55,
    roughness: 0.22,
    metalness: 0.02,
    transparent: true,
    opacity: isZero ? 0.14 : 0.32,
    side: isZero ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}
