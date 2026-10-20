# 管理页面

本地入口：`http://localhost:5173/admin`（或 `/admin.html`）。生产静态站点需将 `/admin`、`/admin/` 指向构建产物 `admin.html`。

所有 `/api/v1/admin/*` 接口都要求有效登录和数据库中的 `is_admin` 权限。未登录返回 401，教师和学生的普通账号返回 403。管理员权限独立于教学身份；公开注册无法获得管理权限。

管理页面支持用户的创建、删除、姓名与邮箱编辑、密码重设、教师/学生身份调整、班级分配、管理员授权与取消授权，以及用户偏好设置。管理员也能管理班级、邀请码、学生名单、账号锁定与设备会话。密码使用 Argon2id 哈希存储，不返回原密码。取消权限、重设密码和删除账号会让旧登录失效；最后一位管理员不能被删除或取消权限。

## 一次性清空业务数据

在私有环境变量中设置 `DATABASE_URL`、`JWT_SECRET`、`RESET_ADMIN_EMAIL`、`RESET_ADMIN_NAME`、`RESET_ADMIN_PASSWORD`，然后执行：

```sh
cargo run --manifest-path server/Cargo.toml --bin reset-data -- --confirm-reset
```

命令先应用迁移，再在一个事务中清空账号、班级、成员、白板、操作历史、登录记录和会话，最后创建唯一的初始管理员。正常启动不会调用重置逻辑。密码不得写入前端源码、提交的配置文件或日志。

正常启动：`npm run server`。测试：`cargo test --manifest-path server/Cargo.toml`，集成测试仅使用独立的 `virtuallab_test` 数据库。
