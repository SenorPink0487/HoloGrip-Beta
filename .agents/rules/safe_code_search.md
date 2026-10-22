---
trigger: always_on
description: 严禁在工作区根目录执行无排除选项的递归 grep，必须使用 git grep 或限定在源码目录
---

# 代码搜索规范与防高负载进程铁律 (Safe Code Search Standard)

1. **绝对禁止在仓库根目录直接执行无排除项的 `grep -rn <pattern> .`**：
   - 本项目包含 Tauri/Rust 编译缓存目录 `src-tauri/target/`（包含超 12GB 的二进制编译缓存文件 `index.v1`）、`node_modules/` 与 `dist/`。
   - 直接在根目录执行不带过滤的系统原生 `grep -rn .` 会逐字节读取数十吉字节（GB）的二进制缓存，造成 CPU 单核或多核瞬间被打满至 90%~100%，耗时数小时且无法退出，甚至在终端关闭后沦为常驻孤儿进程。

2. **强制使用安全高效的检索命令**：
   - **首选**：使用 `git grep -in "<keyword>"`，自动遵守 `.gitignore`，自动跳过二进制与编译缓存，执行时间仅需数十毫秒。
   - **限定目录检索**：仅在源码与测试目录搜索，例如 `grep -rn "<keyword>" src/ tests/`。
   - **显式排除**：若必须使用 `grep` 搜索根目录，必须添加 `--exclude-dir` 参数，例如：
     ```bash
     grep -rn --exclude-dir={node_modules,target,.git,dist} "<keyword>" .
     ```
