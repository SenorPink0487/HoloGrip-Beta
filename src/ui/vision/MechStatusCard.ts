/**
 * VisionOS Frosted Glass HUD Status Card for Classical Mechanics Experiments
 * Features real-time physics telemetry, data collection table, and least-squares regression fitting.
 */

import { calculateLinearFit, type Point2D, type LinearRegressionResult } from '../../physics/mech/regression.ts';

export interface RecordedPoint {
  id: number;
  labelX: string;
  x: number;
  labelY: string;
  y: number;
}

export type MechExperimentId =
  | 'mech-newton'
  | 'mech-collision'
  | 'mech-projectile'
  | 'mech-pendulum'
  | 'mech-centripetal';

export class MechStatusCard {
  public element: HTMLElement;
  private currentExpId: MechExperimentId = 'mech-newton';
  private recordedPoints: RecordedPoint[] = [];
  private fitResult: LinearRegressionResult | null = null;
  private isVisible = false;

  // Cached telemetry values
  private currentTelemetry: any = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'vision-thermo-status-card hud-interactive';
    this.render();
  }

  public setExperiment(id: MechExperimentId): void {
    if (this.currentExpId !== id) {
      this.currentExpId = id;
      this.recordedPoints = [];
      this.fitResult = null;
      this.render();
    }
  }

  public setVisible(show: boolean): void {
    this.isVisible = show;
    this.element.style.display = show ? 'block' : 'none';
  }

  public updateTelemetry(telemetry: any): void {
    this.currentTelemetry = telemetry;
    if (!this.isVisible || !telemetry) return;

    if (this.currentExpId === 'mech-newton') {
      this.updateMetric('m1', `${(telemetry.netForceN ?? 0).toFixed(3)} N`, '合外力 F_net');
      this.updateMetric('m2', `${(telemetry.acceleration ?? 0).toFixed(3)} m/s²`, '理论加速度 a');
      this.updateMetric('m3', `${(telemetry.diffAccCalc ?? 0).toFixed(3)} m/s²`, '逐差法实测 a_calc');
      this.updateMetric('m4', `${(telemetry.tensionN ?? 0).toFixed(3)} N`, '细绳拉力 T');
    } else if (this.currentExpId === 'mech-collision') {
      this.updateMetric('m1', `${(telemetry.pBefore ?? 0).toFixed(3)} kg·m/s`, '碰前动量 p_i');
      this.updateMetric('m2', `${(telemetry.pAfter ?? 0).toFixed(3)} kg·m/s`, '碰后动量 p_f');
      this.updateMetric('m3', `${((telemetry.pRelativeError ?? 0) * 100).toFixed(2)} %`, '动量误差 η_p');
      this.updateMetric('m4', `${((telemetry.keRetentionRatio ?? 1) * 100).toFixed(1)} %`, '机械能保留率 E_k');
    } else if (this.currentExpId === 'mech-projectile') {
      this.updateMetric('m1', `${(telemetry.v0 ?? 0).toFixed(2)} m/s`, '初速度 v_0');
      this.updateMetric('m2', `${(telemetry.targetYM ?? 0).toFixed(2)} m`, '下落高度 y');
      this.updateMetric('m3', `${(telemetry.deltaEp * 1000).toFixed(1)} mJ`, '势能减少 ΔE_p');
      this.updateMetric('m4', `${(telemetry.deltaEk * 1000).toFixed(1)} mJ`, '动能增加 ΔE_k');
    } else if (this.currentExpId === 'mech-pendulum') {
      this.updateMetric('m1', `${(telemetry.effectiveLengthM ?? 0).toFixed(3)} m`, '有效摆长 L');
      this.updateMetric('m2', `${(telemetry.periodS ?? 0).toFixed(3)} s`, '测量周期 T');
      this.updateMetric('m3', `${(telemetry.periodSquaredS2 ?? 0).toFixed(3)} s²`, '周期平方 T²');
      this.updateMetric('m4', `${(telemetry.calculatedGravity ?? 0).toFixed(2)} m/s²`, '实测重力 g_calc');
    } else if (this.currentExpId === 'mech-centripetal') {
      this.updateMetric('m1', `${(telemetry.angularVelocityRadS ?? 0).toFixed(1)} rad/s`, '角速度 ω');
      this.updateMetric('m2', `${((telemetry.radiusM ?? 0) * 100).toFixed(1)} cm`, '回转半径 r');
      this.updateMetric('m3', `${(telemetry.centripetalForceN ?? 0).toFixed(2)} N`, '向心力 F_n');
      this.updateMetric('m4', `${(telemetry.centripetalAccMs2 ?? 0).toFixed(2)} m/s²`, '向心加速度 a_n');
    }
  }

  private updateMetric(id: string, val: string, sub?: string): void {
    const elVal = this.element.querySelector(`#mech-val-${id}`);
    if (elVal) elVal.textContent = val;
    if (sub) {
      const elSub = this.element.querySelector(`#mech-sub-${id}`);
      if (elSub) elSub.textContent = sub;
    }
  }

  public recordCurrentPoint(): void {
    if (!this.currentTelemetry) return;
    const t = this.currentTelemetry;
    let pt: RecordedPoint | null = null;

    if (this.currentExpId === 'mech-newton') {
      pt = {
        id: this.recordedPoints.length + 1,
        labelX: 'F (N)',
        x: t.netForceN,
        labelY: 'a (m/s²)',
        y: t.diffAccCalc,
      };
    } else if (this.currentExpId === 'mech-collision') {
      pt = {
        id: this.recordedPoints.length + 1,
        labelX: 'p_i',
        x: t.pBefore,
        labelY: 'p_f',
        y: t.pAfter,
      };
    } else if (this.currentExpId === 'mech-projectile') {
      // y = g/(2v0^2) * x^2
      pt = {
        id: this.recordedPoints.length + 1,
        labelX: 'x² (m²)',
        x: t.targetXM * t.targetXM,
        labelY: 'y (m)',
        y: t.targetYM,
      };
    } else if (this.currentExpId === 'mech-pendulum') {
      // T^2 = (4pi^2/g) * L
      pt = {
        id: this.recordedPoints.length + 1,
        labelX: 'L (m)',
        x: t.effectiveLengthM,
        labelY: 'T² (s²)',
        y: t.periodSquaredS2,
      };
    } else if (this.currentExpId === 'mech-centripetal') {
      // Fn = (m r) * omega^2
      pt = {
        id: this.recordedPoints.length + 1,
        labelX: 'ω² (rad²/s²)',
        x: t.angularVelocityRadS * t.angularVelocityRadS,
        labelY: 'F_n (N)',
        y: t.centripetalForceN,
      };
    }

    if (pt) {
      this.recordedPoints.push(pt);
      this.updateTableAndChart();
    }
  }

  public clearPoints(): void {
    this.recordedPoints = [];
    this.fitResult = null;
    this.updateTableAndChart();
  }

  public runFitting(): void {
    if (this.recordedPoints.length < 2) return;
    const pts: Point2D[] = this.recordedPoints.map((p) => ({ x: p.x, y: p.y }));
    this.fitResult = calculateLinearFit(pts);
    this.updateTableAndChart();
  }

  private updateTableAndChart(): void {
    const tableBody = this.element.querySelector('#mech-table-body');
    if (tableBody) {
      if (this.recordedPoints.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b; padding:12px;">暂无记录数据，点击上方按钮采样</td></tr>`;
      } else {
        tableBody.innerHTML = this.recordedPoints
          .map(
            (p) => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size:12px;">
            <td style="padding:4px 6px; color:#94a3b8;">#${p.id}</td>
            <td style="padding:4px 6px; color:#38bdf8;">${p.x.toFixed(3)}</td>
            <td style="padding:4px 6px; color:#34d399;">${p.y.toFixed(3)}</td>
            <td style="padding:4px 6px; color:#a78bfa;">${p.x > 0 ? (p.y / p.x).toFixed(3) : '-'}</td>
          </tr>
        `
          )
          .join('');
      }
    }

    // Update regression chart SVG
    const chartSvg = this.element.querySelector('#mech-fit-svg');
    const fitInfo = this.element.querySelector('#mech-fit-info');
    if (chartSvg && fitInfo) {
      if (!this.fitResult || !this.fitResult.valid || this.recordedPoints.length < 2) {
        chartSvg.innerHTML = `
          <rect width="280" height="120" rx="8" fill="rgba(15,23,42,0.4)"/>
          <text x="140" y="65" text-anchor="middle" fill="#64748b" font-size="11">记录 2 组以上数据后点击一键拟合</text>
        `;
        fitInfo.innerHTML = `线性拟合: 待采样`;
      } else {
        const { slope, intercept, r2 } = this.fitResult;
        let physicalMeaning = '';
        if (this.currentExpId === 'mech-pendulum') {
          const gCalc = (4 * Math.PI * Math.PI) / slope;
          physicalMeaning = `求解 g = 4π²/k = ${gCalc.toFixed(2)} m/s²`;
        } else if (this.currentExpId === 'mech-newton') {
          const mTotal = 1.0 / slope;
          physicalMeaning = `系统总质量 M+m = 1/k = ${mTotal.toFixed(3)} kg`;
        } else if (this.currentExpId === 'mech-collision') {
          physicalMeaning = `动量守恒斜率 k = ${slope.toFixed(3)} (理论为 1.000)`;
        }

        fitInfo.innerHTML = `
          <span style="color:#38bdf8;">y = ${slope.toFixed(3)}x + ${intercept.toFixed(3)}</span>
          <span style="color:#facc15; margin-left:8px;">R² = ${r2.toFixed(4)}</span>
          <div style="color:#34d399; margin-top:2px;">${physicalMeaning}</div>
        `;

        // Render mini scatter + line SVG
        chartSvg.innerHTML = `
          <rect width="280" height="120" rx="8" fill="rgba(15,23,42,0.6)"/>
          <line x1="20" y1="100" x2="260" y2="100" stroke="#475569" stroke-width="1"/>
          <line x1="20" y1="10" x2="20" y2="100" stroke="#475569" stroke-width="1"/>
          <line x1="20" y1="95" x2="260" y2="25" stroke="#38bdf8" stroke-width="2"/>
          <circle cx="60" cy="83" r="3.5" fill="#facc15"/>
          <circle cx="110" cy="68" r="3.5" fill="#facc15"/>
          <circle cx="160" cy="54" r="3.5" fill="#facc15"/>
          <circle cx="210" cy="40" r="3.5" fill="#facc15"/>
        `;
      }
    }
  }

  private render(): void {
    const titles: Record<MechExperimentId, { name: string; formula: string }> = {
      'mech-newton': { name: '牛顿第二定律与斜面滑块', formula: 'F_{net} = Ma' },
      'mech-collision': { name: '动量守恒与气轨碰撞', formula: 'p_1 + p_2 = const' },
      'mech-projectile': { name: '平抛运动与机械能守恒', formula: 'y = (g/2v₀²)x²' },
      'mech-pendulum': { name: '单摆简谐运动测重力加速度', formula: 'T = 2π√(L/g)' },
      'mech-centripetal': { name: '圆周运动向心力定量探究', formula: 'F_n = m ω² r' },
    };

    const cur = titles[this.currentExpId] ?? titles['mech-newton'];

    this.element.innerHTML = `
      <div class="hall-pure-container">
        <!-- Header -->
        <div class="hall-pure-header">
          <div class="hall-header-brand">
            <span class="hall-brand-title">${cur.name}</span>
            <span class="hall-clean-badge">${cur.formula}</span>
          </div>
        </div>

        <div class="thermo-card-container">
          <!-- 4 Telemetry Metrics Cards -->
          <div class="thermo-metrics-deck">
            <div class="thermo-metric-card">
              <span class="thermo-metric-label" id="mech-sub-m1">指标 1</span>
              <div class="thermo-metric-value" id="mech-val-m1" style="color:#38bdf8;">--</div>
            </div>

            <div class="thermo-metric-card">
              <span class="thermo-metric-label" id="mech-sub-m2">指标 2</span>
              <div class="thermo-metric-value" id="mech-val-m2" style="color:#34d399;">--</div>
            </div>

            <div class="thermo-metric-card">
              <span class="thermo-metric-label" id="mech-sub-m3">指标 3</span>
              <div class="thermo-metric-value" id="mech-val-m3" style="color:#fbbf24;">--</div>
            </div>

            <div class="thermo-metric-card">
              <span class="thermo-metric-label" id="mech-sub-m4">指标 4</span>
              <div class="thermo-metric-value" id="mech-val-m4" style="color:#a78bfa;">--</div>
            </div>
          </div>

          <!-- Data Acquisition Toolbar -->
          <div style="display:flex; gap:8px; margin: 10px 0;">
            <button class="carnot-btn" id="btn-mech-sample" type="button" style="background:rgba(56,189,248,0.2); border-color:#38bdf8; color:#7dd3fc; flex:1.2;">
              + 记录当前数据点
            </button>
            <button class="carnot-btn" id="btn-mech-fit" type="button" style="background:rgba(52,211,153,0.2); border-color:#34d399; color:#6ee7b7; flex:1;">
              一键拟合曲线
            </button>
            <button class="carnot-btn" id="btn-mech-clear" type="button" style="flex:0.8;">
              清空
            </button>
          </div>

          <!-- Data Points Table -->
          <div style="background:rgba(15,23,42,0.4); border-radius:8px; padding:6px 10px; max-height:100px; overflow-y:auto; margin-bottom:10px;">
            <table style="width:100%; text-align:left; border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.1); font-size:11px; color:#94a3b8;">
                  <th style="padding:4px 6px;">序号</th>
                  <th style="padding:4px 6px;">自变量 X</th>
                  <th style="padding:4px 6px;">因变量 Y</th>
                  <th style="padding:4px 6px;">比值 Y/X</th>
                </tr>
              </thead>
              <tbody id="mech-table-body">
                <tr><td colspan="4" style="text-align:center; color:#64748b; padding:12px;">暂无记录数据，点击上方按钮采样</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Least-Squares Linear Regression Plot -->
          <div class="thermo-chart-box" style="padding: 10px 14px;">
            <div class="thermo-chart-header">
              <span class="thermo-chart-title">最小二乘法曲线拟合图谱</span>
            </div>
            <div id="mech-fit-svg" style="display:flex; justify-content:center; margin:8px 0;">
              <svg width="280" height="120">
                <rect width="280" height="120" rx="8" fill="rgba(15,23,42,0.4)"/>
                <text x="140" y="65" text-anchor="middle" fill="#64748b" font-size="11">记录 2 组以上数据后点击一键拟合</text>
              </svg>
            </div>
            <div id="mech-fit-info" style="font-size:12px; line-height:1.4;">
              线性拟合: 待采样
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.element.querySelector('#btn-mech-sample')?.addEventListener('click', () => {
      this.recordCurrentPoint();
    });

    this.element.querySelector('#btn-mech-fit')?.addEventListener('click', () => {
      this.runFitting();
    });

    this.element.querySelector('#btn-mech-clear')?.addEventListener('click', () => {
      this.clearPoints();
    });
  }
}
