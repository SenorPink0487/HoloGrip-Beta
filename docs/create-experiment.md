# 用 AI 创建你的第一个实验

这份指南写给想在 HoloGrip 上做自己课堂实验的老师。你不需要是专业程序员：会安装软件、会用 AI 编程助手（如 Cursor、Copilot、Claude、Gemini 等）对话就可以开始。

我们以「单摆周期」为例，从零做出一个可以隔空操作的新实验。

## 一、准备环境（只需一次）

1. 安装 [Node.js](https://nodejs.org/) 22.6 或更高版本（推荐 24）。
2. 下载项目并启动：

   ```sh
   git clone https://github.com/SenorPink0487/HoloGrip-Beta.git
   cd HoloGrip-Beta
   npm install
   npm run dev
   ```

3. 浏览器打开 <http://localhost:5173>，能看到实验室即表示环境就绪。

## 二、了解一个实验由什么组成

每个实验是 `src/experiments/catalog/` 下的**一个文件夹**，里面只有两个文件：

```text
src/experiments/catalog/mech-pendulum/
  meta.ts    实验名称、学科、说明、可调参数
  index.ts   3D 场景搭建与每一帧的更新逻辑
```

系统启动时会**自动扫描**这个目录，新文件夹放进去就会出现在实验目录里，不需要修改任何其他文件。

另外有三件事是框架替你完成的：

- **参数面板自动生成。** 在 `meta.ts` 的 `parameters` 里声明滑块、开关或下拉框，界面上就会出现对应控件。
- **手势自动可用。** 手势光标会转换为标准指针事件，你只要按鼠标交互来写（`onPointerDown` / `onPointerMove` / `onPointerUp`），隔空捏合就能直接操作。
- **资源自动释放。** 用 `this.track(...)` 包裹几何体和材质，切换实验时会自动回收显存。

建议把物理公式单独放在 `src/physics/` 下的纯函数文件里。这样它不依赖 3D 场景，可以写测试验证公式是否正确。

## 三、让 AI 帮你写

最稳妥的做法是**让 AI 参照一个现有实验来写**，而不是凭空生成。

1. 在 `src/experiments/catalog/` 里挑一个和你想做的最接近的实验，作为参照。
2. 把项目文件夹交给 AI 编程助手打开，然后发送类似下面的提示词：

   ```text
   请参照 src/experiments/catalog/mech-free-fall 的结构，
   在 src/experiments/catalog/mech-pendulum/ 下新建一个“单摆周期”实验：

   - 教学目标：让学生观察单摆周期只与摆长有关，与摆角（小角度）无关
   - 可调参数：摆长 L（0.2~1.0 m）、初始摆角 θ₀（2°~15°）
   - 物理模型：小角度近似 T = 2π√(L/g)，放在 src/physics/mech/pendulum.ts，写成纯函数
   - 在 tests/ 下为物理模型写一个测试
   - 遵守 docs/ARCHITECTURE_STANDARDS.md 和 CONTRIBUTING.md 中的设计准则
   ```

3. 写清楚**教学目标**、**可调参数及范围**、**要用的公式**这三点，AI 生成的结果会准确得多。

## 四、参考代码

下面是一个最小可运行版本，已在本项目中通过类型检查和测试，可以和 AI 的输出对照。

**`src/physics/mech/pendulum.ts`：物理模型**

```ts
/** 单摆小角度近似：周期 T = 2π√(L/g)，摆角 θ(t) = θ₀·cos(2πt/T)。 */
export const G = 9.8;

export function pendulumPeriod(lengthM: number, g = G): number {
  return 2 * Math.PI * Math.sqrt(lengthM / g);
}

export function pendulumAngle(t: number, lengthM: number, amplitudeRad: number, g = G): number {
  return amplitudeRad * Math.cos((2 * Math.PI * t) / pendulumPeriod(lengthM, g));
}
```

**`src/experiments/catalog/mech-pendulum/meta.ts`：实验信息与参数**

```ts
import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-pendulum',
  name: '单摆周期',
  category: 'mechanics',
  categoryName: '经典力学',
  description: '改变摆长与初始摆角，观察单摆周期只与摆长有关。',
  tags: ['力学', '单摆', '简谐运动', '周期'],
  icon: 'physics',
  equation: 'T = 2\\pi\\sqrt{L/g}',
  computeIntensity: 'low',
  parameters: [
    { id: 'length', name: '摆长 L', type: 'range', defaultValue: 0.5, min: 0.2, max: 1.0, step: 0.05, unit: 'm' },
    { id: 'amplitude', name: '初始摆角 θ₀', type: 'range', defaultValue: 10, min: 2, max: 15, step: 1, unit: '°' },
  ],
};
```

**`src/experiments/catalog/mech-pendulum/index.ts`：3D 场景与更新**

```ts
import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { pendulumAngle } from '../../../physics/mech/pendulum.ts';
import { metadata } from './meta.ts';

export default class PendulumExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  private readonly arm = new THREE.Group();
  private string!: THREE.Mesh;
  private bob!: THREE.Mesh;
  private time = 0;

  public init(context: ExperimentContext): void {
    // 实验台面中央，正对操作者（+Z）
    this.rootGroup.position.set(0, 1.2, 1.28);
    this.rootGroup.add(this.arm);

    const metal = this.track(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 }));
    const brass = this.track(new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.25 }));

    this.string = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.002, 0.002, 1, 12)), metal);
    this.bob = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.035, 48, 32)), brass);
    this.arm.add(this.string, this.bob);

    this.applyLength(context.getParameter<number>('length'));
  }

  public update(delta: number, _elapsed: number, context: ExperimentContext): void {
    this.time += delta;
    const length = context.getParameter<number>('length');
    const amplitude = THREE.MathUtils.degToRad(context.getParameter<number>('amplitude'));
    this.arm.rotation.z = pendulumAngle(this.time, length, amplitude);
  }

  public override onParameterChange(id: string, value: any): void {
    if (id === 'length') this.applyLength(value);
    this.time = 0; // 参数变化后从最大摆角重新释放
  }

  private applyLength(length: number): void {
    this.string.scale.y = length;
    this.string.position.y = -length / 2;
    this.bob.position.y = -length;
  }
}
```

**`tests/pendulum.test.ts`：验证公式**

```ts
import assert from 'node:assert';
import { pendulumPeriod, pendulumAngle } from '../src/physics/mech/pendulum.ts';

// 摆长 1 m 时周期约 2.007 s
assert.ok(Math.abs(pendulumPeriod(1) - 2.007) < 0.001);
// 摆长变为 4 倍，周期变为 2 倍
assert.ok(Math.abs(pendulumPeriod(4) / pendulumPeriod(1) - 2) < 1e-9);
// t = 0 时处于最大摆角，半个周期后到达另一侧
const T = pendulumPeriod(0.5);
assert.ok(Math.abs(pendulumAngle(0, 0.5, 0.2) - 0.2) < 1e-9);
assert.ok(Math.abs(pendulumAngle(T / 2, 0.5, 0.2) + 0.2) < 1e-9);

console.log('✓ pendulum tests passed');
```

> 这个示例为了便于理解，器材只用了最简单的几何体。正式提交到仓库的实验需要达到项目的建模标准（倒角、刻度、真实机械结构等），见 [CONTRIBUTING.md](../CONTRIBUTING.md#设计准则请务必遵守)。你可以在示例跑通后，让 AI 按照这些准则继续细化器材。

## 五、运行与检查

```sh
npm run dev                                              # 刷新页面，在力学目录中找到「单摆周期」
node --experimental-strip-types tests/pendulum.test.ts   # 验证物理公式
npm run type-check                                       # 检查代码类型
```

如果报错，把完整的报错信息直接粘贴给 AI，让它修复即可。

## 六、给 AI 提要求的技巧

- **先让公式对，再让画面好看。** 先让 AI 写物理模型和测试，确认数值正确，再做 3D 器材。
- **一次只改一件事。** 比如“把摆球换成带挂钩的黄铜砝码”“加一个能读数的角度刻度盘”，分多轮提出。
- **用教学语言描述。** “学生要能看到周期与摆长的平方根成正比”比“画一个图表”更容易得到你想要的结果。
- **要求遵守项目规范。** 在提示词里提到 `CONTRIBUTING.md` 的设计准则，AI 会避开弹窗、死黑材质等问题。

## 七、分享给其他老师

做好的实验欢迎提交回仓库，让更多课堂用上：

1. 在 GitHub 上 Fork 本仓库，把你的实验文件夹和测试提交到自己的 Fork。
2. 发起 Pull Request，附上一段操作录屏，并说明适用的年级和教学目标。
3. 维护者审阅后合并。

不熟悉 Git 也没关系，可以在 [Issues](https://github.com/SenorPink0487/HoloGrip-Beta/issues) 里描述你的实验和教学需求，或者直接附上代码文件。
