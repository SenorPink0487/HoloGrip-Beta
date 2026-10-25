import type {
  HandPoseStatus,
  HandRuleMode,
  Polarity,
} from '../../physics/em/handRulesSolver.ts';

export interface HandRulesTelemetryData {
  mode: HandRuleMode;
  currentPolarity: Polarity;
  fieldPolarity: Polarity;
  motionPolarity: Polarity;
  gestureEnabled: boolean;
  requiredHand: 'left' | 'right';
  detectedHand: 'left' | 'right' | null;
  status: HandPoseStatus;
  alignmentScore: number;
  isMatched: boolean;
  statusLabel: string;
}

export interface HandRulesStatusCardCallbacks {
  onSelectMode?: (mode: HandRuleMode) => void;
  onToggleGesture?: () => void;
  onReverseCurrent?: () => void;
  onReverseField?: () => void;
  onReverseMotion?: () => void;
  onReset?: () => void;
}

export class HandRulesStatusCard {
  public element: HTMLElement;
  private callbacks: HandRulesStatusCardCallbacks;
  private isVisible = false;

  private currentData: HandRulesTelemetryData = {
    mode: 'right-hand-screw',
    currentPolarity: 1,
    fieldPolarity: 1,
    motionPolarity: 1,
    gestureEnabled: false,
    requiredHand: 'right',
    detectedHand: null,
    status: 'idle',
    alignmentScore: 0,
    isMatched: false,
    statusLabel: '点击开启手势识别，在实验台召唤 T-800 机械内骨骼手',
  };

  // 缓存的 DOM 引用
  private gestureBtnEl: HTMLButtonElement | null = null;
  private gestureDotEl: HTMLElement | null = null;
  private gestureBtnLabelEl: HTMLElement | null = null;
  private modeTabs: NodeListOf<HTMLButtonElement> | null = null;

  private formulaTextEl: HTMLElement | null = null;
  private requiredHandBadgeEl: HTMLElement | null = null;
  private knownSummaryEl: HTMLElement | null = null;
  private soughtSummaryEl: HTMLElement | null = null;
  private postureRuleHintEl: HTMLElement | null = null;

  private statusBadgeEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private scoreValEl: HTMLElement | null = null;
  private progressFillEl: HTMLElement | null = null;

  private btnRevCurrent: HTMLButtonElement | null = null;
  private btnRevField: HTMLButtonElement | null = null;
  private btnRevMotion: HTMLButtonElement | null = null;

  constructor(callbacks: HandRulesStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.injectStyles();
    this.element = document.createElement('div');
    this.element.className = 'vision-hand-rules-card';
    this.render();
  }

  private injectStyles(): void {
    if (
      typeof document === 'undefined' ||
      (typeof document.getElementById === 'function' && document.getElementById('vision-hand-rules-card-style'))
    ) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'vision-hand-rules-card-style';
    style.textContent = `
      .vision-hand-rules-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px 22px 20px;
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif;
        user-select: none;
        -webkit-user-select: none;
      }

      /* 顶部栏：手势识别主开关 + 定则状态胶囊 */
      .hr-top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 12px 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.12);
      }

      .hr-top-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .hr-top-title {
        font-size: 14px;
        font-weight: 600;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .hr-hand-pill {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 9px;
        border-radius: 999px;
        background: rgba(56, 189, 248, 0.16);
        color: #7dd3fc;
        border: 0.5px solid rgba(56, 189, 248, 0.4);
      }

      .hr-top-sub {
        font-size: 11.5px;
        color: rgba(226, 232, 240, 0.68);
      }

      .hr-gesture-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 40px;
        padding: 0 18px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.35), rgba(56, 189, 248, 0.2));
        border: 1px solid rgba(56, 189, 248, 0.55);
        box-shadow: 0 4px 16px rgba(14, 165, 233, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.3);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        flex-shrink: 0;
      }

      .hr-gesture-toggle-btn:hover {
        transform: translateY(-1px);
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.48), rgba(56, 189, 248, 0.3));
        border-color: rgba(125, 211, 252, 0.8);
      }

      .hr-gesture-toggle-btn:active {
        transform: scale(0.96);
      }

      .hr-gesture-toggle-btn.active {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.38), rgba(52, 211, 153, 0.22));
        border-color: rgba(52, 211, 153, 0.68);
        box-shadow: 0 4px 18px rgba(16, 185, 129, 0.32), inset 0 1px 1px rgba(255, 255, 255, 0.35);
      }

      .hr-gesture-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #94a3b8;
        transition: all 0.2s ease;
      }

      .hr-gesture-dot.active {
        background: #34d399;
        box-shadow: 0 0 10px #34d399;
      }

      /* 三大定则切换分段控制器 */
      .hr-mode-segmented {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        padding: 5px;
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .hr-mode-tab {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 9px 10px;
        border-radius: 10px;
        border: 1px solid transparent;
        background: transparent;
        color: rgba(226, 232, 240, 0.72);
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .hr-mode-tab:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.06);
      }

      .hr-mode-tab.active {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.26);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.25);
      }

      .hr-mode-tab-name {
        font-size: 13px;
        font-weight: 600;
      }

      .hr-mode-tab-desc {
        font-size: 10.5px;
        color: rgba(148, 163, 184, 0.9);
      }

      .hr-mode-tab.active .hr-mode-tab-desc {
        color: #7dd3fc;
      }

      /* 物理量已知/待求卡片网格 */
      .hr-physics-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .hr-info-box {
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .hr-info-label {
        font-size: 11px;
        font-weight: 600;
        color: rgba(148, 163, 184, 0.9);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .hr-info-val {
        font-size: 13px;
        font-weight: 600;
        color: #f8fafc;
        line-height: 1.4;
      }

      .hr-info-val.sought {
        color: #34d399;
      }

      .hr-posture-banner {
        padding: 11px 14px;
        border-radius: 12px;
        background: rgba(56, 189, 248, 0.08);
        border: 1px solid rgba(56, 189, 248, 0.24);
        font-size: 12px;
        color: #e0f2fe;
        line-height: 1.45;
      }

      /* 实时手势骨骼匹配度反馈条 */
      .hr-status-panel {
        padding: 12px 15px;
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.52);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .hr-status-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .hr-status-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .hr-status-badge {
        font-size: 10.5px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 6px;
        background: rgba(148, 163, 184, 0.2);
        color: #cbd5e1;
        flex-shrink: 0;
      }

      .hr-status-badge.matched {
        background: rgba(16, 185, 129, 0.24);
        color: #34d399;
        border: 0.5px solid rgba(52, 211, 153, 0.5);
      }

      .hr-status-badge.wrong-hand {
        background: rgba(245, 158, 11, 0.24);
        color: #fbbf24;
        border: 0.5px solid rgba(251, 191, 36, 0.5);
      }

      .hr-status-badge.adjusting {
        background: rgba(56, 189, 248, 0.2);
        color: #38bdf8;
        border: 0.5px solid rgba(56, 189, 248, 0.45);
      }

      .hr-status-text {
        font-size: 12px;
        font-weight: 500;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .hr-score-val {
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", monospace;
        font-size: 12px;
        font-weight: 700;
        color: #7dd3fc;
        flex-shrink: 0;
      }

      .hr-progress-track {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      .hr-progress-fill {
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: linear-gradient(90deg, #38bdf8, #34d399);
        transition: width 0.15s ease, background 0.2s ease;
      }

      /* 底部方向翻转控制按钮栏 */
      .hr-controls-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .hr-ctrl-btn {
        flex: 1;
        min-width: 120px;
        height: 36px;
        padding: 0 12px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: #f8fafc;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.16s ease;
      }

      .hr-ctrl-btn:hover {
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.28);
      }

      .hr-ctrl-btn:active {
        transform: scale(0.97);
      }

      .hr-ctrl-btn.hidden {
        display: none !important;
      }
    `;
    document.head?.appendChild?.(style);
  }

  private render(): void {
    this.element.innerHTML = `
      <!-- 顶部手势识别开关与定则要求 -->
      <div class="hr-top-bar">
        <div class="hr-top-info">
          <div class="hr-top-title">
            <span>T-800 机械内骨骼手交互</span>
            <span class="hr-hand-pill" id="hr-required-hand-badge">需用右手</span>
          </div>
          <span class="hr-top-sub" id="hr-formula-text">安培定则 (右手螺旋)：已知电流 I 方向 → 推导环绕磁场 B 方向</span>
        </div>
        <button class="hr-gesture-toggle-btn" id="btn-hand-rules-toggle-gesture" type="button">
          <span class="hr-gesture-dot" id="hr-gesture-dot"></span>
          <span id="hr-gesture-btn-label">开启手势识别</span>
        </button>
      </div>

      <!-- 三大定则切换选项卡 -->
      <div class="hr-mode-segmented" role="tablist" aria-label="电磁定则选择">
        <button class="hr-mode-tab active" data-mode="right-hand-screw" type="button">
          <span class="hr-mode-tab-name">右手螺旋法则</span>
          <span class="hr-mode-tab-desc">电流 I → 环绕磁场 B</span>
        </button>
        <button class="hr-mode-tab" data-mode="left-hand-rule" type="button">
          <span class="hr-mode-tab-name">左手定则</span>
          <span class="hr-mode-tab-desc">磁场 B + 电流 I → 安培力 F</span>
        </button>
        <button class="hr-mode-tab" data-mode="right-hand-rule" type="button">
          <span class="hr-mode-tab-name">右手定则</span>
          <span class="hr-mode-tab-desc">磁场 B + 切割 v → 感应电流 I</span>
        </button>
      </div>

      <!-- 已知物理量与待求物理量对照 -->
      <div class="hr-physics-grid">
        <div class="hr-info-box">
          <div class="hr-info-label">
            <span>已知物理方向 (3D 箭头已标出)</span>
          </div>
          <div class="hr-info-val" id="hr-known-summary">直导线电流 I：竖直向上 (+Y)</div>
        </div>
        <div class="hr-info-box">
          <div class="hr-info-label">
            <span>手势推导目标 (比对正确即点亮)</span>
          </div>
          <div class="hr-info-val sought" id="hr-sought-summary">环绕磁场 B：俯视逆时针流转</div>
        </div>
      </div>

      <!-- 定则标准手势要领 -->
      <div class="hr-posture-banner" id="hr-posture-rule-hint">
        手势要领：伸出<strong>右手</strong>，弯曲四指环绕直导线，让<strong>大拇指指向电流 I 方向</strong>，四指弯曲方向即为磁感线 B 环绕方向。
      </div>

      <!-- 实时手势判定进度 -->
      <div class="hr-status-panel">
        <div class="hr-status-header">
          <div class="hr-status-left">
            <span class="hr-status-badge" id="hr-status-badge">待机</span>
            <span class="hr-status-text" id="hr-status-text">点击右上按钮开启手势识别，伸手进入实验台交互</span>
          </div>
          <span class="hr-score-val" id="hr-score-val">0%</span>
        </div>
        <div class="hr-progress-track">
          <div class="hr-progress-fill" id="hr-progress-fill"></div>
        </div>
      </div>

      <!-- 手动反转方向控制按钮栏 -->
      <div class="hr-controls-row">
        <button class="hr-ctrl-btn" id="btn-hr-rev-current" type="button">反转电流方向 (I)</button>
        <button class="hr-ctrl-btn hidden" id="btn-hr-rev-field" type="button">反转磁场方向 (B)</button>
        <button class="hr-ctrl-btn hidden" id="btn-hr-rev-motion" type="button">反转切割运动 (v)</button>
      </div>
    `;

    this.gestureBtnEl = this.element.querySelector('#btn-hand-rules-toggle-gesture');
    this.gestureDotEl = this.element.querySelector('#hr-gesture-dot');
    this.gestureBtnLabelEl = this.element.querySelector('#hr-gesture-btn-label');
    this.modeTabs = this.element.querySelectorAll('.hr-mode-tab');

    this.formulaTextEl = this.element.querySelector('#hr-formula-text');
    this.requiredHandBadgeEl = this.element.querySelector('#hr-required-hand-badge');
    this.knownSummaryEl = this.element.querySelector('#hr-known-summary');
    this.soughtSummaryEl = this.element.querySelector('#hr-sought-summary');
    this.postureRuleHintEl = this.element.querySelector('#hr-posture-rule-hint');

    this.statusBadgeEl = this.element.querySelector('#hr-status-badge');
    this.statusTextEl = this.element.querySelector('#hr-status-text');
    this.scoreValEl = this.element.querySelector('#hr-score-val');
    this.progressFillEl = this.element.querySelector('#hr-progress-fill');

    this.btnRevCurrent = this.element.querySelector('#btn-hr-rev-current');
    this.btnRevField = this.element.querySelector('#btn-hr-rev-field');
    this.btnRevMotion = this.element.querySelector('#btn-hr-rev-motion');

    this.bindEvents();
    this.syncUI();
  }

  private bindEvents(): void {
    this.gestureBtnEl?.addEventListener('click', () => {
      this.callbacks.onToggleGesture?.();
    });

    this.modeTabs?.forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode') as HandRuleMode | null;
        if (mode) {
          this.callbacks.onSelectMode?.(mode);
        }
      });
    });

    this.btnRevCurrent?.addEventListener('click', () => {
      this.callbacks.onReverseCurrent?.();
    });

    this.btnRevField?.addEventListener('click', () => {
      this.callbacks.onReverseField?.();
    });

    this.btnRevMotion?.addEventListener('click', () => {
      this.callbacks.onReverseMotion?.();
    });
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.element.style) {
      this.element.style.display = visible ? 'flex' : 'none';
    }
  }

  public updateFromTelemetry(data: HandRulesTelemetryData): void {
    this.currentData = { ...data };
    this.syncUI();
  }

  private syncUI(): void {
    const d = this.currentData;

    // 1. 手势开关状态
    if (this.gestureBtnEl && this.gestureDotEl && this.gestureBtnLabelEl) {
      this.gestureBtnEl.classList.toggle('active', d.gestureEnabled);
      this.gestureDotEl.classList.toggle('active', d.gestureEnabled);
      this.gestureBtnLabelEl.textContent = d.gestureEnabled ? '手势识别已开启' : '开启手势识别';
    }

    // 2. 激活的定则 Tab
    this.modeTabs?.forEach((tab) => {
      const tabMode = tab.getAttribute('data-mode');
      tab.classList.toggle('active', tabMode === d.mode);
    });

    // 3. 各定则文案与方向按钮显隐
    if (this.requiredHandBadgeEl) {
      this.requiredHandBadgeEl.textContent = d.requiredHand === 'left' ? '请伸左手' : '请伸右手';
    }

    if (d.mode === 'right-hand-screw') {
      if (this.formulaTextEl) {
        this.formulaTextEl.textContent = '安培定则 (右手螺旋法则)：已知电流 I 方向 → 推导环绕磁场 B 方向';
      }
      if (this.knownSummaryEl) {
        this.knownSummaryEl.textContent = `直导线电流 I：${d.currentPolarity > 0 ? '竖直向上 (+Y)' : '竖直向下 (-Y)'}`;
      }
      if (this.soughtSummaryEl) {
        this.soughtSummaryEl.textContent = `环绕磁场 B：${d.currentPolarity > 0 ? '俯视逆时针流转' : '俯视顺时针流转'}`;
      }
      if (this.postureRuleHintEl) {
        this.postureRuleHintEl.innerHTML =
          '手势要领：伸出<strong>右手</strong>，四指弯曲环绕通电直导线，让<strong>大拇指指向电流 I 方向</strong>，四指弯曲方向即为磁感线 B 环绕方向。';
      }
      this.btnRevCurrent?.classList.remove('hidden');
      this.btnRevField?.classList.add('hidden');
      this.btnRevMotion?.classList.add('hidden');
    } else if (d.mode === 'left-hand-rule') {
      const fx = d.currentPolarity * d.fieldPolarity;
      if (this.formulaTextEl) {
        this.formulaTextEl.textContent = '左手定则 (F = I L × B)：已知磁场 B 与电流 I → 推导安培力 F 方向';
      }
      if (this.knownSummaryEl) {
        const bStr = d.fieldPolarity > 0 ? '竖直向上 (+Y)' : '竖直向下 (-Y)';
        const iStr = d.currentPolarity > 0 ? '向里 (-Z)' : '向外 (+Z)';
        this.knownSummaryEl.textContent = `磁场 B：${bStr} · 电流 I：${iStr}`;
      }
      if (this.soughtSummaryEl) {
        this.soughtSummaryEl.textContent = `安培力 F：${fx > 0 ? '水平向右 (+X) 滑行' : '水平向左 (-X) 滑行'}`;
      }
      if (this.postureRuleHintEl) {
        this.postureRuleHintEl.innerHTML =
          '手势要领：伸平<strong>左手</strong>，让磁感线 B 穿入掌心、四指指向电流 I 方向，<strong>左手大拇指指向正确的安培力 F 方向</strong>即触发导体棒滑行。';
      }
      this.btnRevCurrent?.classList.remove('hidden');
      this.btnRevField?.classList.remove('hidden');
      this.btnRevMotion?.classList.add('hidden');
    } else {
      const indY = d.motionPolarity * d.fieldPolarity;
      if (this.formulaTextEl) {
        this.formulaTextEl.textContent = '右手定则 (E = B L v)：已知磁场 B 与切割运动 v → 推导感应电流 I 方向';
      }
      if (this.knownSummaryEl) {
        const bStr = d.fieldPolarity > 0 ? '向里穿入 (-Z)' : '向外穿出 (+Z)';
        const vStr = d.motionPolarity > 0 ? '水平向右 (+X)' : '水平向左 (-X)';
        this.knownSummaryEl.textContent = `磁场 B：${bStr} · 切割速度 v：${vStr}`;
      }
      if (this.soughtSummaryEl) {
        this.soughtSummaryEl.textContent = `感应电流 I：${indY > 0 ? '沿导体向上 (+Y)' : '沿导体向下 (-Y)'}`;
      }
      if (this.postureRuleHintEl) {
        this.postureRuleHintEl.innerHTML =
          '手势要领：伸平<strong>右手</strong>，让磁感线 B 穿入掌心、大拇指指向切割运动 v 方向，<strong>右手四指指向正确的感应电流方向</strong>即点亮回路电流。';
      }
      this.btnRevCurrent?.classList.add('hidden');
      this.btnRevField?.classList.remove('hidden');
      this.btnRevMotion?.classList.remove('hidden');
    }

    // 4. 实时判定状态与匹配度条
    if (this.statusBadgeEl) {
      this.statusBadgeEl.className = 'hr-status-badge';
      if (d.status === 'matched') {
        this.statusBadgeEl.classList.add('matched');
        this.statusBadgeEl.textContent = '定则吻合';
      } else if (d.status === 'wrong-hand') {
        this.statusBadgeEl.classList.add('wrong-hand');
        this.statusBadgeEl.textContent = '请换手';
      } else if (d.status === 'adjusting') {
        this.statusBadgeEl.classList.add('adjusting');
        this.statusBadgeEl.textContent = '比划对准中';
      } else {
        this.statusBadgeEl.textContent = d.gestureEnabled ? '等待手势' : '待机';
      }
    }

    if (this.statusTextEl) {
      this.statusTextEl.textContent = d.statusLabel;
    }

    const pct = Math.round(d.alignmentScore * 100);
    if (this.scoreValEl) {
      this.scoreValEl.textContent = `${pct}%`;
    }
    if (this.progressFillEl && this.progressFillEl.style) {
      this.progressFillEl.style.width = `${pct}%`;
    }
  }
}
