import { findTutorial, escapeTutorialText as esc } from './tutorialCatalog.ts';
import { TUTORIAL_LESSONS } from './tutorialLessons.ts';
import { tutorialIllustration } from './tutorialIllustrations.ts';
import { animateTutorialText, TUTORIAL_TEXT_SELECTOR } from './tutorialMotion.ts';
import { DisciplineSelector } from './DisciplineSelector.ts';
import { PhysicsDisciplineModal } from './PhysicsDisciplineModal.ts';

export const TUTORIAL_ICON = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v15M5 9h3M5 12h3M16 9h3M16 12h3"/></svg>`;
export type TutorialDiscipline = 'optics' | 'em' | 'mechanics' | 'thermo';
export interface TutorialContext {
  tab: string;
  experimentId: string;
  physicsLevel: 1 | 2;
  discipline: TutorialDiscipline;
}

/** The existing card directories lead to full lessons inside the same window. */
export class TutorialPanel {
  readonly element: HTMLElement;
  private directoryContainer: HTMLElement;
  private detail: HTMLElement;
  private subjects: DisciplineSelector;
  private directory: PhysicsDisciplineModal;
  private page: 'subjects' | 'physics' | 'guide' = 'subjects';
  private returnPage: 'subjects' | 'physics' = 'subjects';
  private directoryScroll = 0;
  private selectedId = 'getting-started';
  private selectedStep = 0;
  private textAnimations: Animation[] = [];
  private onNavigate: (title: string, canGoBack: boolean) => void;

  constructor(onNavigate: (title: string, canGoBack: boolean) => void = () => {}) {
    this.onNavigate = onNavigate;
    this.element = document.createElement('section');
    this.element.className = 'tutorial-panel';
    this.element.setAttribute('aria-label', '实验使用教程');
    this.element.innerHTML = `
      <div class="tutorial-directory"></div>
      <article class="tutorial-detail" aria-label="实验介绍" hidden></article>`;
    this.directoryContainer = this.element.querySelector('.tutorial-directory')!;
    this.detail = this.element.querySelector('.tutorial-detail')!;
    this.subjects = new DisciplineSelector({
      onSelectChemistry: () => this.selectGuide('chemistry'),
      onSelectMath: () => this.selectGuide('math-stereometry'),
      onSelectPhysics: () => this.showDirectory(),
    });
    this.directory = new PhysicsDisciplineModal({
      onBackToDisciplines: () => this.showSubjects(),
      onSelectExperiment: async id => { this.selectGuide(id); },
      onLevelChange: () => { if (this.page === 'physics') this.notifyNavigation(); },
    });
    this.prefixIds(this.subjects.element);
    // Events are bound before IDs are scoped to this read-only copy.
    for (const type of ['click', 'keydown']) this.directory.element.addEventListener(type, () => this.prefixIds(this.directory.element));
    this.detail.addEventListener('click', event => {
      const target = event.target as Element;
      const step = target.closest<HTMLElement>('[data-tutorial-step]');
      if (step) this.selectStep(Number(step.dataset.tutorialStep));
      const section = target.closest<HTMLElement>('[data-tutorial-section]');
      if (section) {
        const destination = this.detail.querySelector<HTMLElement>(`[data-lesson-section="${section.dataset.tutorialSection}"]`);
        if (destination) this.detail.scrollTo?.({ top: destination.offsetTop - 18,
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    });
    this.element.addEventListener('keydown', event => {
      if (event.code === 'Escape') { (event.target as HTMLElement).blur?.(); return; }
      if (!['KeyV', 'KeyR', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0', 'BracketLeft', 'BracketRight'].includes(event.code)) event.stopPropagation();
    });
    this.showSubjects();
  }

  private prefixIds(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[id]').forEach(el => {
      if (!el.id.startsWith('tutorial-')) el.id = `tutorial-${el.id}`;
    });
  }

  public openContext(context: TutorialContext): void {
    if (context.tab === 'physics') this.showDirectory(context.physicsLevel === 2 ? context.discipline : undefined);
    else if (context.tab === 'disciplines') this.showSubjects();
    else this.setActiveExperiment(context.tab === 'chemistry' || context.tab === 'beaker' ? 'chemistry' : context.experimentId);
  }

  public setActiveExperiment(id: string): void {
    const guide = findTutorial(id);
    if (guide.id === 'getting-started') { this.showSubjects(); return; }
    const discipline: TutorialDiscipline | undefined = id.startsWith('optics-') ? 'optics'
      : id.startsWith('mech-') ? 'mechanics' : id.startsWith('em-') ? 'em' : id.startsWith('thermo-') ? 'thermo' : undefined;
    if (discipline) this.showDirectory(discipline);
    else this.showSubjects();
    this.selectGuide(guide.id, false);
  }

  private showSubjects(): void {
    this.page = 'subjects';
    this.directoryContainer.innerHTML = '';
    this.directoryContainer.appendChild(this.subjects.element);
    this.showDirectoryContent();
  }

  private showDirectory(discipline?: TutorialDiscipline): void {
    this.page = 'physics';
    if (discipline) this.directory.showLevel2(discipline);
    else this.directory.showLevel1();
    this.prefixIds(this.directory.element);
    this.directoryContainer.innerHTML = '';
    this.directoryContainer.appendChild(this.directory.element);
    this.showDirectoryContent();
  }

  private showDirectoryContent(): void {
    this.cancelTextAnimations();
    this.detail.hidden = true;
    this.directoryContainer.hidden = false;
    this.notifyNavigation();
    this.textAnimations = animateTutorialText(this.directoryContainer.querySelectorAll<HTMLElement>('h3, p'));
  }

  public goBack(): void {
    if (this.page === 'guide') {
      this.page = this.returnPage;
      this.showDirectoryContent();
      const deck = this.directory.element.querySelector<HTMLElement>('.optics-exp-deck');
      if (deck) deck.scrollTop = this.directoryScroll;
    } else if (this.page === 'physics' && this.directory.getCurrentLevel() === 2) this.showDirectory();
    else this.showSubjects();
  }

  private notifyNavigation(): void {
    const title = this.page === 'guide' ? `${findTutorial(this.selectedId).name} · 实验介绍`
      : this.page === 'subjects' ? '使用教程 · 学科'
      : this.directory.getCurrentLevel() === 1 ? '使用教程 · 物理学'
      : `${({ optics: '光学实验', mechanics: '力学实验', em: '电磁学实验', thermo: '热学实验' })[this.directory.getCurrentDiscipline()]} · 使用教程`;
    this.onNavigate(title, this.page !== 'subjects');
  }

  private selectGuide(id: string, animate = true): void {
    if (this.page !== 'guide') {
      this.returnPage = this.page;
      this.directoryScroll = this.directory.element.querySelector('.optics-exp-deck')?.scrollTop ?? 0;
    }
    this.cancelTextAnimations();
    this.page = 'guide';
    this.selectedId = findTutorial(id).id;
    this.selectedStep = 0;
    this.renderDetail();
    this.directoryContainer.hidden = true;
    this.detail.hidden = false;
    this.detail.scrollTop = 0;
    this.notifyNavigation();
    if (animate) this.textAnimations = animateTutorialText(this.detail.querySelectorAll<HTMLElement>(TUTORIAL_TEXT_SELECTOR));
  }

  public cancelTextAnimations(): void {
    this.textAnimations.forEach(animation => animation.cancel());
    this.textAnimations = [];
  }

  private renderDetail(): void {
    const guide = findTutorial(this.selectedId);
    const lesson = TUTORIAL_LESSONS[guide.id];
    this.detail.innerHTML = `
      <header class="tutorial-intro">
        <span class="tutorial-eyebrow">${esc(guide.group)} <span aria-hidden="true">/</span> 实验介绍</span>
        <h2>${esc(guide.name)}</h2><p>${esc(guide.summary)}</p>
      </header>
      <nav class="tutorial-sections" aria-label="介绍页章节">
        <button type="button" data-tutorial-section="principles">实验原理</button>
        <button type="button" data-tutorial-section="procedure">操作步骤</button>
        <button type="button" data-tutorial-section="observations">现象与结论</button>
      </nav>
      <section class="tutorial-purpose"><h3>实验目的</h3><p>${esc(lesson.goal)}</p></section>
      <section class="tutorial-principles" data-lesson-section="principles">
        <h3>实验原理</h3>
        <div class="tutorial-principle-layout">
          <div class="tutorial-prose">${lesson.principles.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</div>
          <figure class="tutorial-figure">
            <div class="tutorial-illustration">
              <svg viewBox="0 0 560 310" role="img" aria-label="${esc(guide.name)}器材与操作位置示意图"><g class="tutorial-apparatus">${tutorialIllustration(guide.id)}</g></svg>
              ${guide.steps.map((step, index) => `<button type="button" class="tutorial-hotspot${index === 0 ? ' is-active' : ''}" style="left:${step.point[0] / 5.6}%;top:${step.point[1] / 3.1}%" data-tutorial-step="${index}" aria-label="${index + 1}. ${esc(step.title)}" aria-pressed="${index === 0}">${index + 1}</button>`).join('')}
            </div>
            <figcaption>编号对应下方器材操作步骤 · 操作示意</figcaption>
          </figure>
        </div>
        <dl class="tutorial-equations">${lesson.equations.map(item => `<div><dt>${esc(item.expression)}</dt><dd>${esc(item.meaning)}</dd></div>`).join('')}</dl>
      </section>
      <section class="tutorial-procedure" data-lesson-section="procedure">
        <h3>操作步骤</h3>
        <div class="tutorial-preparation"><h4>开始前</h4><p>${esc(lesson.preparation)}</p></div>
        <ol class="tutorial-steps">${guide.steps.map((step, index) => `<li class="tutorial-step${index === 0 ? ' is-active' : ''}"><button type="button" data-tutorial-step="${index}" aria-pressed="${index === 0}"><span class="tutorial-step-number">${String(index + 1).padStart(2, '0')}</span><span>${esc(step.title)}</span></button><p>${esc(step.description)}</p></li>`).join('')}</ol>
        <div class="tutorial-record"><h4>记录与对照</h4><p>${esc(lesson.record)}</p></div>
      </section>
      <section class="tutorial-observations" data-lesson-section="observations"><h3>现象与结论</h3><ul>${lesson.observations.map(item => `<li>${esc(item)}</li>`).join('')}</ul><p class="tutorial-takeaway">${esc(guide.takeaway)}</p></section>
      <section class="tutorial-conditions"><h3>实验条件</h3><p>${esc(lesson.conditions)}</p></section>
      ${guide.parameters.length ? `<details class="tutorial-reference"><summary>功能与参数说明 <span>${guide.parameters.length} 项</span><span aria-hidden="true">＋</span></summary><dl>${guide.parameters.map(parameter => `<div><dt>${esc(parameter.name)}</dt><dd>${esc(parameter.description || parameter.name)}${parameter.options?.length ? `<span class="tutorial-options">${parameter.options.map(option => esc(option.label)).join(' · ')}</span>` : ''}</dd></div>`).join('')}</dl></details>` : ''}`;
  }

  private selectStep(index: number): void {
    const guide = findTutorial(this.selectedId);
    if (!Number.isInteger(index) || !guide.steps[index]) return;
    this.selectedStep = index;
    this.detail.querySelectorAll<HTMLElement>('[data-tutorial-step]').forEach(button => {
      const active = Number(button.dataset.tutorialStep) === this.selectedStep;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.closest('.tutorial-step')?.classList.toggle('is-active', active);
    });
  }
}
