import {
  ExperimentRegistry,
  CATEGORIES,
  type CategoryInfo,
} from '../experiments/ExperimentRegistry.ts';
import type { ExperimentMetadata, ExperimentCategory } from '../core/types.ts';
import { blurActiveInput, isTextInputActive } from '../core/focus.ts';

export class ExperimentDrawer {
  private element: HTMLElement;
  private listEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private isOpen = false;
  private currentActiveId: string | null = null;
  private activeCategory: string = 'all';
  private registry = ExperimentRegistry.getInstance();

  private container: HTMLElement;
  private onSelectExperiment: (id: string) => Promise<void>;
  public onToggle?: (isOpen: boolean) => void;

  constructor(
    container: HTMLElement = document.body,
    onSelectExperiment: (id: string) => Promise<void>
  ) {
    this.container = container;
    this.onSelectExperiment = onSelectExperiment;
    this.initDOM();
    this.renderList();
  }

  private initDOM(): void {
    this.element = document.createElement('div');
    this.element.id = 'experiment-drawer';
    this.element.className = 'hud-interactive';
    this.element.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-row">
          <span class="drawer-title">实验库</span>
          <button class="drawer-close-btn" id="drawer-close-btn" title="关闭 (ESC)">
            <svg class="apple-sf-icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="drawer-search-row">
          <div class="search-input-wrapper">
            <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" id="drawer-search-input" placeholder="搜索实验..." />
          </div>
        </div>
        <div class="drawer-category-tabs" id="drawer-category-tabs">
          <button class="category-chip active" data-cat="all">全部</button>
          ${CATEGORIES.map(
            (c) => `<button class="category-chip" data-cat="${c.id}">${c.name}</button>`
          ).join('')}
        </div>
      </div>
      <div class="drawer-list" id="drawer-list"></div>
      <div class="drawer-footer">
        <span class="drawer-shortcut-hint">按 E 或 ESC 切换 · 按 B 返回白板</span>
      </div>
    `;

    this.container.appendChild(this.element);

    this.listEl = this.element.querySelector('#drawer-list')!;
    this.searchInput = this.element.querySelector('#drawer-search-input')!;
    this.searchInput.disabled = true;
    this.searchInput.tabIndex = -1;

    // Close button
    this.element.querySelector('#drawer-close-btn')!.addEventListener('click', () => {
      this.toggle(false);
    });

    // Search listener
    this.searchInput.addEventListener('input', () => {
      this.renderList();
    });

    // Category chips listener
    const tabsContainer = this.element.querySelector('#drawer-category-tabs')!;
    tabsContainer.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.category-chip') as HTMLElement;
      if (!target) return;

      tabsContainer.querySelectorAll('.category-chip').forEach((c) => c.classList.remove('active'));
      target.classList.add('active');

      this.activeCategory = target.getAttribute('data-cat') || 'all';
      this.renderList();
    });

    // Toggle shortcut (Key: 'E') and Escape to close
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.ctrlKey && !e.metaKey) {
        if (this.isOpen) {
          this.toggle(false);
        } else if (!isTextInputActive()) {
          this.toggle(true);
        }
      } else if (e.code === 'Escape' && this.isOpen) {
        this.toggle(false);
      }
    });
  }

  public toggle(open?: boolean): void {
    const nextState = open ?? !this.isOpen;
    if (this.isOpen === nextState) return;
    this.isOpen = nextState;
    this.element.classList.toggle('open', this.isOpen);

    if (this.isOpen) {
      this.searchInput.disabled = false;
      this.searchInput.tabIndex = 0;
      try {
        if (typeof document !== 'undefined' && typeof document.exitPointerLock === 'function') {
          document.exitPointerLock();
        }
      } catch (err) {
        console.warn('[ExperimentDrawer] Error exiting pointer lock:', err);
      }
    } else {
      this.searchInput.blur?.();
      this.searchInput.disabled = true;
      this.searchInput.tabIndex = -1;
      blurActiveInput(true);
    }

    this.onToggle?.(this.isOpen);
  }

  public get open(): boolean {
    return this.isOpen;
  }

  public setActiveExperiment(id: string): void {
    this.currentActiveId = id;
    this.renderList();
  }

  private renderList(): void {
    const keyword = this.searchInput.value.trim();
    let experiments = this.registry.search(keyword);

    if (this.activeCategory !== 'all') {
      experiments = experiments.filter((e) => e.category === this.activeCategory);
    }

    this.listEl.innerHTML = '';

    if (experiments.length === 0) {
      this.listEl.innerHTML = `
        <div class="drawer-empty-state">
          <p>暂无可用虚拟实验</p>
          <span>物理与数学实验模块正在升级重构中，敬请期待</span>
        </div>
      `;
      return;
    }

    experiments.forEach((exp) => {
      const card = document.createElement('div');
      const isActive = exp.id === this.currentActiveId;
      card.className = `experiment-card ${isActive ? 'active' : ''}`;

      const intensityMap: Record<string, { label: string; color: string }> = {
        low: { label: '轻量', color: '#10b981' },
        medium: { label: '均衡', color: '#06b6d4' },
        high: { label: '多核高算力', color: '#f59e0b' },
        extreme: { label: '极限算力', color: '#ef4444' },
      };
      const intensity = intensityMap[exp.computeIntensity] || intensityMap.medium;

      card.innerHTML = `
        <div class="card-top-row">
          <div class="card-icon-title">
            <span class="card-icon">${exp.icon}</span>
            <span class="card-title">${exp.name}</span>
          </div>
          <span class="card-intensity" style="color: ${intensity.color}; border-color: ${intensity.color}40">
            ${intensity.label}
          </span>
        </div>
        <p class="card-desc">${exp.description}</p>
        ${exp.equation ? `<div class="card-equation">${exp.equation}</div>` : ''}
        <div class="card-tag-row">
          ${exp.tags.map((t) => `<span class="card-tag">${t}</span>`).join('')}
        </div>
      `;

      card.addEventListener('click', async () => {
        if (exp.id === this.currentActiveId) {
          this.toggle(false);
          return;
        }

        card.classList.add('loading');
        try {
          await this.onSelectExperiment(exp.id);
          this.currentActiveId = exp.id;
          this.renderList();
          this.toggle(false);
        } catch (err) {
          console.error('[ExperimentDrawer] Error switching experiment:', err);
        } finally {
          card.classList.remove('loading');
        }
      });

      this.listEl.appendChild(card);
    });
  }
}
