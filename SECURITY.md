# 安全策略 / Security Policy

## 支持的版本

HoloGrip 目前处于 Beta 阶段，仅 `main` 分支的最新版本接收安全修复。

## 报告漏洞

**请不要通过公开 Issue 报告安全漏洞。**

请使用 GitHub 的 [Private vulnerability reporting](https://github.com/SenorPink0487/HoloGrip-Beta/security/advisories/new) 私下提交，并尽量包含：

- 受影响的组件（前端、Rust 后端、白板 WebSocket、Tauri 外壳等）
- 复现步骤或概念验证
- 可能的影响范围

我们会在 **72 小时内**确认收到，并在修复发布后公开致谢（如你愿意）。

## 安全设计要点

- 密码使用 Argon2id 哈希存储；访问令牌为短期 JWT，配合可撤销的刷新会话。
- 第三方 AI 服务的 API 密钥只存在于服务端环境变量，不会打包进前端或客户端应用。
- 白板 WebSocket 使用一次性、30 秒有效的连接票据，并在握手与心跳时复核班级成员关系。
- 管理接口要求数据库中的管理员权限，与教学身份相互独立。
