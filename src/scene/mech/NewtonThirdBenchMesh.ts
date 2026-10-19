/**
 * 3D 牛顿第三定律实验模型 (Newton's Third Law Precision Laboratory Setup)
 *
 * 【设计规范与用户定制要求遵从】：
 * 1. 颜色鲜明对比 (High Color Contrast)：
 *    - 1 号独立测力计 (SoloDynamometer)：经典实验室孔雀青绿 (0x0d8275)，竖直悬浮于左侧空中；
 *    - 2 号互拉测力计 A (DynamometerA)：湛蓝/深空海蓝 (0x0284c7)，标尺顶端印有蓝色粗体 "A"，水平朝右；
 *    - 3 号互拉测力计 B (DynamometerB)：高能珊瑚绯红 (0xe11d48)，标尺顶端印有红色粗体 "B"，水平朝左；
 *    - 经典红蓝互拉配色，使学生一眼辨析出“物体 A 对物体 B 的作用力”与“物体 B 对物体 A 的反作用力”。
 * 2. 悬浮在空中 (Hovering Mid-Air)：
 *    - 三只测力计整体悬浮于全息台面上方空中 (中心高度 Y = 0.22m)，视界开阔、高雅空灵，杜绝台面粘连与穿模。
 * 3. 原生空间力示数 (Side Force Readouts Without Cards)：
 *    - 示数直接呈现在各测力计边侧 (例如 F_A=2.50N, F_B=2.50N, F=1.20N)；
 *    - 严格采用纯透明背景的 3D 原生空间字体，带柔和文字发光阴影；
 *    - 坚决不做任何背景卡片、边框、底色矩形或 DOM 浮层，确保视觉纯粹通透。
 */

import * as THREE from 'three';
import { SpringDynamometerMesh } from './SpringDynamometerMesh.ts';
import { disposeObjectTree } from './mechKit.ts';
import type { TelemetryPoint } from '../../physics/mech/newtonThirdDynamics.ts';

export interface BenchButtonDef {
  id: string;
  label: string;
  mesh: THREE.Mesh;
  baseMesh: THREE.Mesh;
  localPos: THREE.Vector3;
  targetForce?: number;
  action?: 'oscillation' | 'reset' | 'preset';
}

interface SpatialForceReadout {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  prefix: string;
  textColor: string;
  lastText: string;
}

export class NewtonThirdBenchMesh {
  public readonly group = new THREE.Group();

  // 1. 三只高对比度弹簧测力计
  public readonly soloDynamometer: SpringDynamometerMesh;  // 独立测力计 (青绿)
  public readonly dynamometerA: SpringDynamometerMesh;     // 互拉测力计 A (深海湛蓝)
  public readonly dynamometerB: SpringDynamometerMesh;     // 互拉测力计 B (珊瑚绯红)

  // 2. 原生三维浮空力值示数 (无卡片矩形、纯粹发光数字)
  private readonly labelSolo: SpatialForceReadout;
  private readonly labelA: SpatialForceReadout;
  private readonly labelB: SpatialForceReadout;

  // 保持空数组兼容外部检查
  public readonly benchButtons: BenchButtonDef[] = [];
  public readonly weightMeshes: THREE.Mesh[] = [];

  // 悬浮几何定位常量 (均悬浮于空中 Y = 0.22m 处)
  public readonly hoverHeightY = 0.22;
  private readonly soloBaseX = -0.38;
  private readonly pairAnchorBaseX = -0.16;
  private readonly pairRightBaseX = 0.16;

  constructor() {
    this.group.name = 'NewtonThirdBenchMesh';

    // 1. 实例化三只弹簧测力计 (颜色具有极高对比度，清晰辨识两两相互作用)
    this.soloDynamometer = new SpringDynamometerMesh({
      label: 'SoloDynamometer',
      casingColor: 0x0d8275, // 孔雀青绿
    });

    this.dynamometerA = new SpringDynamometerMesh({
      label: 'DynamometerA',
      casingColor: 0x0284c7, // 湛蓝海青 (物体 A)
      scaleSubLabel: 'A',
    });

    this.dynamometerB = new SpringDynamometerMesh({
      label: 'DynamometerB',
      casingColor: 0xe11d48, // 珊瑚绯红 (物体 B)
      scaleSubLabel: 'B',
    });

    // 2. 独立测力计布局：左侧坚直，悬浮在空中 Y = 0.22m
    this.soloDynamometer.group.position.set(this.soloBaseX, this.hoverHeightY, 0.0);
    this.soloDynamometer.group.rotation.set(0, 0, 0);
    this.group.add(this.soloDynamometer.group);

    // 3. 互拉测力计 A 布局：水平朝右，悬浮在空中 Y = 0.22m
    this.dynamometerA.group.position.set(this.pairAnchorBaseX, this.hoverHeightY, 0.0);
    this.dynamometerA.group.rotation.set(0, 0, -Math.PI / 2);
    this.group.add(this.dynamometerA.group);

    // 4. 互拉测力计 B 布局：水平朝左，悬浮在空中 Y = 0.22m，挂钩与 A 紧扣
    this.dynamometerB.group.position.set(this.pairRightBaseX, this.hoverHeightY, 0.0025);
    this.dynamometerB.group.rotation.set(0, 0, Math.PI / 2);
    this.group.add(this.dynamometerB.group);

    // 5. 创建边侧纯空间浮空力示数 (严禁任何卡片底色/背景框，纯纯发光文字)
    // 独立测力计示数：位于左表右侧旁
    this.labelSolo = this.createForceReadout('F', '#34d399');
    this.labelSolo.sprite.position.set(this.soloBaseX + 0.11, this.hoverHeightY, 0.01);
    this.group.add(this.labelSolo.sprite);

    // 测力计 A 示数：位于 A 表上方旁
    this.labelA = this.createForceReadout('F_A', '#38bdf8');
    this.labelA.sprite.position.set(this.pairAnchorBaseX, this.hoverHeightY + 0.075, 0.01);
    this.group.add(this.labelA.sprite);

    // 测力计 B 示数：位于 B 表上方旁 (随 B 表拉动实时平移跟随)
    this.labelB = this.createForceReadout('F_B', '#fb7185');
    this.labelB.sprite.position.set(this.pairRightBaseX, this.hoverHeightY + 0.075, 0.01);
    this.group.add(this.labelB.sprite);

    // 初始化初始力显示 (0.00 N)
    this.updateForceReadout(this.labelSolo, 0);
    this.updateForceReadout(this.labelA, 0);
    this.updateForceReadout(this.labelB, 0);
  }

  /**
   * 创建无卡片纯净空间力示数 Sprite
   */
  private createForceReadout(prefix: string, textColor: string): SpatialForceReadout {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // 保证在任何视角下均清晰无视差遮挡
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.14, 0.035, 1.0);
    sprite.raycast = () => {}; // 纯净非交互展示标签，免除 Raycaster 摄像机依赖并提升射线检测性能

    return {
      sprite,
      canvas,
      ctx,
      texture,
      prefix,
      textColor,
      lastText: '',
    };
  }

  /**
   * 刷新力示数文字 (仅在数值变化时重绘 Canvas，保持 120 FPS 极速渲染)
   * 严禁任何矩形卡片背景！100% 透明！
   */
  private updateForceReadout(readout: SpatialForceReadout, forceN: number): void {
    const text = `${readout.prefix} = ${forceN.toFixed(2)} N`;
    if (text === readout.lastText) return;
    readout.lastText = text;

    const ctx = readout.ctx;
    ctx.clearRect(0, 0, readout.canvas.width, readout.canvas.height);

    if (ctx.save) ctx.save();
    ctx.font = 'bold 64px "SF Pro Display", "JetBrains Mono", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 柔和暗色辉光外晕，确保在纯白台面或深色实验室中均具极佳反差度
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = readout.textColor;
    ctx.fillText(text, readout.canvas.width * 0.5, readout.canvas.height * 0.5);
    if (ctx.restore) ctx.restore();

    readout.texture.needsUpdate = true;
  }

  /**
   * 视觉主更新循环
   * 根据当前受力大小同步更新三只测力计的弹簧拉伸、读数游标、相扣秤钩与边侧空间力示数
   */
  public updateVisualState(
    soloForceN: number,
    pairForceN: number,
    _history?: TelemetryPoint[]
  ): void {
    // 1. 更新独立测力计
    this.soloDynamometer.setForce(soloForceN);
    this.updateForceReadout(this.labelSolo, soloForceN);

    // 2. 更新互扣测力计 A 与 B 的受力形变 (F_A ≡ F_B)
    this.dynamometerA.setForce(pairForceN);
    this.dynamometerB.setForce(pairForceN);
    this.updateForceReadout(this.labelA, pairForceN);
    this.updateForceReadout(this.labelB, pairForceN);

    // 3. 几何与力标签跟随连动：
    // 测力计 A 左端固定，秤钩向右伸长 \Delta x
    // 测力计 B 整体外壳向右移动 2 * \Delta x，示数标签跟随 B 表平移
    const dispM = this.dynamometerA.getDisplacement();
    const currentBX = this.pairRightBaseX + 2.0 * dispM;
    this.dynamometerB.group.position.x = currentBX;
    this.labelB.sprite.position.x = currentBX;
  }

  /**
   * 模拟按键动画兼容桩
   */
  public animateButtonPress(_btnId: string): void {}

  /**
   * 资源深度安全销毁
   */
  public dispose(): void {
    this.soloDynamometer.dispose();
    this.dynamometerA.dispose();
    this.dynamometerB.dispose();

    // 释放 3 处浮空示数资源
    this.labelSolo.texture.dispose();
    this.labelSolo.sprite.material.dispose();
    this.labelA.texture.dispose();
    this.labelA.sprite.material.dispose();
    this.labelB.texture.dispose();
    this.labelB.sprite.material.dispose();

    disposeObjectTree(this.group);
  }
}
