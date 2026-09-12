import type { IExperiment, ExperimentContext, ParameterDef } from '../core/types';

export class ParameterPanel {
  private element: HTMLElement;
  private headerEl: HTMLElement;
  private contentEl: HTMLElement;
  private isCollapsed = false;

  constructor(
    private container: HTMLElement = document.body,
    private onParamChangeCallback?: (id: string, value: any) => void,
    private onToggleDrawer?: () => void
  ) {
    this.initDOM();
  }

  private initDOM(): void {
    this.element = document.createElement('div');
    this.element.id = 'param-panel';
    this.element.className = 'hud-interactive hud-panel';
    this.element.innerHTML = `
      <div class="panel-header" id="param-panel-header">
        <div class="panel-title-group" id="param-title-group" title="参数控制">
          <span class="panel-title" id="param-panel-title">参数控制</span>
        </div>
        <div class="panel-actions">
          <button class="panel-icon-btn" id="param-drawer-btn" title="选择实验 (E)">
            <svg class="sf-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </button>
          <button class="panel-collapse-btn" id="param-panel-toggle" title="收起 / 展开">
            <svg class="sf-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>
      <div class="panel-equation" id="param-panel-equation"></div>
      <div class="panel-content" id="param-panel-content">
        <div class="panel-empty">暂无可调参数</div>
      </div>
    `;

    this.container.appendChild(this.element);

    this.headerEl = this.element.querySelector('#param-panel-title')!;
    this.contentEl = this.element.querySelector('#param-panel-content')!;

    const drawerBtn = this.element.querySelector('#param-drawer-btn');
    drawerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onToggleDrawer?.();
    });

    const toggleBtn = this.element.querySelector('#param-panel-toggle')!;
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isCollapsed = !this.isCollapsed;
      this.element.classList.toggle('collapsed', this.isCollapsed);
      const chevron = toggleBtn.querySelector('.sf-chevron') as HTMLElement;
      if (chevron) {
        chevron.style.transform = this.isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
      }
    });
  }

  public bindExperiment(experiment: IExperiment, context: ExperimentContext): void {
    const meta = experiment.metadata;
    this.headerEl.textContent = `${meta.name}`;

    const eqEl = this.element.querySelector('#param-panel-equation') as HTMLElement;
    if (meta.equation) {
      eqEl.style.display = 'block';
      eqEl.textContent = meta.equation;
    } else {
      eqEl.style.display = 'none';
    }

    this.contentEl.innerHTML = '';

    if (!meta.parameters || meta.parameters.length === 0) {
      this.contentEl.innerHTML = '<div class="panel-empty">该实验处于自动全息演示状态</div>';
      return;
    }

    meta.parameters.forEach((param) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'param-item';

      const currentValue = context.getParameter(param.id) ?? param.defaultValue;

      switch (param.type) {
        case 'range': {
          itemEl.innerHTML = `
            <div class="param-label-row">
              <span class="param-name">${param.name}</span>
              <span class="param-val" id="val-${param.id}">${currentValue}${param.unit ? ' ' + param.unit : ''}</span>
            </div>
            <input type="range" 
              class="param-slider" 
              min="${param.min ?? 0}" 
              max="${param.max ?? 100}" 
              step="${param.step ?? 1}" 
              value="${currentValue}" />
          `;

          const slider = itemEl.querySelector('input')!;
          const valDisplay = itemEl.querySelector(`#val-${param.id}`)!;

          slider.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            valDisplay.textContent = `${val}${param.unit ? ' ' + param.unit : ''}`;
            context.setParameter(param.id, val);
            if (experiment.onParameterChange) {
              experiment.onParameterChange(param.id, val, context);
            }
            if (param.onChange) {
              param.onChange(val, context);
            }
            this.onParamChangeCallback?.(param.id, val);
          });
          break;
        }

        case 'boolean': {
          itemEl.innerHTML = `
            <div class="param-label-row switch-row">
              <span class="param-name">${param.name}</span>
              <label class="cyber-switch">
                <input type="checkbox" ${currentValue ? 'checked' : ''} />
                <span class="slider round"></span>
              </label>
            </div>
          `;

          const checkbox = itemEl.querySelector('input')!;
          checkbox.addEventListener('change', (e) => {
            const val = (e.target as HTMLInputElement).checked;
            context.setParameter(param.id, val);
            if (experiment.onParameterChange) {
              experiment.onParameterChange(param.id, val, context);
            }
            if (param.onChange) {
              param.onChange(val, context);
            }
            this.onParamChangeCallback?.(param.id, val);
          });
          break;
        }
      }

      this.contentEl.appendChild(itemEl);
    });
  }
}
