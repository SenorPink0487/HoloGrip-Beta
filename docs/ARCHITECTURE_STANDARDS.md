# HoloGrip 实验引擎统一开发架构规范 (Architecture & Performance Standards)

本规范为 **HoloGrip 虚拟实验室系统** 的强制性工程架构标准，面向后续所有物理学科（**力学、热学、电磁学、光学**）与复杂化学仿真的开发实施。

---

## 核心设计哲学

1. **纯粹教辅工具定位 (Pure Teaching Demonstration Instrument)**
   - 本系统为教师在教室大屏、投影仪或头显前**演示物理与化学现象**的专业仪器。
   - **严禁**添加任何主动式做题、答题评分、闯关解锁、强制教学引导机器人对话等非演示功能。
2. **严禁 Emoji 图案 (Strictly Zero Emojis)**
   - 全局界面、按钮、日志、卡片及图表中**绝对禁止使用任何 emoji 图标**。
   - 统一采用严谨的 **Apple SF Symbols 规范矢量线条 SVG**，视觉语言克制、学术、沉稳。
3. **Apple 硬件工业质感与空间玻璃设计 (Apple Industrial & Spatial HIG)**
   - 3D 实体器材建模采用航空级一体成型阳极氧化铝（深空灰 / 银色）、高光倒角、物理光学多层镀膜玻璃（`MeshPhysicalMaterial`）；
   - 悬浮屏遵循 VisionOS 空间磨砂玻璃质感（`backdrop-filter: blur(40px) saturate(210%)`），排版采用 `-apple-system`, `SF Pro Display`, `SF Mono` 等宽数字。

---

## 五大强制技术规范 (The 5 Mandatory Technical Rules)

### 规范 1：算渲彻底分离律 (Compute/Render Decoupling)

- **触发红线**：
  凡属于以下任一场景的计算，**坚决禁止在主线程（UI / WebGL 渲染线程）直接同步计算**：
  1. 粒子数 $N > 100$ 的动力学步进（如天体 N-Body、分子运动论）；
  2. 空间网格分辨率 $> 128 \times 128$ 的连续场数值求解（如波动 PDE、电磁场矢量微积分）；
  3. 像素点数 $> 10000$ 且包含三角函数、贝塞尔函数、特殊函数迭代的矩阵计算（如光学干涉衍射条纹）；
  4. 耗时预估 $> 2.0\text{ms}$ 的数学逻辑。
- **架构约束**：
  - 必须将纯物理数学逻辑封装于独立的无 DOM 依赖模块（如 `*Math.ts`）；
  - 必须通过 `WorkerPool.ts` 分发到后台多核 Web Worker 线程池中并行解算，释放主线程 16.6ms / 8.3ms 的高刷新率预算。

### 规范 2：零拷贝内存直传协议 (Zero-Copy Transfer Protocol)

- **传输载体**：
  - 线程间通信禁止传递嵌套的大型 JavaScript 业务对象或 JSON 字符串；
  - 必须统一使用 `ArrayBuffer` 或其视图（`Float32Array`, `Uint8ClampedArray` 等二进制连续内存）。
- **所有权转移 (Transferable Objects)**：
  - 在 Worker 向主线程回传、或主线程向 Worker 派发重型数据时，必须声明转移列表：
    ```ts
    // 正确示例：转移 ArrayBuffer 所有权，耗时 < 0.1ms
    ctx.postMessage(response, [pixels.buffer]);
    ```
  - 彻底规避百兆级别内存的 Structured Clone 深拷贝开销，消除 GC 停顿与内存泄漏。

### 规范 3：防堆积最新帧节流管道 (LIFO / Frame Coalescing)

- **痛点场景**：
  当教师在界面快速滑动参数滑块（如高刷屏以 120Hz 产生事件）时，若无节流地连续向 Worker 发送计算任务，将产生严重的任务积压与界面延迟滞后（橡皮筋手感）。
- **强制模式（Frame Coalescing 状态机）**：
  ```ts
  if (this.isComputing) {
    // 仅暂存最新的目标参数，主动丢弃过时的中间帧
    this.pendingParams = latestParams;
    return;
  }
  this.isComputing = true;
  this.dispatchWorker(latestParams);
  ```
  Worker 计算完成后，在 `finally` 块中检查并立即派发积攒的 `pendingParams`。此举可确保：无论用户拖动多快，主线程与 Worker 始终只计算最新的一帧。

### 规范 4：双轨同构与容灾回退 (Isomorphic Fallback)

- **同构解耦标准**：
  所有底层算法核心（如 `OpticsMath.ts`, `MechanicsMath.ts`）不得依赖任何宿主特定 API（如 `window`, `document`, `HTMLCanvasElement`）。
- **回退策略**：
  - 必须同时支持多线程并发执行与单线程同步调用两种模式；
  - 当处于无 Web Worker 环境（如 Node.js CLI 自动化测试 `node --experimental-strip-types`）或 Worker 发生运行时异常时，调用层能够无缝回退至同步数学计算，保证系统 100% 可测与高容错性。

### 规范 5：教学高阶辅助视窗设计规范 (Teacher Utility Deck)

- 每一个物理与化学实验面板，除参数调节滑块外，必须至少标配两项**教师专属大屏讲台工具**：
  1. **一键复位黄金教学位**：迅速还原为国家教案推荐的标准黄金实验参数组合；
  2. **同屏对比/高精量化视窗**：
     - 光学：同屏条纹快照对比 + 虚拟测微双游标标尺；
     - 力学：能量守恒柱状图 + 动能/势能实时相位轨迹；
     - 热学：麦克斯韦分子速率分布曲线对比 + PV 相图卡诺循环热机效率仪表；
     - 电磁学：空间单点探针磁感应强度定量读数 + 磁通量积分实时计算。

---

## 各学科技术落地蓝图

### 1. 光学板块 (Optics) [当前参考标准实现]
- **Worker 任务**：`OPTICS_FRINGE_STEP`（单双缝、艾里斑、光栅、偏振光斑矩阵解算）；
- **内存协议**：`pixels: Uint8ClampedArray`，尺寸 $1024 \times 256$，`[pixels.buffer]` 直传；
- **渲染落地**：主线程 `< 0.2ms` `ctx.putImageData` 更新 `CanvasTexture`。

### 2. 力学板块 (Mechanics) [规划中]
- **Worker 任务**：`MECHANICS_STEP`（引力多体、双摆混沌动力学、多刚体碰撞）；
- **内存协议**：`positions: Float32Array`, `velocities: Float32Array` 双缓冲交换；
- **渲染落地**：主线程直接更新 Three.js `InstancedMesh` 矩阵，无 CPU 组装开销。

### 3. 热学板块 (Thermodynamics) [规划中]
- **Worker 任务**：`THERMO_GAS_STEP`（空间哈希网格碰撞、分子速率统计分布直方图统计）；
- **内存协议**：粒子坐标缓冲 + 速率直方图 `counts: Uint32Array`；
- **渲染落地**：分子球流 `Points` / `InstancedMesh` + Canvas 实时麦克斯韦分布曲线。

### 4. 电磁学板块 (Electromagnetism) [规划中]
- **Worker 任务**：`EM_FIELD_STEP`（毕奥-萨伐尔定律 3D 网格矢量场积分计算）；
- **内存协议**：三维网格矢量磁感应强度 `bField: Float32Array`；
- **渲染落地**：带方向箭头的场线切片或体积流线粒子渲染。

---

## iPad 版本发布与安装规范

每次交付 iPad 版本，都必须生成可独立运行的 iPadOS Release 应用，并安装到用户的 iPad 上核对版本和启动状态。不得把 Vite 开发服务器、热更新页面或 localhost API 当作交付物。

### 构建要求

- 前端必须使用 `npm run build:ios`，该脚本以 `ios-production` 模式构建，并使用 `.env.ios-production` 中的生产 API 配置。部署版 API 为 `https://hologrip.cn/account-service`；DeepSeek 等服务密钥只放在后端环境变量中，不打入 App。
- 原生应用必须使用 Tauri iOS `release` 配置，目标架构为设备 `aarch64`，生成 `.ipa`。直接安装到已登记的 iPad 时使用 `--export-method debugging` 和对应设备的 Apple 开发签名；这表示签名/分发方式，不代表使用 Debug 编译。
- 使用 iOS/iPadOS 27 SDK 构建时，必须在 `src-tauri/Info.ios.plist` 声明有效的 `UIApplicationSceneManifest`，并配置 `TaoSceneDelegate`。当前 Tauri 2 仍约束 Tao `0.35.x`，Scene 生命周期的 Release 构建还必须保留 `src-tauri/Cargo.toml` 与 `Cargo.lock` 中针对上游 Tao 提交 `f2163508` 的 use-after-free 修复；Scene manifest 与 Tao 修复必须一起交付，避免应用在启动时被系统终止。
- 调用 Tauri 构建时，将 `beforeBuildCommand` 覆盖为 `npm run build:ios`，避免默认桌面构建脚本额外运行性能测试：
  ```sh
  npx tauri ios build --target aarch64 --export-method debugging --build-number <递增构建号> --ci \
    --config '{"version":"<递增版本号>","build":{"beforeBuildCommand":"npm run build:ios"}}'
  ```
- 每次交付都要递增应用版本号和构建号，检查 IPA 内的 `CFBundleShortVersionString`、`CFBundleVersion` 与 `com.virtuallab.app` Bundle ID，避免设备继续显示旧版本。
- 交付的 IPA 应保存在 `src-tauri/gen/apple/build/arm64/HoloGrip.ipa`，并在完成后提供可下载文件链接。

### 安装与交付核对

- 将生成的 IPA 解包后，把其中的 `Payload/HoloGrip.app` 安装到用户已连接且已登记签名配置的 iPad；不得只构建 IPA 后就宣称部署完成。
- 安装后从设备启动 `com.virtuallab.app`，并用设备应用信息确认显示版本和构建号与本次产物相符。
- 核对生产 API 地址已进入前端构建产物，必要时请求健康检查和关键 API，确认线上服务可用。
- 直接设备安装使用开发签名时，说明该 IPA 面向已登记设备安装；若用户要求 TestFlight 或 App Store 发布，需改用相应 Apple 分发签名与发布配置。
