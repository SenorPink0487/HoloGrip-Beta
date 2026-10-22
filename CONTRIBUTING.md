# 参与贡献 HoloGrip

感谢你愿意为 HoloGrip 做贡献！无论是新增实验、修正物理模型、改进 3D 建模，还是完善文档与翻译，都非常欢迎。

## 开始之前

1. 浏览 [Issues](https://github.com/SenorPink0487/HoloGrip-Beta/issues)，确认没有重复的问题或提议。
2. 较大的改动（新实验、架构调整）请先开 Issue 讨论方案。
3. 阅读 [docs/ARCHITECTURE_STANDARDS.md](docs/ARCHITECTURE_STANDARDS.md) 与仓库根目录的 [AGENTS.md](AGENTS.md) 设计规范。

## 本地开发

```sh
npm install
npm run dev          # 前端开发服务器
npm run type-check   # 类型检查
npm test             # 前端测试
```

后端（可选）：

```sh
cp server/.env.example server/.env
docker compose -f server/docker-compose.yml up -d
npm run server
cargo test --manifest-path server/Cargo.toml
```

## 设计准则（请务必遵守）

- **纯演示工具定位**：不加入答题评分、闯关、强制引导等非演示功能。
- **零弹窗**：3D 实验视窗内不注入 DOM 弹窗、横幅、Toast 或浮动向导，交互反馈通过 3D 实体本身完成。
- **高保真建模**：禁止用未经修饰的 `BoxGeometry` / `CylinderGeometry` 粗暴拼接器材；需要倒角、滚花、刻度等真实机械细节。
- **材质规范**：避免大面积死黑材质；使用银铝、镜面铬、香槟黄铜、光学玻璃、深海蓝显示屏等配色体系。
- **正对操作者**：刻度、显示屏与旋钮朝向 +Z（操作者方向），长导轨沿 X 轴排布。
- **算渲分离**：重计算放进 Worker，核心算法不得依赖 `window` / `document`，保证在 Node 中可测试。
- **界面不使用 emoji**。

## 新增一个实验

1. 在 `src/experiments/catalog/<学科>-<名称>/` 下创建 `meta.ts`（名称、分类、参数定义）与 `index.ts`（实验生命周期）。
2. 在 `src/scene/<学科>/` 下实现器材网格（`*Mesh.ts`）与交互管理器（`*InteractionManager.ts`）。
3. 数值模型放在纯 TypeScript 模块中，并在 `tests/` 下添加对应测试，加入 `package.json` 的 `test` 脚本。
4. 确保 `npm run type-check` 与 `npm test` 全部通过。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)，scope 对应学科或模块：

```text
feat(optics): add Michelson interferometer experiment
fix(mech): correct rolling resistance on Galileo incline
docs(whiteboard): clarify reconnect protocol
```

## Pull Request 流程

1. Fork 仓库并从 `main` 创建分支。
2. 保持 PR 聚焦单一主题，附上截图或录屏（涉及 3D 视觉改动时）。
3. 确保 CI 通过，并填写 PR 模板。
4. 维护者审阅后合并。

## 许可证

提交贡献即表示你同意你的贡献以 [AGPL-3.0](LICENSE) 授权发布。
