export interface DisciplineCallbacks {
  onSelectChemistry: () => void;
  onSelectPhysics: (experimentId?: string) => void;
  onSelectMath: () => void;
}

export class DisciplineSelector {
  public element: HTMLElement;

  constructor(private callbacks: DisciplineCallbacks) {
    this.createUI();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-discipline-container';

    this.element.innerHTML = `
      <div class="discipline-hero-header">
        <h2 class="hero-title">学科大厅</h2>
        <p class="hero-subtitle">沉浸式空间科学探索 · 跨越微观化学分子、经典前沿物理与空间流形几何</p>
      </div>

      <div class="discipline-cards-grid">
        <!-- 1. Chemistry Card -->
        <div class="discipline-card chemistry-card" id="card-discipline-chem">
          <div class="card-glass-content">
            <div class="card-icon-banner">
              <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 2v7.31L4.62 18.5A2 2 0 0 0 6.34 22h11.32a2 2 0 0 0 1.72-3.5L14 9.31V2"/>
                <path d="M8.5 2h7"/>
                <path d="M7 16h10"/>
              </svg>
            </div>
            <h3 class="card-title">现代化学与分子动力学</h3>
            <p class="card-desc">
              标准 118 元素周期律矩阵交互，模拟真实水溶液离子电离平衡、难溶沉淀沉降与金属酸碱剧烈反应。
            </p>
            <div class="card-meta-line">
              <span>118 元素矩阵</span>
              <span class="meta-dot">·</span>
              <span>3D 真实烧杯</span>
              <span class="meta-dot">·</span>
              <span>离子动力学</span>
            </div>
            <button class="vision-card-action-btn" id="btn-open-chemistry">
              <span>进入化学周期表</span>
              <span class="btn-arrow">→</span>
            </button>
          </div>
        </div>

        <!-- 2. Physics Card -->
        <div class="discipline-card physics-card" id="card-discipline-phys">
          <div class="card-glass-content">
            <div class="card-icon-banner">
              <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="2.5"/>
                <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(30 12 12)"/>
                <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-30 12 12)"/>
              </svg>
            </div>
            <h3 class="card-title">前沿物理与空间场论</h3>
            <p class="card-desc">
              量子态波包色散扩散、经典三体引力摄动、洛伦兹非线性混沌吸引子与光学菲涅尔双缝干涉衍射交互。
            </p>
            <div class="physics-quick-links">
              <button class="phys-quick-btn" data-exp="quantum-wave">量子波包</button>
              <button class="phys-quick-btn" data-exp="nbody-gravity">三体引力</button>
              <button class="phys-quick-btn" data-exp="lorenz-attractor">混沌吸引子</button>
              <button class="phys-quick-btn" data-exp="laser-diffraction">激光衍射</button>
            </div>
            <button class="vision-card-action-btn" id="btn-open-physics">
              <span>进入物理实验</span>
              <span class="btn-arrow">→</span>
            </button>
          </div>
        </div>

        <!-- 3. Math Card -->
        <div class="discipline-card math-card" id="card-discipline-math">
          <div class="card-glass-content">
            <div class="card-icon-banner">
              <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 22 22 22"/>
                <circle cx="12" cy="15" r="3"/>
              </svg>
            </div>
            <h3 class="card-title">流形几何与动力系统</h3>
            <p class="card-desc">
              直观呈现黎曼曲面高斯曲率、四维超立方体旋转投影、分形复变函数共形映射与非欧拓扑空间结构。
            </p>
            <div class="card-meta-line">
              <span>微分流形</span>
              <span class="meta-dot">·</span>
              <span>四维超立方</span>
              <span class="meta-dot">·</span>
              <span>动力系统</span>
            </div>
            <button class="vision-card-action-btn disabled-btn" id="btn-open-math">
              <span>概念探索预览</span>
              <span class="btn-arrow">↗</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Open Chemistry
    this.element.querySelector('#btn-open-chemistry')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onSelectChemistry();
    });

    this.element.querySelector('#card-discipline-chem')?.addEventListener('click', () => {
      this.callbacks.onSelectChemistry();
    });

    // Open Physics default
    this.element.querySelector('#btn-open-physics')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onSelectPhysics();
    });

    // Quick physics buttons
    const quickBtns = this.element.querySelectorAll('.phys-quick-btn');
    quickBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expId = (btn as HTMLElement).dataset.exp;
        this.callbacks.onSelectPhysics(expId);
      });
    });

    // Math preview
    this.element.querySelector('#btn-open-math')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onSelectMath();
    });
  }
}
