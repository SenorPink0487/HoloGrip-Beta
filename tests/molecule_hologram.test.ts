import assert from 'node:assert';
import * as THREE from 'three';

// -------------------------------------------------------------
// DOM Mock Environment for Headless Node.js Tests
// -------------------------------------------------------------
class MockDOMElement {
  public tagName: string;
  public className = '';
  public id = '';
  private _innerHTML = '';
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public textContent = '';
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public disabled = false;
  public tabIndex = 0;
  private elementCache = new Map<string, MockDOMElement>();

  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = [];

    const tagRegex = /<([a-zA-Z0-9]+)\s+([^>]*?)>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1];
      const attrsStr = match[2];
      const el = new MockDOMElement(tag);
      el.parentElement = this;

      const classMatch = attrsStr.match(/class="([^"]+)"/);
      if (classMatch) el.className = classMatch[1];

      const idMatch = attrsStr.match(/id="([^"]+)"/);
      if (idMatch) el.id = idMatch[1];

      const compIdMatch = attrsStr.match(/data-component-id="([^"]+)"/);
      if (compIdMatch) {
        el.dataset.componentId = compIdMatch[1];
        el.setAttribute('data-component-id', compIdMatch[1]);
      }

      const roleMatch = attrsStr.match(/role="([^"]+)"/);
      if (roleMatch) el.setAttribute('role', roleMatch[1]);

      const ariaPressed = attrsStr.match(/aria-pressed="([^"]+)"/);
      if (ariaPressed) el.setAttribute('aria-pressed', ariaPressed[1]);

      this.children.push(el);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name.startsWith('data-')) {
      const camel = name.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[camel] = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  hasAttribute(name: string): boolean {
    return name in this.attributes;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  appendChild(child: MockDOMElement): MockDOMElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockDOMElement): MockDOMElement {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove(): void {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e?: any) => void): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter((h) => h !== handler);
    }
  }

  click(): void {
    const evt = {
      target: this,
      clientX: 200,
      clientY: 200,
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    let cur: MockDOMElement | null = this;
    while (cur) {
      if (cur.eventListeners['click']) {
        for (const h of cur.eventListeners['click']) {
          h(evt);
        }
      }
      cur = cur.parentElement;
    }
  }

  closest(selector: string): any {
    const classes = selector.split(',').map((s) => s.trim().replace(/^\./, ''));
    let cur: MockDOMElement | null = this;
    while (cur) {
      for (const cls of classes) {
        if (cur.classList.contains(cls)) return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  public customBoundingRect?: { top: number; left: number; width: number; height: number; right?: number; bottom?: number };

  getBoundingClientRect() {
    if (this.customBoundingRect) {
      const r = this.customBoundingRect;
      return {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        right: r.right ?? r.left + r.width,
        bottom: r.bottom ?? r.top + r.height,
      };
    }
    return { top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 };
  }

  getContext(_type: string) {
    return {
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 }),
    };
  }

  blur(): void {}

  get classList() {
    return {
      add: (...clsList: string[]) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const cls of clsList) classes.add(cls);
        this.className = Array.from(classes).join(' ');
      },
      remove: (...clsList: string[]) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const cls of clsList) classes.delete(cls);
        this.className = Array.from(classes).join(' ');
      },
      toggle: (cls: string, force?: boolean) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force !== undefined ? force : !classes.has(cls);
        if (shouldAdd) classes.add(cls);
        else classes.delete(cls);
        this.className = Array.from(classes).join(' ');
        return shouldAdd;
      },
      contains: (cls: string) => {
        return this.className.split(/\s+/).includes(cls);
      },
    };
  }

  querySelector(selector: string): MockDOMElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    if (selector.includes('[data-component-id=')) {
      const match = selector.match(/data-component-id="([^"]+)"/);
      if (match) {
        const compId = match[1];
        if (this.dataset.componentId === compId) return this;
        for (const c of this.children) {
          const found = c.querySelector(selector);
          if (found) return found;
        }
      }
      return null;
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    return null;
  }

  querySelectorAll(selector = ''): MockDOMElement[] {
    const res: MockDOMElement[] = [];
    const check = (node: MockDOMElement) => {
      if (selector.includes(',')) {
        const parts = selector.split(',').map((s) => s.trim().replace(/^\./, ''));
        if (parts.some((p) => node.classList.contains(p))) res.push(node);
      } else if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (node.classList.contains(cls)) res.push(node);
      } else {
        res.push(node);
      }
      for (const c of node.children) check(c);
    };
    for (const c of this.children) check(c);
    return res;
  }
}

const mockDocBody = new MockDOMElement('body');
const mockDoc = {
  body: mockDocBody,
  createElement: (tag: string) => new MockDOMElement(tag),
  getElementById: (id: string) => {
    if (id === 'webgl-container') return mockDocBody;
    return mockDocBody.querySelector(`#${id}`);
  },
  querySelector: (sel: string) => mockDocBody.querySelector(sel),
  querySelectorAll: (sel: string) => mockDocBody.querySelectorAll(sel),
  addEventListener: (event: string, handler: any) => mockDocBody.addEventListener(event, handler),
  removeEventListener: (event: string, handler: any) => mockDocBody.removeEventListener(event, handler),
  activeElement: null as any,
};

(globalThis as any).document = mockDoc;
(globalThis as any).window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1.5,
  addEventListener: () => {},
  removeEventListener: () => {},
};

// -------------------------------------------------------------
// Imports (under mocked DOM)
// -------------------------------------------------------------
const { ChemistryEngine } = await import('../src/chemistry/ChemistryEngine.ts');
const {
  resolveMolecularStructure,
  getElementSpec,
  ELEMENT_SPECS,
} = await import('../src/chemistry/molecularStructures.ts');
const { ExperimentStatusCard } = await import('../src/ui/vision/ExperimentStatusCard.ts');
const { VisionModal } = await import('../src/ui/vision/VisionModal.ts');
const { MoleculeHologramStage } = await import('../src/scene/chemistry/MoleculeHologramStage.ts');

console.log('=== Starting Molecule Hologram 3D Feature Tests ===\n');

// -------------------------------------------------------------
// Test 1: Chemical Structure Resolution & Rigorous Geometry
// -------------------------------------------------------------
console.log('Test 1: Chemical Structure Resolution & Rigorous Geometry');

const testFormulas = [
  // 基础共价小分子与气体
  { formula: 'H2O', name: '水', expectedType: 'covalent' },
  { formula: 'CO2', name: '二氧化碳', expectedType: 'covalent' },
  { formula: 'HCl', name: '氯化氢', expectedType: 'covalent' },
  { formula: 'NH3', name: '氨气', expectedType: 'covalent' },
  { formula: 'CH4', name: '甲烷', expectedType: 'covalent' },
  { formula: 'H2', name: '氢气', expectedType: 'covalent' },
  { formula: 'O2', name: '氧气', expectedType: 'covalent' },
  { formula: 'N2', name: '氮气', expectedType: 'covalent' },
  { formula: 'Cl2', name: '氯气', expectedType: 'covalent' },
  { formula: 'SO2', name: '二氧化硫', expectedType: 'covalent' },
  { formula: 'H2O2', name: '过氧化氢', expectedType: 'covalent' },
  // 无机含氧酸与强酸
  { formula: 'H2SO4', name: '硫酸', expectedType: 'covalent' },
  { formula: 'HNO3', name: '硝酸', expectedType: 'covalent' },
  { formula: 'H2CO3', name: '碳酸', expectedType: 'covalent' },
  // 岩盐型 2x2x2 立方晶体
  { formula: 'NaCl', name: '氯化钠', expectedType: 'ionic-lattice' },
  { formula: 'KCl', name: '氯化钾', expectedType: 'ionic-lattice' },
  { formula: 'AgCl', name: '氯化银', expectedType: 'ionic-lattice' },
  // 多原子酸根盐与配位沉淀
  { formula: 'CuSO4', name: '硫酸铜', expectedType: 'polyatomic-salt' },
  { formula: 'FeSO4', name: '硫酸亚铁', expectedType: 'polyatomic-salt' },
  { formula: 'BaSO4', name: '硫酸钡', expectedType: 'polyatomic-salt' },
  { formula: 'CaCO3', name: '碳酸钙', expectedType: 'polyatomic-salt' },
  { formula: 'NaHCO3', name: '碳酸氢钠', expectedType: 'polyatomic-salt' },
  { formula: 'AgNO3', name: '硝酸银', expectedType: 'polyatomic-salt' },
  { formula: 'BaCl2', name: '氯化钡', expectedType: 'polyatomic-salt' },
  { formula: 'CuCl2', name: '氯化铜', expectedType: 'polyatomic-salt' },
  { formula: 'FeCl3', name: '三氯化铁', expectedType: 'polyatomic-salt' },
  { formula: 'NaOH', name: '氢氧化钠', expectedType: 'polyatomic-salt' },
  { formula: 'Cu(OH)2', name: '氢氧化铜', expectedType: 'polyatomic-salt' },
  { formula: 'Fe(OH)3', name: '氢氧化铁', expectedType: 'polyatomic-salt' },
  // 金属晶胞 (BCC / FCC / HCP)
  { formula: 'Fe', name: '铁单质', expectedType: 'metallic-lattice' },
  { formula: 'Cu', name: '铜单质', expectedType: 'metallic-lattice' },
  { formula: 'Mg', name: '镁单质', expectedType: 'metallic-lattice' },
  { formula: 'Zn', name: '锌单质', expectedType: 'metallic-lattice' },
  // 有机物与指示剂
  { formula: 'CH3COOH', name: '乙酸', expectedType: 'covalent' },
  { formula: 'C2H5OH', name: '乙醇', expectedType: 'covalent' },
  { formula: 'C6H12O6', name: '葡萄糖', expectedType: 'covalent' },
  { formula: 'C20H14O4', name: '酚酞', expectedType: 'covalent' },
  { formula: 'Litmus', name: '石蕊', expectedType: 'covalent' },
  // 离散离子与自由离子分布模式
  { formula: 'SO4_2-', name: '硫酸根离子', expectedType: 'covalent' },
  { formula: 'OH-', name: '氢氧根离子', expectedType: 'covalent' },
  { formula: 'Na+', name: '钠离子', expectedType: 'ion' },
  { formula: 'Cl-', name: '氯离子', expectedType: 'ion' },
  // 兜底通用 VSEPR 递归测试
  { formula: 'SF6', name: '六氟化硫', expectedType: 'covalent' },
  { formula: 'PCl5', name: '五氯化磷', expectedType: 'covalent' },
];

for (const testItem of testFormulas) {
  const def = resolveMolecularStructure(testItem.formula, testItem.name);
  assert.ok(def, `Structure definition must resolve for ${testItem.formula}`);
  assert.ok(def.atoms.length > 0, `Atoms count must be > 0 for ${testItem.formula}`);

  // 验证无 NaN 或无限大坐标
  for (const atom of def.atoms) {
    assert.ok(Number.isFinite(atom.position[0]), `Atom X must be finite for ${testItem.formula}`);
    assert.ok(Number.isFinite(atom.position[1]), `Atom Y must be finite for ${testItem.formula}`);
    assert.ok(Number.isFinite(atom.position[2]), `Atom Z must be finite for ${testItem.formula}`);

    const spec = getElementSpec(atom.element);
    assert.ok(spec, `Element visual spec must exist for ${atom.element}`);
    const r = (spec.color >> 16) & 0xff;
    const g = (spec.color >> 8) & 0xff;
    const b = spec.color & 0xff;
    assert.ok(r + g + b > 60, `Element color must not be pitch black for ${atom.element}`);
  }

  // 验证键连接索引合法性
  for (const bond of def.bonds) {
    assert.ok(bond.a >= 0 && bond.a < def.atoms.length, `Bond index a out of range in ${testItem.formula}`);
    assert.ok(bond.b >= 0 && bond.b < def.atoms.length, `Bond index b out of range in ${testItem.formula}`);
    assert.notStrictEqual(bond.a, bond.b, `Bond cannot connect an atom to itself in ${testItem.formula}`);
  }

  // 验证原子间非重叠
  if (def.atoms.length > 1) {
    for (let i = 0; i < def.atoms.length; i++) {
      for (let j = i + 1; j < def.atoms.length; j++) {
        const dx = def.atoms[i].position[0] - def.atoms[j].position[0];
        const dy = def.atoms[i].position[1] - def.atoms[j].position[1];
        const dz = def.atoms[i].position[2] - def.atoms[j].position[2];
        const dist = Math.hypot(dx, dy, dz);
        assert.ok(dist >= 0.15, `Atoms ${i} and ${j} in ${testItem.formula} overlap too closely (${dist})`);
      }
    }
  }
}
console.log('✓ Test 1 passed: All 40+ compounds and universal VSEPR fallbacks resolved chemically accurate 3D structures\n');

// -------------------------------------------------------------
// Test 2: Anti-Black Lab Material Specification Invariants
// -------------------------------------------------------------
console.log('Test 2: Anti-Black Lab Material Specification Invariants');

for (const [sym, spec] of Object.entries(ELEMENT_SPECS)) {
  const r = (spec.color >> 16) & 0xff;
  const g = (spec.color >> 8) & 0xff;
  const b = spec.color & 0xff;
  assert.ok(r + g + b >= 100, `Element ${sym} color 0x${spec.color.toString(16)} must be sufficiently bright`);
  assert.ok(spec.emissive > 0, `Element ${sym} must have subtle emissive glow for holographic vibrancy`);
  assert.ok(spec.radius > 0.25 && spec.radius < 1.0, `Element ${sym} radius must be proportional`);
}

// 重点验证碳 (C)：应为高科技航天铂钛灰银 (0x7c8ea6)
assert.strictEqual(ELEMENT_SPECS.C.color, 0x7c8ea6, 'Carbon must use aerospace satin platinum slate instead of black');
console.log('✓ Test 2 passed: All element visual specs strictly comply with anti-black premium laboratory standards\n');

// -------------------------------------------------------------
// Test 3: ExperimentStatusCard Compound Card Clicking & Selection
// -------------------------------------------------------------
console.log('Test 3: ExperimentStatusCard Compound Card Clicking & Selection');

const engine = new ChemistryEngine();
engine.addReagent('NaCl', 30); // 注入 NaCl
engine.addReagent('HCl', 20);  // 注入 HCl

let selectedCompoundReceived: any = null;
const statusCard = new ExperimentStatusCard(engine, {
  onSelectCompound: (comp) => {
    selectedCompoundReceived = comp;
  },
});

statusCard.updateState(engine.state);

// 初始状态下无选中化合物
assert.strictEqual(statusCard.getSelectedComponentId(), null);
assert.strictEqual(selectedCompoundReceived, null);

// 模拟点击 NaCl 卡片
const naclCard = statusCard.element.querySelector('.apple-solute-card[data-component-id="comp_NaCl"]') as MockDOMElement;
assert.ok(naclCard, 'NaCl card must be rendered in statusCard');
assert.ok(naclCard.classList.contains('clickable'), 'NaCl card must have clickable class');
assert.strictEqual(naclCard.getAttribute('role'), 'button', 'NaCl card must have role=button for accessibility & VisionPro cursor');

naclCard.click();
assert.strictEqual(statusCard.getSelectedComponentId(), 'comp_NaCl');
assert.ok(selectedCompoundReceived, 'onSelectCompound must be called on click');
assert.strictEqual(selectedCompoundReceived.formula, 'NaCl');
assert.ok(naclCard.classList.contains('is-selected'), 'Card must have .is-selected class');

// 再次点击相同卡片：触发反选切换（Deselect / Toggle Off）
naclCard.click();
assert.strictEqual(statusCard.getSelectedComponentId(), null);
assert.strictEqual(selectedCompoundReceived, null);
assert.ok(!naclCard.classList.contains('is-selected'), 'Card must remove .is-selected class on toggle off');

// 点击不同卡片（如 HCl）：切换至新化合物
const hclCard = statusCard.element.querySelector('.apple-solute-card[data-component-id="comp_HCl"]') as MockDOMElement;
assert.ok(hclCard, 'HCl card must be rendered');
hclCard.click();
assert.strictEqual(statusCard.getSelectedComponentId(), 'comp_HCl');
assert.strictEqual(selectedCompoundReceived.formula, 'HCl');
assert.ok(hclCard.classList.contains('is-selected'), 'HCl card must be selected');
assert.ok(!naclCard.classList.contains('is-selected'), 'NaCl card must not be selected');

// 切换烧杯（例如从左侧切换到右侧）：自动清空化合物选中状态
statusCard.selectBeaker('right');
assert.strictEqual(statusCard.getSelectedComponentId(), null);
assert.strictEqual(selectedCompoundReceived, null);

// 切换视角模式（化学物质 <-> 游离离子）：自动清空化合物选中状态
statusCard.selectBeaker('left');
hclCard.click();
assert.strictEqual(statusCard.getSelectedComponentId(), 'comp_HCl');

statusCard.setCompositionMode('ion');
assert.strictEqual(statusCard.getSelectedComponentId(), null);
assert.strictEqual(selectedCompoundReceived, null);

statusCard.destroy();
console.log('✓ Test 3 passed: ExperimentStatusCard card clicking, toggling, switching and beaker/mode resets verified\n');

// -------------------------------------------------------------
// Test 4: Dynamic Depletion Auto-Clear Invariant
// -------------------------------------------------------------
console.log('Test 4: Dynamic Depletion Auto-Clear Invariant');

const dynamicEngine = new ChemistryEngine();
dynamicEngine.addReagent('HCl', 20); // 20 mmol HCl
dynamicEngine.addReagent('NaOH', 10); // 10 mmol NaOH (HCl 剩余 10 mmol)

let lastCompound: any = null;
const cardForReaction = new ExperimentStatusCard(dynamicEngine, {
  onSelectCompound: (c) => {
    lastCompound = c;
  },
});
cardForReaction.updateState(dynamicEngine.state);

// 选中 HCl
cardForReaction.selectCompoundById('comp_HCl');
assert.strictEqual(cardForReaction.getSelectedComponentId(), 'comp_HCl');
assert.strictEqual(lastCompound.formula, 'HCl');

// 加入过量 NaOH (20 mmol)，使 HCl 完全被反应中和消耗掉
dynamicEngine.addReagent('NaOH', 20);
cardForReaction.updateState(dynamicEngine.state);

// HCl 已不再存在于体系中，应当自动清空选中状态并回调 null
assert.strictEqual(cardForReaction.getSelectedComponentId(), null);
assert.strictEqual(lastCompound, null);

cardForReaction.destroy();
console.log('✓ Test 4 passed: Disappearing or consumed compound automatically clears selection and notifies stage\n');

// -------------------------------------------------------------
// Test 5: VisionModal Integration & Tab/Close Cleanups
// -------------------------------------------------------------
console.log('Test 5: VisionModal Integration & Tab/Close Cleanups');

let modalSelectedCompound: any = null;
const visionModal = new VisionModal(engine, {
  onClose: () => {},
  onOpen: () => {},
  onSelectCompound: (comp) => {
    modalSelectedCompound = comp;
  },
});

// 打开烧杯选项卡并选中化合物
visionModal.open('beaker');
const beakerStatusCard = visionModal.experimentStatusCard;
assert.ok(beakerStatusCard, 'experimentStatusCard getter must be available on VisionModal');

beakerStatusCard.selectCompoundById('comp_NaCl');
assert.strictEqual(beakerStatusCard.getSelectedComponentId(), 'comp_NaCl');
assert.strictEqual(modalSelectedCompound?.formula, 'NaCl');

// 切换到元素周期表选项卡：应自动清空化合物选择
visionModal.switchTab('chemistry');
assert.strictEqual(beakerStatusCard.getSelectedComponentId(), null);
assert.strictEqual(modalSelectedCompound, null);

// 重新切回烧杯并选中，再调用 close()
visionModal.switchTab('beaker');
beakerStatusCard.selectCompoundById('comp_HCl');
assert.strictEqual(beakerStatusCard.getSelectedComponentId(), 'comp_HCl');

visionModal.close();
assert.strictEqual(beakerStatusCard.getSelectedComponentId(), null);
assert.strictEqual(modalSelectedCompound, null);

console.log('✓ Test 5 passed: VisionModal close and tab switches seamlessly dismiss active 3D compound model\n');

// -------------------------------------------------------------
// Test 6: MoleculeHologramStage Lifecycle & Spatial Math Invariants
// -------------------------------------------------------------
console.log('Test 6: MoleculeHologramStage Lifecycle & Spatial Math Invariants');

const dummyContainer = mockDoc.createElement('div');
dummyContainer.id = 'webgl-container';
mockDocBody.appendChild(dummyContainer);

const stage = new MoleculeHologramStage(dummyContainer as any);

assert.strictEqual(stage.isVisible(), false);
assert.strictEqual(stage.getActiveCompound(), null);

// 展示化合物模型
stage.showCompound({ id: 'NaCl', formula: 'NaCl', name: '氯化钠' });
assert.ok(stage.getActiveCompound(), 'Active compound must be set');
assert.strictEqual(stage.getActiveCompound()?.id, 'NaCl');
assert.ok(stage.getActiveStructure(), 'Active structure must be parsed');
assert.strictEqual(stage.getActiveStructure()?.key, 'NaCl');

// 模拟空间视窗在 3D 空间中的变换 (例如位于 (0, 2.2, 0)，朝向正南)
const mockWindowObj = new THREE.Object3D();
mockWindowObj.position.set(0, 2.2, 0);
mockWindowObj.rotation.set(0, 0, 0); // local +Z is (0, 0, 1)

const mockCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
mockCamera.position.set(0, 2.2, 2.0); // 摄像机位于窗口前方 2 米处

// 模拟多帧更新
for (let i = 0; i < 20; i++) {
  stage.update(0.016, i * 0.016, mockCamera, mockWindowObj, 1.0, true);
}

assert.ok(stage.isVisible(), 'Stage must become visible after smooth spring entry');

// 检查空间位置关系：分子展示台的坐标必须严格处于视窗的前方正向 (+Z) 方向
const stageWorldPos = (stage as any).rootGroup.position as THREE.Vector3;
assert.ok(stageWorldPos.z > mockWindowObj.position.z, '3D molecule must float strictly in front of the spatial window (+Z)');
assert.ok(stageWorldPos.z < mockCamera.position.z, '3D molecule must float behind the camera (not clipped)');
assert.ok(stageWorldPos.y < mockWindowObj.position.y, '3D molecule must be centered in the lower showcase area');

// 验证模型使用适合展台的空间单位比例，分子整体尺寸由原子数量与结构决定。
const molScale = (stage as any).moleculeGroup.scale.x;
assert.ok(molScale > 0.005 && molScale < 0.20, `Molecule effective scale (${molScale}) must be compact and non-obstructive`);

// 测试隐藏并关闭
stage.hide();
assert.strictEqual(stage.getActiveCompound(), null);

// 多帧更新后应当平滑淡出并休眠
for (let i = 0; i < 20; i++) {
  stage.update(0.016, i * 0.016, mockCamera, mockWindowObj, 1.0, false);
}
assert.strictEqual(stage.isVisible(), false);

stage.dispose();
dummyContainer.remove();

console.log('✓ Test 6 passed: MoleculeHologramStage spatial math, camera alignment and lifecycle verified\n');

// -------------------------------------------------------------
// Test 7: Strict Zero Floating DOM Modals & Banners Invariant
// -------------------------------------------------------------
console.log('Test 7: Strict Zero Floating DOM Modals & Banners Invariant');

const floatingModalElements = mockDocBody.querySelectorAll(
  '.modal-guide, .floating-step-banner, .floating-tooltip, .toast-notification, .floating-popup'
);
assert.strictEqual(floatingModalElements.length, 0, 'No floating DOM banners or modals are allowed in the 3D scene');
console.log('✓ Test 7 passed: Strict zero floating DOM modals/banners rule preserved\n');

// -------------------------------------------------------------
// Test 8: Molecular Structure Model Fixedly Centered In Front of Spatial Window
// -------------------------------------------------------------
console.log('Test 8: Molecular Structure Model Fixedly Centered In Front of Spatial Window');

const testContainer = mockDoc.createElement('div');
mockDocBody.appendChild(testContainer);
const stageAligned = new MoleculeHologramStage(testContainer as any);

// 创建模拟视窗框架 (1260px * 710px)
const mockFrame = mockDoc.createElement('div');
mockFrame.className = 'vision-window-frame';
mockFrame.customBoundingRect = { top: 100, left: 100, width: 1260, height: 710 };
mockDocBody.appendChild(mockFrame);

// 创建 4 个化合物卡片 (HCl, H2SO4, CO2, Na2SO4)
const cardDefinitions = [
  { id: 'comp_HCl', formula: 'HCl', name: '稀盐酸' },
  { id: 'comp_H2SO4', formula: 'H2SO4', name: '稀硫酸' },
  { id: 'gas_CO2', formula: 'CO2', name: '二氧化碳' },
  { id: 'comp_Na2SO4', formula: 'Na2SO4', name: '硫酸钠' },
];

const mockWindowObj3D = new THREE.Object3D();
mockWindowObj3D.position.set(0, 1.25, -0.2);
mockWindowObj3D.rotation.set(0, 0, 0);
mockWindowObj3D.scale.set(0.0028, 0.0028, 0.0028);

for (let i = 0; i < cardDefinitions.length; i++) {
  const cDef = cardDefinitions[i];
  stageAligned.showCompound({ id: cDef.id, formula: cDef.formula, name: cDef.name });

  // 运行多帧插值更新
  for (let f = 0; f < 30; f++) {
    stageAligned.update(0.016, f * 0.016, mockCamera, mockWindowObj3D, 1.0, true);
  }

  const curPos = (stageAligned as any).rootGroup.position as THREE.Vector3;

  // 验证 X 轴：必须固定居中 (curPos.x === 0)
  assert.ok(
    Math.abs(curPos.x) < 0.005,
    `Card ${cDef.formula} X position (${curPos.x.toFixed(3)}) must be fixedly centered at 0`
  );

  // 验证 Y 轴：必须处于全息展示区中央下方 (curPos.y < mockWindowObj3D.position.y)
  assert.ok(
    curPos.y < mockWindowObj3D.position.y,
    `Card ${cDef.formula} Y position must be centered in the showcase area below window center`
  );

  // 验证 Z 轴：严格在视窗前方 (+Z 方向)
  assert.ok(
    curPos.z > mockWindowObj3D.position.z,
    `Card ${cDef.formula} Z must be strictly in front of the window plane`
  );
}

stageAligned.dispose();
mockFrame.remove();
testContainer.remove();

console.log('✓ Test 8 passed: Molecular structure model always fixedly appears centered in front of the window\n');

// -------------------------------------------------------------
// Test 9: Stable Size Across First Open, Reopen and Compound Switches
// -------------------------------------------------------------
console.log('Test 9: Stable Size Across First Open, Reopen and Compound Switches');

for (const compound of [
  { id: 'H2O', formula: 'H2O', name: '水' },
  { id: 'NaCl', formula: 'NaCl', name: '氯化钠' },
  { id: 'C6H12O6', formula: 'C6H12O6', name: '葡萄糖' },
  { id: 'Na+', formula: 'Na+', name: '钠离子' },
]) {
  const container = mockDoc.createElement('div');
  mockDocBody.appendChild(container);
  const sizeStage = new MoleculeHologramStage(container as any);
  const model = (sizeStage as any).moleculeGroup as THREE.Group;
  const root = (sizeStage as any).rootGroup as THREE.Group;
  const windowObject = new THREE.Object3D();
  windowObject.position.set(0.4, 1.6, -0.3);
  windowObject.rotation.set(0.2, -0.35, 0.1);
  const settle = (visible: boolean) => {
    for (let frame = 0; frame < 120; frame++) {
      sizeStage.update(1 / 60, 0, mockCamera, windowObject, 1, visible);
    }
  };
  const readSize = () => new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());

  sizeStage.showCompound(compound);
  settle(true);
  const firstSize = readSize();
  const firstCenterOffset = new THREE.Box3().setFromObject(model)
    .getCenter(new THREE.Vector3()).sub(root.position);
  const assertStableSize = (context: string) => {
    settle(true);
    assert.ok(
      readSize().distanceTo(firstSize) < 1e-8,
      `${compound.formula} must keep its first-open size after ${context}`
    );
    const centerOffset = new THREE.Box3().setFromObject(model)
      .getCenter(new THREE.Vector3()).sub(root.position);
    assert.ok(centerOffset.distanceTo(firstCenterOffset) < 1e-8, `${compound.formula} must not drift on reopening`);
  };

  sizeStage.hide();
  settle(false);
  sizeStage.showCompound(compound);
  assertStableSize('closing and reopening');

  sizeStage.showCompound({ id: 'CO2', formula: 'CO2', name: '二氧化碳' });
  settle(true);
  sizeStage.showCompound(compound);
  assertStableSize('switching to another compound and back');

  (sizeStage as any).targetUserZoom = 2.4;
  settle(true);
  sizeStage.hide();
  sizeStage.update(1 / 60, 0, mockCamera, windowObject, 1, false);
  sizeStage.showCompound(compound);
  assertStableSize('zooming and reopening during the exit animation');

  sizeStage.dispose();
  container.remove();
}

console.log('✓ Test 9 passed: First-open size, centering and subsequent display sizes remain consistent\n');

// -------------------------------------------------------------
// Test 10: Identical Elements Keep Their Atomic Radii Across Molecules
// -------------------------------------------------------------
console.log('Test 10: Consistent atomic radii across small molecules, large molecules and ions');

const atomSizeContainer = mockDoc.createElement('div');
mockDocBody.appendChild(atomSizeContainer);
const atomSizeStage = new MoleculeHologramStage(atomSizeContainer as any);
const atomicRadii = new Map<string, number>();
const compoundSizes = new Map<string, number>();

for (const formula of ['H2O', 'CO2', 'CH4', 'C6H12O6', 'NaCl', 'Na+', 'Cl-', 'H2O']) {
  atomSizeStage.showCompound({ id: formula, formula, name: formula });
  for (let frame = 0; frame < 180; frame++) {
    atomSizeStage.update(1 / 60, 0, mockCamera, mockWindowObj, 1, true);
  }
  const model = (atomSizeStage as any).moleculeGroup as THREE.Group;
  model.updateWorldMatrix(true, true);
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.userData.isAtom) return;
    object.geometry.computeBoundingSphere();
    const sphere = object.geometry.boundingSphere!.clone().applyMatrix4(object.matrixWorld);
    const element = object.userData.element as string;
    if (atomicRadii.has(element)) {
      assert.ok(
        Math.abs(sphere.radius - atomicRadii.get(element)!) < 1e-10,
        `${element} must have the same radius in ${formula}, independent of the molecule's total size`
      );
    } else {
      atomicRadii.set(element, sphere.radius);
    }
  });
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  compoundSizes.set(formula, size.length());
}

assert.ok(
  compoundSizes.get('C6H12O6')! > compoundSizes.get('H2O')! * 2,
  'Larger molecules must occupy more space instead of shrinking their atoms to the same overall size'
);
assert.ok(
  Math.abs(atomicRadii.get('H')! / atomicRadii.get('O')! - getElementSpec('H').radius / getElementSpec('O').radius) < 1e-6,
  'The existing relative radii of different elements must be preserved'
);
atomSizeStage.dispose();
atomSizeContainer.remove();
console.log('✓ Test 10 passed: Atomic radii stay consistent while overall size follows molecular structure\n');

console.log('========================================================');
console.log('All Molecule Hologram 3D Feature Tests Passed Successfully!');
console.log('========================================================');
