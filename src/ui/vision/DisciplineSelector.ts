export interface DisciplineCallbacks {
  onSelectChemistry: () => void;
  onSelectPhysics: () => void;
  onSelectMath: () => void;
}

export class DisciplineSelector {
  public element: HTMLElement;

  private callbacks: DisciplineCallbacks;

  constructor(callbacks: DisciplineCallbacks) {
    this.callbacks = callbacks;
    this.createUI();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-discipline-container';

    this.element.innerHTML = `
      <div class="discipline-cards-grid">
        <!-- 1. Chemistry Card -->
        <div class="discipline-card chemistry-card" id="card-discipline-chem" role="button" tabindex="0" aria-label="化学">
          <div class="card-icon-wrapper">
            <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 2v7.31L4.62 18.5A2 2 0 0 0 6.34 22h11.32a2 2 0 0 0 1.72-3.5L14 9.31V2"/>
              <path d="M8.5 2h7"/>
              <circle cx="10" cy="17" r="1" fill="currentColor"/>
              <circle cx="14" cy="15" r="1" fill="currentColor"/>
            </svg>
          </div>
          <div class="card-text-group">
            <h3 class="card-title">化学</h3>
            <p class="card-sub">元素与反应</p>
          </div>
        </div>

        <!-- 2. Physics Card -->
        <div class="discipline-card physics-card" id="card-discipline-phys" role="button" tabindex="0" aria-label="物理">
          <div class="card-icon-wrapper">
            <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
              <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(30 12 12)"/>
              <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-30 12 12)"/>
            </svg>
          </div>
          <div class="card-text-group">
            <h3 class="card-title">物理</h3>
            <p class="card-sub">力学与场论</p>
          </div>
        </div>

        <!-- 3. Math Card -->
        <div class="discipline-card math-card" id="card-discipline-math" role="button" tabindex="0" aria-label="数学">
          <div class="card-icon-wrapper">
            <svg class="vision-card-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
              <line x1="12" y1="22" x2="12" y2="15.5"/>
              <polyline points="22 8.5 12 15.5 2 8.5"/>
              <polyline points="2 15.5 12 8.5 22 15.5"/>
            </svg>
          </div>
          <div class="card-text-group">
            <h3 class="card-title">数学</h3>
            <p class="card-sub">几何与流形</p>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const chemCard = this.element.querySelector('#card-discipline-chem');
    chemCard?.addEventListener('click', () => {
      this.callbacks.onSelectChemistry();
    });
    chemCard?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        this.callbacks.onSelectChemistry();
      }
    });

    const physCard = this.element.querySelector('#card-discipline-phys');
    physCard?.addEventListener('click', () => {
      this.callbacks.onSelectPhysics();
    });
    physCard?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        this.callbacks.onSelectPhysics();
      }
    });

    const mathCard = this.element.querySelector('#card-discipline-math');
    mathCard?.addEventListener('click', () => {
      this.callbacks.onSelectMath();
    });
    mathCard?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        this.callbacks.onSelectMath();
      }
    });
  }
}
