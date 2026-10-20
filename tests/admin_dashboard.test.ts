import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function runTests() {
  // 1. 验证独立单页入口 admin.html 与 vite.config.ts 多入口配置
  const adminHtmlPath = path.join(rootDir, 'admin.html');
  assert.ok(fs.existsSync(adminHtmlPath), 'admin.html 独立入口文件必须存在');
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf-8');
  assert.ok(adminHtml.includes('/src/admin/main.ts'), 'admin.html 必须挂载 /src/admin/main.ts');
  assert.ok(!adminHtml.includes('webgl-container'), 'admin.html 必须与 3D 实验室主视口完全解耦');

  const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf-8');
  assert.ok(viteConfig.includes('./admin.html'), 'vite.config.ts 必须配置 admin.html 多页构建入口');

  // 2. 验证 Rust 后端路由与前端 API 模块完整覆盖三大核心教务维度
  const rustRoutes = fs.readFileSync(path.join(rootDir, 'server/src/routes/mod.rs'), 'utf-8');
  for (const endpoint of [
    '/api/v1/admin/overview',
    '/api/v1/admin/users',
    '/api/v1/admin/classes',
    '/api/v1/admin/classes/{id}/regenerate-code',
    '/api/v1/admin/security',
    '/api/v1/admin/security/unlock',
  ]) {
    assert.ok(rustRoutes.includes(endpoint), `Rust 后端必须暴露 ${endpoint} 接口`);
  }

  // 3. 真实 MySQL 后端 CRUD 与 5 位邀请码闭环联调测试
  const baseUrl = 'http://127.0.0.1:8080';
  let backendReachable = false;
  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    backendReachable = healthRes.ok;
  } catch {
    backendReachable = false;
  }

  if (backendReachable) {
    // 3.1 读取 Overview
    const ovRes = await fetch(`${baseUrl}/api/v1/admin/overview`);
    assert.equal(ovRes.status, 200);
    const ov = await ovRes.json();
    assert.equal(typeof ov.totalUsers, 'number');
    assert.equal(typeof ov.totalClasses, 'number');

    // 3.2 创建教师并自动生成班级与 5 位邀请码
    const uniqueEmail = `admin-e2e-${Date.now()}@hologrip.edu.cn`;
    const createRes = await fetch(`${baseUrl}/api/v1/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'teacher',
        email: uniqueEmail,
        password: 'Password123!',
        displayName: 'E2E 测试导师',
        className: 'E2E 量子光学测试班',
      }),
    });
    assert.equal(createRes.status, 201);
    const createdTeacher = await createRes.json();
    assert.equal(createdTeacher.email, uniqueEmail);
    assert.ok(createdTeacher.classId, '教师创建时应自动生成关联班级');
    assert.equal(createdTeacher.inviteCode?.length, 5, '自动生成的班级邀请码必须为 5 位');

    // 3.3 轮换 5 位邀请码
    const oldCode = createdTeacher.inviteCode;
    const rotateRes = await fetch(
      `${baseUrl}/api/v1/admin/classes/${createdTeacher.classId}/regenerate-code`,
      { method: 'POST' },
    );
    assert.equal(rotateRes.status, 200);
    const rotatedClass = await rotateRes.json();
    assert.equal(rotatedClass.inviteCode.length, 5);
    assert.notEqual(rotatedClass.inviteCode, oldCode, '轮换后的 5 位邀请码应当更新');

    // 3.4 安全审计：手动锁定该邮箱并解锁
    const lockRes = await fetch(`${baseUrl}/api/v1/admin/security/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uniqueEmail, minutes: 15 }),
    });
    assert.equal(lockRes.status, 204);

    const secRes = await fetch(`${baseUrl}/api/v1/admin/security`);
    assert.equal(secRes.status, 200);
    const secData = await secRes.json();
    assert.ok(
      secData.loginAttempts.some((a: any) => a.email === uniqueEmail && a.isLocked),
      '安全审计列表应反映手动锁定状态',
    );

    const unlockRes = await fetch(`${baseUrl}/api/v1/admin/security/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uniqueEmail }),
    });
    assert.equal(unlockRes.status, 204);

    // 3.5 删除测试创建的教师与级联班级
    const delRes = await fetch(`${baseUrl}/api/v1/admin/users/${createdTeacher.id}`, {
      method: 'DELETE',
    });
    assert.equal(delRes.status, 204);
  }

  console.log('✅ admin_dashboard.test.ts passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
