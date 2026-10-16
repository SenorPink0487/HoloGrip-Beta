import assert from 'node:assert';

// Lightweight DOM mock for Node.js test environment
class MockElement {
  public tagName: string;
  public className: string = '';
  public innerHTML: string = '';
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public textContent: string = '';
  private elementCache: Map<string, MockElement> = new Map();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  dispatch(event: string, e?: any): void {
    if (this.eventListeners[event]) {
      for (const h of this.eventListeners[event]) {
        h(e);
      }
    }
  }

  get classList() {
    return {
      add: (cls: string) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.add(cls);
        this.className = Array.from(classes).join(' ');
      },
      remove: (cls: string) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.delete(cls);
        this.className = Array.from(classes).join(' ');
      },
      toggle: (cls: string, force?: boolean) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force !== undefined ? force : !classes.has(cls);
        if (shouldAdd) classes.add(cls);
        else classes.delete(cls);
        this.className = Array.from(classes).join(' ');
      },
      contains: (cls: string) => {
        return this.className.split(/\s+/).includes(cls);
      },
    };
  }

  querySelector(selector: string): MockElement | null {
    if (this.elementCache.has(selector)) {
      return this.elementCache.get(selector)!;
    }

    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.innerHTML.includes(`id="${id}"`)) {
        const el = new MockElement('div');
        el.setAttribute('id', id);
        this.elementCache.set(selector, el);
        return el;
      }
    }

    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];

    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const regex = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(this.innerHTML)) !== null) {
        const el = new MockElement('div');
        el.className = cls;

        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = Math.min(this.innerHTML.length, match.index + match[0].length + 120);
        const snippet = this.innerHTML.slice(contextStart, contextEnd);

        const expMatch = snippet.match(/data-exp-id="([^"]+)"/);
        if (expMatch) el.setAttribute('data-exp-id', expMatch[1]);

        results.push(el);
      }
    }

    return results;
  }
}

// Global DOM mock
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => new MockElement(tag),
  };
}

import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

console.log('=== Starting Physics Discipline Two-Level Menu Verification ===\n');

// Test 1: Level 1 shows 4 branches and DOES NOT show experiments before clicking Optics
{
  console.log('Test 1: Level 1 shows 4 branches, experiments are hidden initially');
  let levelReported: number = 0;

  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
    onLevelChange: (lvl) => {
      levelReported = lvl;
    },
  });

  assert.strictEqual(modal.getCurrentLevel(), 1, 'Initial level must be Level 1');
  assert.strictEqual(modal.canGoBack(), false, 'Cannot go back within physics on Level 1');
  assert.strictEqual(levelReported, 1, 'Should report Level 1 to callback');

  const html = modal.element.innerHTML;
  assert(html.includes('physics-level-1'), 'Must render Level 1 container');
  assert(html.includes('physics-branches-deck'), 'Must render branches deck');

  // Must contain all 4 branches
  assert(html.includes('光学实验'), 'Must contain 光学实验 on Level 1');
  assert(html.includes('力学实验'), 'Must contain 力学实验 on Level 1');
  assert(html.includes('热学实验'), 'Must contain 热学实验 on Level 1');
  assert(html.includes('电磁学'), 'Must contain 电磁学 on Level 1');

  // CRITICAL REQUIREMENT: "点击光学后才看到实验" -> experiments must NOT be present on Level 1!
  assert(!html.includes('全息光学综合实验台'), 'Experiments must NOT be visible on Level 1 before clicking optics');
  assert(!html.includes('杨氏双缝干涉'), 'Young interference must NOT be visible on Level 1');
  assert(!html.includes('optics-card'), 'Optics experiment cards must not exist on Level 1');

  console.log('✓ Test 1 passed: Level 1 correctly displays branches and hides experiments before click\n');
}

// Test 2: Level 2 shows the 5 experiments only after entering Optics
{
  console.log('Test 2: Level 2 displays 5 optics experiments after clicking Optics');
  let levelReported: number = 0;

  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
    onLevelChange: (lvl) => {
      levelReported = lvl;
    },
  });

  // User clicks Optics -> enters Level 2
  modal.showLevel2();

  assert.strictEqual(modal.getCurrentLevel(), 2, 'Level must be 2 after entering Optics');
  assert.strictEqual(modal.canGoBack(), true, 'Can go back to Level 1 from Level 2');
  assert.strictEqual(levelReported, 2, 'Should report Level 2 to callback');

  const html = modal.element.innerHTML;
  assert(html.includes('physics-level-2'), 'Must render Level 2 container');
  assert(html.includes('optics-exp-deck'), 'Must render optics experiments deck');

  // 4 Core optics experiments present in Level 2
  assert(html.includes('光的传播与折射色散'), 'Must contain 光的传播与折射色散');
  assert(html.includes('杨氏双缝干涉'), 'Must contain 杨氏双缝干涉');
  assert(html.includes('单缝与光栅衍射'), 'Must contain 单缝与光栅衍射');
  assert(html.includes('光的偏振与马吕斯定律'), 'Must contain 光的偏振与马吕斯定律');

  // Academic formulas present
  assert(html.includes('n₁ sinθ₁ = n₂ sinθ₂'), 'Must contain Snell formula');
  assert(html.includes('Δy = (λ L) / d'), 'Must contain Young formula');
  assert(html.includes('d sinθ = mλ'), 'Must contain Grating formula');
  assert(html.includes('I = I₀ cos²(θ₂ - θ₁)'), 'Must contain Malus formula');

  // Back button to physics branches exists
  assert(html.includes('btn-back-to-physics'), 'Must contain back button to physics branches');

  console.log('✓ Test 2 passed: Level 2 accurately reveals 4 core experiments and formulas\n');
}

// Test 3: Zero small-text descriptions on both Level 1 and Level 2
{
  console.log('Test 3: Zero small-text descriptions verification across both levels');
  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
  });

  // Check Level 1 HTML
  const l1Html = modal.element.innerHTML;
  assert(!l1Html.includes('hero-desc'), 'hero-desc must be removed');
  assert(!l1Html.includes('branch-desc'), 'branch-desc must be removed');
  assert(!l1Html.includes('经典天体动力系统'), 'Long subtitle must be removed');
  assert(!l1Html.includes('几何传播、双缝干涉'), 'Sub-discipline paragraph must be removed');

  // Check Level 2 HTML
  modal.showLevel2();
  const l2Html = modal.element.innerHTML;
  assert(!l2Html.includes('optics-exp-desc'), 'optics-exp-desc must be removed');
  assert(!l2Html.includes('集成精密光学导轨'), 'Experiment description paragraph must be removed');
  assert(!l2Html.includes('等边三棱镜斯涅尔折射'), 'Dispersion description paragraph must be removed');

  console.log('✓ Test 3 passed: Small-text descriptions eliminated on all levels\n');
}

// Test 4: Back navigation and reset behavior
{
  console.log('Test 4: Back navigation and reset behavior');
  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
  });

  // Enter Level 2
  modal.showLevel2();
  assert.strictEqual(modal.getCurrentLevel(), 2);

  // Go back
  const didGoBack = modal.goBack();
  assert.strictEqual(didGoBack, true, 'goBack should return true when on Level 2');
  assert.strictEqual(modal.getCurrentLevel(), 1, 'Should return to Level 1');

  // Calling goBack again on Level 1
  const didGoBackAgain = modal.goBack();
  assert.strictEqual(didGoBackAgain, false, 'goBack should return false when on Level 1');
  assert.strictEqual(modal.getCurrentLevel(), 1);

  // Reset restores Level 1
  modal.showLevel2();
  modal.reset();
  assert.strictEqual(modal.getCurrentLevel(), 1, 'reset should restore Level 1');

  console.log('✓ Test 4 passed: Hierarchical navigation and reset flow verified\n');
}

// Test 5: Thermodynamics branch and Level 2 verification
{
  console.log('Test 5: Thermodynamics branch activation and Level 2 display');
  let levelReported: number = 0;
  let titleReported: string = '';

  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
    onLevelChange: (lvl, title) => {
      levelReported = lvl;
      titleReported = title;
    },
  });

  // Verify Level 1 thermo tile is ready
  const l1Html = modal.element.innerHTML;
  assert(l1Html.includes('id="branch-tile-thermo"'), 'Must have thermo branch tile');
  assert(l1Html.includes('class="physics-branch-tile ready" id="branch-tile-thermo"'), 'Thermo tile must have ready class');

  // Enter Level 2 Thermodynamics
  modal.showLevel2('thermo');

  assert.strictEqual(modal.getCurrentLevel(), 2, 'Must be Level 2 after entering thermo');
  assert.strictEqual(levelReported, 2, 'Should report Level 2 to callback');
  assert.strictEqual(titleReported, '热学实验', 'Should report 热学实验 title');

  const html = modal.element.innerHTML;
  assert(html.includes('physics-level-2'), 'Must render Level 2 container');
  assert(html.includes('热学实验'), 'Header must contain 热学实验');

  // Verify 4 core thermodynamics experiments
  assert(html.includes('理想气体状态与分子运动论'), 'Must contain 理想气体状态与分子运动论');
  assert(html.includes('卡诺热机与循环效率'), 'Must contain 卡诺热机与循环效率');
  assert(html.includes('热传导与傅里叶定律'), 'Must contain 热传导与傅里叶定律');
  assert(html.includes('物态相变与潜热曲线'), 'Must contain 物态相变与潜热曲线');

  // Verify formulas
  assert(html.includes('PV = nRT'), 'Must contain Ideal gas formula');
  assert(html.includes('η = 1 - T_C / T_H'), 'Must contain Carnot efficiency formula');
  assert(html.includes('q = -k ∇T'), 'Must contain Fourier law formula');
  assert(html.includes('Q = m · L'), 'Must contain Latent heat formula');

  // Go back to Level 1
  assert.strictEqual(modal.canGoBack(), true);
  modal.goBack();
  assert.strictEqual(modal.getCurrentLevel(), 1, 'Should return to Level 1 from thermo Level 2');

  console.log('✓ Test 5 passed: Thermodynamics branch accurately presents 4 classic experiments\n');
}

// Test 6: Mechanics branch activation and Level 2 display
{
  console.log('Test 6: Mechanics branch activation and Level 2 5-experiment display');
  let levelReported: number = 0;
  let titleReported: string = '';

  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
    onLevelChange: (lvl, title) => {
      levelReported = lvl;
      titleReported = title;
    },
  });

  // Verify Level 1 mechanics tile is ready
  const l1Html = modal.element.innerHTML;
  assert(l1Html.includes('id="branch-tile-mechanics"'), 'Must have mechanics branch tile');
  assert(l1Html.includes('class="physics-branch-tile ready" id="branch-tile-mechanics"'), 'Mechanics tile must have ready class');
  assert(!l1Html.includes('id="branch-tile-mechanics" role="button" tabindex="0" title="规划中"'), 'Mechanics tile must not be planned');

  // Enter Level 2 Mechanics
  modal.showLevel2('mechanics');

  assert.strictEqual(modal.getCurrentLevel(), 2, 'Must be Level 2 after entering mechanics');
  assert.strictEqual(levelReported, 2, 'Should report Level 2 to callback');
  assert.strictEqual(titleReported, '力学实验', 'Should report 力学实验 title');

  const html = modal.element.innerHTML;
  assert(html.includes('physics-level-2'), 'Must render Level 2 container');
  assert(html.includes('力学实验'), 'Header must contain 力学实验');

  // Verify all core mechanics experiments
  assert(html.includes('牛顿第二定律与斜面滑块'), 'Must contain 牛顿第二定律与斜面滑块');
  assert(html.includes('动量守恒与气轨多体碰撞'), 'Must contain 动量守恒与气轨多体碰撞');
  assert(html.includes('平抛运动与机械能守恒'), 'Must contain 平抛运动与机械能守恒');
  assert(html.includes('单摆简谐运动测重力加速度'), 'Must contain 单摆简谐运动测重力加速度');
  assert(html.includes('圆周运动向心力定量探究'), 'Must contain 圆周运动向心力定量探究');
  assert(html.includes('伽利略理想斜面实验'), 'Must contain 伽利略理想斜面实验');

  // Verify core formulas
  assert(html.includes('F_{net} = Ma'), 'Must contain Newton 2nd law formula');
  assert(html.includes('m₁v₁ + m₂v₂'), 'Must contain Momentum conservation formula');
  assert(html.includes('y = (g/2v₀²)x²'), 'Must contain Projectile motion formula');
  assert(html.includes('T = 2π√(L/g)'), 'Must contain Pendulum period formula');
  assert(html.includes('F_n = m ω² r'), 'Must contain Centripetal force formula');
  assert(html.includes('h_1 = h_2'), 'Must contain Galileo ideal experiment formula');

  // Go back to Level 1
  assert.strictEqual(modal.canGoBack(), true);
  modal.goBack();
  assert.strictEqual(modal.getCurrentLevel(), 1, 'Should return to Level 1 from mechanics Level 2');

  console.log('✓ Test 6 passed: Mechanics branch accurately presents 5 classic experiments and formulas\n');
}

// Test 7: Current discipline query & state retention across navigation
{
  console.log('Test 7: Current discipline query & state retention across navigation');
  const modal = new PhysicsDisciplineModal({
    onBackToDisciplines: () => {},
  });

  assert.strictEqual(modal.getCurrentLevel(), 1);

  modal.showLevel2('optics');
  assert.strictEqual(modal.getCurrentLevel(), 2);
  assert.strictEqual(modal.getCurrentDiscipline(), 'optics');

  modal.showLevel2('thermo');
  assert.strictEqual(modal.getCurrentLevel(), 2);
  assert.strictEqual(modal.getCurrentDiscipline(), 'thermo');

  modal.showLevel2('em');
  assert.strictEqual(modal.getCurrentLevel(), 2);
  assert.strictEqual(modal.getCurrentDiscipline(), 'em');

  modal.showLevel2('mechanics');
  assert.strictEqual(modal.getCurrentLevel(), 2);
  assert.strictEqual(modal.getCurrentDiscipline(), 'mechanics');

  modal.goBack();
  assert.strictEqual(modal.getCurrentLevel(), 1);

  console.log('✓ Test 7 passed: Discipline state and query verified\n');
}

console.log('========================================================');
console.log('All Physics Discipline Modal Tests Passed (7/7)!');
console.log('========================================================\n');

