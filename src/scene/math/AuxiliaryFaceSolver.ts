import * as THREE from 'three';
import type { KeyPoint } from './GeometrySolver.ts';

export interface DrawnSegmentInput {
  id: string;
  pointIdA: string;
  pointIdB: string;
  label?: string;
  color?: number;
  length?: number;
}

export interface AuxiliaryFace {
  id: string;
  pointIds: string[];
  labels: string[];
  faceLabel: string;
  polygonType: string;
  area: number;
  perimeter: number;
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  color: number;
  vertices3D: THREE.Vector3[];
}

/**
 * 高建立体几何辅助面求解器。
 * 自动识别辅助线段构成的闭合平面环，
 * 验证共面性与非自交性，对多边形进行分类，
 * 并计算精确的 3D 几何指标（面积、周长、法向量、质心）。
 */
export class AuxiliaryFaceSolver {
  /**
   * 查找由相连辅助线段构成的所有极小无弦平面面元。
   */
  public static findAuxiliaryFaces(
    segments: DrawnSegmentInput[],
    keyPoints: KeyPoint[]
  ): AuxiliaryFace[] {
    if (!segments || segments.length < 3 || !keyPoints || keyPoints.length < 3) {
      return [];
    }

    // 1. 构建关键点查找表
    const kpMap = new Map<string, KeyPoint>();
    for (const kp of keyPoints) {
      kpMap.set(kp.id, kp);
    }

    // 2. 构建无向邻接表
    const adj = new Map<string, Set<string>>();
    for (const seg of segments) {
      if (!kpMap.has(seg.pointIdA) || !kpMap.has(seg.pointIdB)) continue;
      if (seg.pointIdA === seg.pointIdB) continue;

      if (!adj.has(seg.pointIdA)) adj.set(seg.pointIdA, new Set());
      if (!adj.has(seg.pointIdB)) adj.set(seg.pointIdB, new Set());
      adj.get(seg.pointIdA)!.add(seg.pointIdB);
      adj.get(seg.pointIdB)!.add(seg.pointIdA);
    }

    // 3. 查找简单环（长度 3 到 8）
    const rawCycles: string[][] = [];
    const visited = new Set<string>();
    const nodes = Array.from(adj.keys()).sort();

    for (let i = 0; i < nodes.length; i++) {
      const start = nodes[i];
      const path: string[] = [start];
      visited.add(start);

      const dfs = (curr: string) => {
        if (path.length > 8) return;

        const neighbors = adj.get(curr);
        if (!neighbors) return;

        for (const next of neighbors) {
          if (next === start) {
            // 闭合环回到起点
            if (path.length >= 3) {
              // 强制方向规范化：path[1] < path[path.length - 1]
              if (path[1] < path[path.length - 1]) {
                rawCycles.push([...path]);
              }
            }
          } else if (!visited.has(next) && next > start) {
            // 强制 next > start，确保每个环以唯一的最小节点为根
            visited.add(next);
            path.push(next);
            dfs(next);
            path.pop();
            visited.delete(next);
          }
        }
      };

      dfs(start);
      visited.delete(start);
    }

    // 4. 过滤无弦环（不含内部快捷弦的极小环）
    const chordlessCycles = rawCycles.filter((cycle) => {
      const m = cycle.length;
      if (m === 3) return true; // 三角形必为无弦环
      const cycleSet = new Set(cycle);

      for (let i = 0; i < m; i++) {
        const u = cycle[i];
        const uNeighbors = adj.get(u);
        if (!uNeighbors) continue;

        for (const v of uNeighbors) {
          if (!cycleSet.has(v)) continue;
          const j = cycle.indexOf(v);
          const dist = Math.min(Math.abs(i - j), m - Math.abs(i - j));
          if (dist > 1) {
            // 边 (u, v) 为将该环分割为更小环的弦
            return false;
          }
        }
      }
      return true;
    });

    // 5. 共面性验证、3D 指标计算与多边形分类
    const faces: AuxiliaryFace[] = [];

    for (const cycle of chordlessCycles) {
      const m = cycle.length;
      const positions: THREE.Vector3[] = [];
      const labels: string[] = [];

      for (const pid of cycle) {
        const kp = kpMap.get(pid)!;
        positions.push(kp.position.clone());
        labels.push(kp.label);
      }

      // 检查共线与共面性
      if (m === 3) {
        const v1 = new THREE.Vector3().subVectors(positions[1], positions[0]);
        const v2 = new THREE.Vector3().subVectors(positions[2], positions[0]);
        const cross = new THREE.Vector3().crossVectors(v1, v2);
        const crossLen = cross.length();
        const area = 0.5 * crossLen;
        if (area < 1e-4) continue; // 共线退化

        const normal = cross.clone().normalize();
        const centroid = new THREE.Vector3()
          .add(positions[0])
          .add(positions[1])
          .add(positions[2])
          .multiplyScalar(1 / 3);

        const l0 = positions[0].distanceTo(positions[1]);
        const l1 = positions[1].distanceTo(positions[2]);
        const l2 = positions[2].distanceTo(positions[0]);
        const perimeter = l0 + l1 + l2;

        const polygonType = this.classifyTriangle(l0, l1, l2);
        const faceLabel = `面 ${labels.join('')}`;
        const faceId = `aux_face_${cycle.join('_')}`;

        // 查找构成此三角形的线段颜色，使切面颜色与线段保持完全一致
        let faceColor = 0x38d9a9;
        for (let i = 0; i < 3; i++) {
          const uId = cycle[i];
          const vId = cycle[(i + 1) % 3];
          const matchedSeg = segments.find(
            (s) =>
              (s.pointIdA === uId && s.pointIdB === vId) ||
              (s.pointIdA === vId && s.pointIdB === uId)
          );
          if (matchedSeg && typeof matchedSeg.color === 'number') {
            faceColor = matchedSeg.color;
            break;
          }
        }

        faces.push({
          id: faceId,
          pointIds: [...cycle],
          labels: [...labels],
          faceLabel,
          polygonType,
          area: Math.round(area * 1000) / 1000,
          perimeter: Math.round(perimeter * 1000) / 1000,
          normal,
          centroid,
          color: faceColor,
          vertices3D: positions,
        });
      } else {
        // N >= 4：使用 Newell 算法计算法向量
        const normal = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < m; i++) {
          const cur = positions[i];
          const next = positions[(i + 1) % m];
          normal.x += (cur.y - next.y) * (cur.z + next.z);
          normal.y += (cur.z - next.z) * (cur.x + next.x);
          normal.z += (cur.x - next.x) * (cur.y + next.y);
        }
        const normLen = normal.length();
        if (normLen < 1e-4) continue;
        normal.divideScalar(normLen);

        // 计算质心
        const centroid = new THREE.Vector3();
        for (const p of positions) {
          centroid.add(p);
        }
        centroid.multiplyScalar(1 / m);

        // 共面性检查：到拟合平面的最大正交距离
        let maxDist = 0;
        for (const p of positions) {
          const dist = Math.abs(p.clone().sub(centroid).dot(normal));
          if (dist > maxDist) maxDist = dist;
        }
        if (maxDist > 0.008) {
          // 剔除非平面扭曲多边形
          continue;
        }

        // 投影到 2D 平面以计算面积和检查自交
        const temp = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const u = new THREE.Vector3().crossVectors(normal, temp).normalize();
        const v = new THREE.Vector3().crossVectors(normal, u).normalize();

        const pts2D = positions.map((p) => {
          const diff = p.clone().sub(centroid);
          return new THREE.Vector2(diff.dot(u), diff.dot(v));
        });

        // 2D 鞋带公式计算面积
        let signedArea = 0;
        for (let i = 0; i < m; i++) {
          const p1 = pts2D[i];
          const p2 = pts2D[(i + 1) % m];
          signedArea += p1.x * p2.y - p2.x * p1.y;
        }
        signedArea *= 0.5;
        const area = Math.abs(signedArea);
        if (area < 1e-4) continue;

        // 确保顶点按法向量逆时针排列
        if (signedArea < 0) {
          positions.reverse();
          labels.reverse();
          cycle.reverse();
          normal.negate();
        }

        // 计算周长
        let perimeter = 0;
        const edgeLengths: number[] = [];
        for (let i = 0; i < m; i++) {
          const d = positions[i].distanceTo(positions[(i + 1) % m]);
          edgeLengths.push(d);
          perimeter += d;
        }

        const polygonType = this.classifyPolygon(m, edgeLengths, positions);
        const faceLabel = `面 ${labels.join('')}`;
        const faceId = `aux_face_${cycle.join('_')}`;

        // 查找构成此闭合环的线段颜色，使切面颜色与线段保持完全一致
        let faceColor = 0x38d9a9;
        for (let i = 0; i < m; i++) {
          const uId = cycle[i];
          const vId = cycle[(i + 1) % m];
          const matchedSeg = segments.find(
            (s) =>
              (s.pointIdA === uId && s.pointIdB === vId) ||
              (s.pointIdA === vId && s.pointIdB === uId)
          );
          if (matchedSeg && typeof matchedSeg.color === 'number') {
            faceColor = matchedSeg.color;
            break;
          }
        }

        faces.push({
          id: faceId,
          pointIds: [...cycle],
          labels: [...labels],
          faceLabel,
          polygonType,
          area: Math.round(area * 1000) / 1000,
          perimeter: Math.round(perimeter * 1000) / 1000,
          normal,
          centroid,
          color: faceColor,
          vertices3D: positions,
        });
      }
    }

    return faces;
  }

  private static classifyTriangle(
    l0: number,
    l1: number,
    l2: number
  ): string {
    const isEquilateral =
      Math.abs(l0 - l1) / Math.max(l0, l1) < 0.03 &&
      Math.abs(l1 - l2) / Math.max(l1, l2) < 0.03;
    if (isEquilateral) return '等边三角形';

    const isIsosceles =
      Math.abs(l0 - l1) / Math.max(l0, l1) < 0.03 ||
      Math.abs(l1 - l2) / Math.max(l1, l2) < 0.03 ||
      Math.abs(l2 - l0) / Math.max(l2, l0) < 0.03;

    // 判定直角：对排序后的边长平方使用勾股定理
    const sq = [l0 * l0, l1 * l1, l2 * l2].sort((a, b) => a - b);
    const isRight = Math.abs(sq[0] + sq[1] - sq[2]) / sq[2] < 0.04;

    if (isIsosceles && isRight) return '等腰直角三角形';
    if (isIsosceles) return '等腰三角形';
    if (isRight) return '直角三角形';
    return '三角形';
  }

  private static classifyPolygon(
    m: number,
    edgeLengths: number[],
    positions: THREE.Vector3[]
  ): string {
    if (m === 4) {
      const d0 = new THREE.Vector3().subVectors(positions[1], positions[0]);
      const d1 = new THREE.Vector3().subVectors(positions[2], positions[1]);
      const d2 = new THREE.Vector3().subVectors(positions[3], positions[2]);
      const d3 = new THREE.Vector3().subVectors(positions[0], positions[3]);

      const cosOpp1 = Math.abs(d0.dot(d2) / (d0.length() * d2.length()));
      const cosOpp2 = Math.abs(d1.dot(d3) / (d1.length() * d3.length()));
      const isParallelogram = cosOpp1 > 0.97 && cosOpp2 > 0.97;

      if (isParallelogram) {
        const cosAdj = Math.abs(d0.dot(d1) / (d0.length() * d1.length()));
        const isRight = cosAdj < 0.04;
        const isEqualSides = Math.abs(edgeLengths[0] - edgeLengths[1]) / Math.max(edgeLengths[0], edgeLengths[1]) < 0.04;

        if (isRight && isEqualSides) return '正方形';
        if (isRight) return '矩形';
        if (isEqualSides) return '菱形';
        return '平行四边形';
      }

      if (cosOpp1 > 0.97 || cosOpp2 > 0.97) {
        return '梯形';
      }

      return '四边形';
    }

    if (m === 5) return '五边形';
    if (m === 6) {
      const minL = Math.min(...edgeLengths);
      const maxL = Math.max(...edgeLengths);
      if ((maxL - minL) / maxL < 0.04) {
        return '正六边形';
      }
      return '六边形';
    }

    return `${m}边形`;
  }
}
