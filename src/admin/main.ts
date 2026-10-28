import { adminApi, type AdminClass, type AdminOverview, type AdminUser, type SecurityAuditData } from './api.ts';
import { adminLogin, adminLogout, getAdminUser, restoreAdmin } from './session.ts';

type Page = 'overview' | 'users' | 'classes' | 'security';
const root = document.querySelector<HTMLDivElement>('#admin-root')!;
const state = {
  page: 'overview' as Page, users: [] as AdminUser[], classes: [] as AdminClass[],
  overview: null as AdminOverview | null, security: null as SecurityAuditData | null,
  query: '', filter: 'all', editor: null as { kind: 'user' | 'class'; id?: string } | null,
  message: '', error: false, loading: false,
};
const labels: Record<Page, string> = { overview: '概览', users: '用户', classes: '班级', security: '登录与安全' };
const paths: Record<Page, string> = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
  classes: '<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4zM12 5v15"/>',
  security: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
};
function icon(page: Page): string { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${paths[page]}</svg>`; }
function esc(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
function date(value: string | null): string { return value ? new Date(value).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
function errorText(error: unknown): string { return error instanceof TypeError ? '无法连接服务，请检查网络后重试。' : error instanceof Error ? error.message : '操作失败，请重试。'; }
function notice(message = '', error = false): void {
  state.message = message; state.error = error;
  const target = document.querySelector<HTMLElement>('#notice');
  if (target) { target.textContent = message; target.classList.toggle('error', error); }
}
function empty(message: string, cols = 5): string { return `<tr><td colspan="${cols}" class="empty">${message}</td></tr>`; }
function field(label: string, input: string, help = ''): string { return `<label class="field"><span>${label}</span>${input}${help ? `<small>${help}</small>` : ''}</label>`; }
function actions(): string { return '<div class="form-actions"><button class="primary" type="submit">保存更改</button><button type="button" data-close>取消</button></div>'; }

function loginView(message = '', error = false): void {
  state.overview = null; state.users = []; state.classes = []; state.security = null; state.editor = null;
  root.innerHTML = `<div class="login-page">
    <header class="login-header"><a class="wordmark" href="/">HoloGrip<span>®</span></a><span class="eyebrow">ADMINISTRATION</span></header>
    <main class="login-layout"><section class="login-intro"><p class="eyebrow">HOLOGRIP / 管理空间</p>
      <h1>让每一次探索，<br>都有序发生。</h1><p class="intro-copy">管理用户与班级，<br>为专注的教学留出空间。</p>
      <svg class="orbit-art" viewBox="0 0 460 240" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.2"><ellipse cx="230" cy="120" rx="175" ry="54" transform="rotate(-25 230 120)"/><ellipse cx="230" cy="120" rx="175" ry="54" transform="rotate(25 230 120)"/><ellipse cx="230" cy="120" rx="175" ry="54" transform="rotate(80 230 120)"/><circle cx="230" cy="120" r="12"/></g><circle cx="371" cy="53" r="6" fill="currentColor"/></svg>
    </section><section class="login-form-wrap"><p class="eyebrow">欢迎回来</p><h2>管理员登录</h2><p class="muted">使用具有管理权限的账号继续。</p>
      <form id="login-form">${field('邮箱', '<input name="email" type="email" autocomplete="username" placeholder="you@example.com" required maxlength="255">')}
      ${field('密码', '<input name="password" type="password" autocomplete="current-password" placeholder="输入你的密码" required>')}
      <p id="login-message" class="form-message ${error ? 'error' : ''}" role="status">${esc(message)}</p><button class="primary login-submit" type="submit">登录 <span aria-hidden="true">↗</span></button></form>
      <a class="back-link" href="/">← 返回实验室</a></section></main>
    <footer class="login-footer"><span>HoloGrip · 为探索而设计</span><span>用户与教学管理</span></footer></div>`;
  document.querySelector<HTMLFormElement>('#login-form')!.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button')!;
    const messageEl = document.querySelector<HTMLElement>('#login-message')!;
    button.disabled = true; button.textContent = '正在登录…'; messageEl.textContent = '';
    const data = new FormData(form);
    try {
      await adminLogin(String(data.get('email')).trim(), String(data.get('password')));
      form.reset(); state.page = 'overview'; state.message = ''; shell(); await load();
    } catch (err) {
      messageEl.textContent = errorText(err); messageEl.classList.add('error');
    } finally { button.disabled = false; button.innerHTML = '登录 <span aria-hidden="true">↗</span>'; }
  });
}
function shell(): void {
  const user = getAdminUser();
  if (!user) return;
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><a class="wordmark" href="/admin.html">HoloGrip<span>®</span></a><p class="sidebar-label">管理空间</p>
    <nav aria-label="管理导航">${(Object.keys(labels) as Page[]).map(page => `<button data-page="${page}" class="nav-item ${page === state.page ? 'active' : ''}" ${page === state.page ? 'aria-current="page"' : ''}>${icon(page)}${labels[page]}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><a class="lab-link" href="/">↗ 打开实验室</a><div class="identity"><span class="avatar">${esc((user.displayName || user.email).slice(0, 1))}</span><div><strong>${esc(user.displayName || user.email)}</strong><small>管理员</small></div><button class="logout" id="logout" title="退出登录" aria-label="退出登录">↪</button></div></div></aside>
    <main class="main"><header class="topline"><span>工作空间 <span class="breadcrumb">/ ${labels[state.page]}</span></span><button id="refresh" class="text-button">刷新数据 ↻</button></header>
    <div class="content"><div id="notice" class="notice ${state.error ? 'error' : ''}" role="status">${esc(state.message)}</div><div id="view"></div></div></main></div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(button => button.addEventListener('click', () => {
    state.page = button.dataset.page as Page; state.editor = null; state.query = ''; state.filter = 'all'; state.message = ''; shell(); render();
  }));
  document.querySelector('#logout')!.addEventListener('click', async () => { await adminLogout(); loginView(); });
  document.querySelector('#refresh')!.addEventListener('click', () => void load());
  render();
}
async function load(): Promise<void> {
  if (!getAdminUser() || state.loading) return;
  state.loading = true;
  const button = document.querySelector<HTMLButtonElement>('#refresh');
  if (button) { button.disabled = true; button.textContent = '正在更新…'; }
  try {
    const [overview, users, classes, security] = await Promise.all([adminApi.getOverview(), adminApi.listUsers(), adminApi.listClasses(), adminApi.getSecurityAudit()]);
    if (!getAdminUser()) return;
    Object.assign(state, { overview, users, classes, security });
    const current = getAdminUser();
    const fresh = users.find(u => u.id === current?.id);
    if (current && fresh && current.displayName !== fresh.displayName) {
      current.displayName = fresh.displayName; shell();
    } else render();
  } catch (err) { notice(errorText(err), true); }
  finally { state.loading = false; if (button) { button.disabled = false; button.textContent = '刷新数据 ↻'; } }
}
function heading(eyebrow: string, title: string, description: string, button = ''): string {
  return `<header class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="muted">${description}</p></div>${button}</header>`;
}
function userRows(users: AdminUser[], compact = false): string {
  return users.map(user => `<tr><td><button class="name-button" data-edit-user="${esc(user.id)}">${esc(user.displayName || '未命名用户')}</button><small class="table-sub">${esc(user.email)}</small></td>
    <td>${user.isAdmin ? '<span class="tag admin">管理员</span> ' : ''}<span class="role-label">${user.role === 'teacher' ? '教师' : '学生'}</span></td>
    ${compact ? '' : `<td>${esc(user.className || '未分配')}</td><td><span class="status ${user.isLocked ? 'locked' : ''}">${user.isLocked ? '已锁定' : '正常'}</span></td>`}
    <td><button class="text-button" data-edit-user="${esc(user.id)}">编辑 <span aria-hidden="true">↗</span></button></td></tr>`).join('') || empty('还没有符合条件的用户。', compact ? 3 : 5);
}
function render(): void {
  const view = document.querySelector<HTMLElement>('#view');
  if (!view || !getAdminUser()) return;
  if (!state.overview) {
    view.innerHTML = `${heading('WORKSPACE', '管理空间', '用户与教学，一处管理。')}<div class="empty page-empty">正在读取数据。连接失败时可点击上方「刷新数据」重试。</div>`;
    return;
  }
  if (state.page === 'overview') overviewView(view);
  if (state.page === 'users') usersView(view);
  if (state.page === 'classes') classesView(view);
  if (state.page === 'security') securityView(view);
  view.querySelectorAll<HTMLButtonElement>('[data-edit-user]').forEach(button => button.addEventListener('click', () => {
    state.page = 'users'; state.editor = { kind: 'user', id: button.dataset.editUser }; shell(); focusEditor();
  }));
  view.querySelectorAll<HTMLButtonElement>('[data-edit-class]').forEach(button => button.addEventListener('click', () => {
    state.page = 'classes'; state.editor = { kind: 'class', id: button.dataset.editClass }; shell(); focusEditor();
  }));
  view.querySelector('[data-new-user]')?.addEventListener('click', () => { state.page = 'users'; state.editor = { kind: 'user' }; shell(); focusEditor(); });
  view.querySelector('[data-new-class]')?.addEventListener('click', () => { state.page = 'classes'; state.editor = { kind: 'class' }; shell(); focusEditor(); });
  view.querySelector('[data-close]')?.addEventListener('click', () => { state.editor = null; render(); });
  bindEditor();
}
function focusEditor(): void { document.querySelector<HTMLElement>('.editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); document.querySelector<HTMLInputElement>('.editor input')?.focus({ preventScroll: true }); }
function overviewView(view: HTMLElement): void {
  const o = state.overview!;
  view.innerHTML = `${heading('YOUR WORKSPACE, AT A GLANCE', '一切，从这里开始。', `欢迎回来，${esc(getAdminUser()?.displayName || '管理员')}。`)}
    <section class="metrics" aria-label="工作空间统计">${[['用户总数', o.totalUsers], ['管理员', state.users.filter(u => u.isAdmin).length], ['教学班级', o.totalClasses], ['有效会话', o.activeSessions]].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('')}</section>
    <section class="section"><div class="section-header"><div><h2>最近加入</h2><p>管理账号、身份与访问权限。</p></div><button data-new-user>添加用户 <span aria-hidden="true">＋</span></button></div><div class="table-wrap"><table><thead><tr><th>用户</th><th>身份与权限</th><th>操作</th></tr></thead><tbody>${userRows(state.users.slice(0, 5), true)}</tbody></table></div></section>
    <section class="section"><div class="section-header"><div><h2>教学班级</h2><p>让教师、学生与协作保持连接。</p></div><button data-new-class>创建班级 <span aria-hidden="true">＋</span></button></div>
    ${state.classes.length ? `<div class="class-list">${state.classes.slice(0, 4).map(c => `<button data-edit-class="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.teacherName || c.teacherEmail)}</small></span><span class="muted">${c.studentCount} 位学生 ↗</span></button>`).join('')}</div>` : '<div class="empty">还没有班级。添加教师后，即可创建第一个班级。</div>'}</section>`;
}
function usersView(view: HTMLElement): void {
  const query = state.query.toLocaleLowerCase();
  const users = state.users.filter(u => `${u.email} ${u.displayName || ''} ${u.className || ''}`.toLocaleLowerCase().includes(query) && (state.filter === 'all' || (state.filter === 'admin' ? u.isAdmin : u.role === state.filter)));
  view.innerHTML = `${heading('PEOPLE & PERMISSIONS', '用户', '管理每一位成员的账号、资料与权限。', '<button class="primary" data-new-user>添加用户 ＋</button>')}
    <div class="workspace ${state.editor ? 'has-editor' : ''}"><section class="section"><div class="toolbar"><input id="search" type="search" aria-label="搜索用户" placeholder="搜索姓名、邮箱或班级" value="${esc(state.query)}"><select id="role-filter" aria-label="筛选身份">${[['all', '全部用户'], ['admin', '管理员'], ['teacher', '教师'], ['student', '学生']].map(([v, l]) => `<option value="${v}" ${state.filter === v ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="count">${users.length} 位</span></div><div class="table-wrap"><table><thead><tr><th>用户</th><th>身份与权限</th><th>班级</th><th>状态</th><th>操作</th></tr></thead><tbody>${userRows(users)}</tbody></table></div></section>
    ${state.editor?.kind === 'user' ? userEditor() : ''}</div>`;
  bindSearch();
  document.querySelector('#role-filter')?.addEventListener('change', event => { state.filter = (event.target as HTMLSelectElement).value; render(); });
}
function bindSearch(): void {
  const input = document.querySelector<HTMLInputElement>('#search');
  input?.addEventListener('input', () => {
    const caret = input.selectionStart; state.query = input.value; render();
    const next = document.querySelector<HTMLInputElement>('#search'); next?.focus(); if (next?.type === 'text') next.setSelectionRange(caret, caret);
  });
}
function userEditor(): string {
  const user = state.users.find(u => u.id === state.editor?.id);
  return `<aside class="editor"><div class="editor-heading"><p class="eyebrow">${user ? 'EDIT ACCOUNT' : 'NEW ACCOUNT'}</p><h2>${user ? '编辑用户' : '添加用户'}</h2></div><form id="user-form" data-id="${esc(user?.id || '')}">
    ${field('姓名', `<input name="displayName" value="${esc(user?.displayName || '')}" required maxlength="64" autocomplete="off">`)}
    ${field('登录邮箱', `<input name="email" type="email" value="${esc(user?.email || '')}" required maxlength="255" autocomplete="off">`)}
    ${field(user ? '设置新密码' : '密码', `<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="72" ${user ? '' : 'required'} placeholder="${user ? '留空则保持当前密码' : '至少 8 位'}">`)}
    ${field('教学身份', `<select name="role"><option value="student" ${user?.role !== 'teacher' ? 'selected' : ''}>学生</option><option value="teacher" ${user?.role === 'teacher' ? 'selected' : ''}>教师</option></select>`)}
    <label class="checkbox-field"><input name="isAdmin" type="checkbox" ${user?.isAdmin ? 'checked' : ''}><span><strong>管理员权限</strong><small>可以访问管理页面并修改所有用户数据。</small></span></label>
    <div id="student-class">${field('所在班级', `<select name="classId"><option value="none">暂不分配</option>${state.classes.map(c => `<option value="${esc(c.id)}" ${c.id === user?.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}</div>
    <div id="teacher-class">${field('负责班级名称', `<input name="className" maxlength="64" value="${esc(user?.role === 'teacher' ? user.className || '' : '')}" placeholder="可稍后创建">`)}</div>
    <details class="preferences"><summary>用户偏好</summary>${field('白板背景', `<select name="theme">${[['', '使用默认设置'], ['plain', '纯色'], ['grid', '网格'], ['chalkboard', '黑板'], ['dark', '深色']].map(([v, l]) => `<option value="${v}" ${user?.preferences.whiteboardTheme === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${field('空间视窗缩放（%）', `<input name="scale" type="number" min="50" max="200" step="1" value="${Math.round((user?.preferences.spatialWindowScale || 1) * 100)}">`)}
    ${field('墙上肖像', `<select name="portraits"><option value="shown" ${user?.preferences.galleryPortraits === false ? '' : 'selected'}>显示</option><option value="hidden" ${user?.preferences.galleryPortraits === false ? 'selected' : ''}>隐藏</option></select>`)}
    ${field('实验室配色', `<select name="palette"><option value="warm" ${user?.preferences.galleryPalette === 'glacier' ? '' : 'selected'}>暖石灰</option><option value="glacier" ${user?.preferences.galleryPalette === 'glacier' ? 'selected' : ''}>霜青</option></select>`)}</details>
    <p class="form-help">修改邮箱、密码、身份或权限后，该用户需要重新登录。</p>${actions()}</form>
    ${user ? `<div class="account-actions"><button data-revoke-user="${esc(user.id)}">退出该用户所有设备</button>${user.isLocked ? `<button data-unlock="${esc(user.email)}">解除登录锁定</button>` : ''}<details><summary>删除账号</summary><p>账号及其负责的班级与白板将被永久删除。</p><button class="danger" data-delete-user="${esc(user.id)}">确认删除账号</button></details></div>` : ''}</aside>`;
}
function classesView(view: HTMLElement): void {
  const classes = state.classes.filter(c => `${c.name} ${c.teacherName} ${c.teacherEmail} ${c.inviteCode}`.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
  view.innerHTML = `${heading('TEACHING, TOGETHER', '班级', '维护班级信息、邀请码与学生名单。', '<button class="primary" data-new-class>创建班级 ＋</button>')}
    <div class="workspace ${state.editor ? 'has-editor' : ''}"><section class="section"><div class="toolbar"><input id="search" type="search" aria-label="搜索班级" placeholder="搜索班级、教师或邀请码" value="${esc(state.query)}"><span class="count">${classes.length} 个班级</span></div><div class="table-wrap"><table><thead><tr><th>班级</th><th>负责教师</th><th>邀请码</th><th>学生</th><th>操作</th></tr></thead><tbody>${classes.map(c => `<tr><td><button class="name-button" data-edit-class="${esc(c.id)}">${esc(c.name)}</button></td><td>${esc(c.teacherName || c.teacherEmail)}</td><td><code>${esc(c.inviteCode)}</code></td><td>${c.studentCount}</td><td><button class="text-button" data-edit-class="${esc(c.id)}">编辑 ↗</button></td></tr>`).join('') || empty('还没有符合条件的班级。')}</tbody></table></div></section>${state.editor?.kind === 'class' ? classEditor() : ''}</div>`;
  bindSearch();
}
function classEditor(): string {
  const c = state.classes.find(item => item.id === state.editor?.id);
  const teachers = state.users.filter(u => u.role === 'teacher' && (!u.classId || u.id === c?.teacherId));
  return `<aside class="editor"><div class="editor-heading"><p class="eyebrow">${c ? 'EDIT CLASS' : 'NEW CLASS'}</p><h2>${c ? '编辑班级' : '创建班级'}</h2></div><form id="class-form" data-id="${esc(c?.id || '')}">
    ${field('班级名称', `<input name="name" value="${esc(c?.name || '')}" required maxlength="64">`)}
    ${field('负责教师', `<select name="teacherId" required><option value="">请选择教师</option>${teachers.map(t => `<option value="${esc(t.id)}" ${t.id === c?.teacherId ? 'selected' : ''}>${esc(t.displayName || t.email)}</option>`).join('')}</select>`, teachers.length ? '' : '请先添加一位尚未负责班级的教师。')}
    ${field('邀请码', `<input name="inviteCode" value="${esc(c?.inviteCode || '')}" pattern="[A-Za-z0-9]{5}" maxlength="5" placeholder="留空自动生成">`, '5 位字母或数字。')}${actions()}</form>
    ${c ? `<section class="members"><div class="section-header"><h3>学生名单 <span class="muted">${c.studentCount}</span></h3></div>${c.students.map(s => `<div class="member"><span><strong>${esc(s.displayName || '未命名')}</strong><small>${esc(s.email)}</small></span><button class="text-button" data-remove-member="${esc(s.id)}" data-class="${esc(c.id)}">移出</button></div>`).join('') || '<p class="muted">暂无学生。</p>'}
    <form id="member-form" data-id="${esc(c.id)}">${field('添加或转入学生', `<select name="userId" required><option value="">选择学生</option>${state.users.filter(u => u.role === 'student' && u.classId !== c.id).map(u => `<option value="${esc(u.id)}">${esc(u.displayName || u.email)}${u.className ? ` · ${esc(u.className)}` : ''}</option>`).join('')}</select>`)}<button type="submit">加入班级</button></form></section>
    <div class="account-actions"><button data-rotate="${esc(c.id)}">重新生成邀请码</button><details><summary>删除班级</summary><p>班级与白板数据将被永久删除，学生账号保留。</p><button class="danger" data-delete-class="${esc(c.id)}">确认删除班级</button></details></div>` : ''}</aside>`;
}
function securityView(view: HTMLElement): void {
  const security = state.security!;
  const attempts = security.loginAttempts.filter(a => a.failedCount > 0 || a.isLocked);
  view.innerHTML = `${heading('ACCESS & SECURITY', '登录与安全', '查看登录异常，管理账号锁定与设备会话。')}
    <section class="section"><div class="section-header"><div><h2>登录异常</h2><p>连续登录失败和被锁定的账号。</p></div></div><form id="lock-form" class="inline-form"><input name="email" type="email" placeholder="需要锁定的邮箱" aria-label="锁定账号邮箱" required><select name="minutes" aria-label="锁定时长"><option value="15">15 分钟</option><option value="60">1 小时</option><option value="1440">24 小时</option></select><button type="submit">锁定账号</button></form>
    <div class="table-wrap"><table><thead><tr><th>账号</th><th>失败次数</th><th>状态</th><th>锁定到</th><th>操作</th></tr></thead><tbody>${attempts.map(a => `<tr><td>${esc(a.email)}</td><td>${a.failedCount}</td><td>${a.isLocked ? '<span class="status locked">已锁定</span>' : '未锁定'}</td><td>${date(a.lockedUntil)}</td><td><button class="text-button" data-unlock="${esc(a.email)}">清除锁定与记录</button></td></tr>`).join('') || empty('当前没有登录异常。')}</tbody></table></div></section>
    <section class="section"><div class="section-header"><div><h2>设备会话</h2><p>最近的登录与会话状态。</p></div></div><div class="table-wrap"><table><thead><tr><th>用户</th><th>状态</th><th>登录时间</th><th>到期时间</th><th>操作</th></tr></thead><tbody>${security.sessions.map(s => `<tr><td>${esc(s.displayName || s.email)}<small class="table-sub">${esc(s.email)}</small></td><td><span class="tag ${s.status === 'active' ? 'active' : ''}">${({ active: '有效', revoked: '已退出', expired: '已过期' })[s.status]}</span></td><td>${date(s.createdAt)}</td><td>${date(s.expiresAt)}</td><td>${s.status === 'active' ? `<button class="text-button" data-revoke-session="${esc(s.id)}">退出此设备</button>` : '—'}</td></tr>`).join('') || empty('暂无设备会话。')}</tbody></table></div></section>`;
}
async function runAction(button: HTMLButtonElement | null, action: () => Promise<unknown>, message: string): Promise<void> {
  if (button) button.disabled = true;
  try { await action(); notice(message); await load(); }
  catch (err) { notice(errorText(err), true); }
  finally { if (button) button.disabled = false; }
}
function bindEditor(): void {
  const userForm = document.querySelector<HTMLFormElement>('#user-form');
  if (userForm) {
    const role = userForm.elements.namedItem('role') as HTMLSelectElement;
    const toggle = () => {
      document.querySelector<HTMLElement>('#student-class')!.hidden = role.value !== 'student';
      document.querySelector<HTMLElement>('#teacher-class')!.hidden = role.value !== 'teacher';
    };
    role.addEventListener('change', toggle); toggle();
    userForm.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(userForm); const id = userForm.dataset.id;
      const existing = state.users.find(u => u.id === id);
      const role = data.get('role') as 'teacher' | 'student';
      const preferences = {
        whiteboardTheme: (data.get('theme') || undefined) as AdminUser['preferences']['whiteboardTheme'],
        spatialWindowScale: Number(data.get('scale')) / 100,
        galleryPortraits: data.get('portraits') !== 'hidden',
        galleryPalette: (data.get('palette') === 'glacier' ? 'glacier' : 'warm') as AdminUser['preferences']['galleryPalette'],
      };
      const values = { email: String(data.get('email')).trim(), displayName: String(data.get('displayName')).trim(), role, isAdmin: data.has('isAdmin'), preferences };
      const password = String(data.get('password'));
      await runAction(userForm.querySelector('button[type="submit"]'), async () => {
        if (existing) {
          const payload: Parameters<typeof adminApi.updateUser>[1] = {};
          if (values.email !== existing.email) payload.email = values.email;
          if (values.displayName !== existing.displayName) payload.displayName = values.displayName;
          if (values.role !== existing.role) payload.role = values.role;
          if (values.isAdmin !== existing.isAdmin) payload.isAdmin = values.isAdmin;
          if (password) payload.password = password;
          payload.preferences = preferences;
          if (role === 'student' && String(data.get('classId')) !== (existing.classId || 'none')) payload.classId = String(data.get('classId'));
          if (role === 'teacher' && String(data.get('className')).trim() !== (existing.className || '')) payload.className = String(data.get('className')).trim();
          await adminApi.updateUser(existing.id, payload);
          if (existing.id === getAdminUser()?.id && (payload.password || payload.email || payload.role || payload.isAdmin !== undefined)) {
            await adminLogout(); loginView('账号已更新，请使用新的账号信息重新登录。'); return;
          }
        } else {
          await adminApi.createUser({ ...values, password, ...(role === 'student' ? { classId: String(data.get('classId')) === 'none' ? undefined : String(data.get('classId')) } : { className: String(data.get('className')).trim() || undefined }) });
        }
        state.editor = null;
      }, '用户信息已保存。');
    });
  }
  const classForm = document.querySelector<HTMLFormElement>('#class-form');
  classForm?.addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(classForm);
    const payload = { name: String(data.get('name')).trim(), teacherId: String(data.get('teacherId')), inviteCode: String(data.get('inviteCode')).trim() || undefined };
    void runAction(classForm.querySelector('button[type="submit"]'), async () => {
      if (classForm.dataset.id) await adminApi.updateClass(classForm.dataset.id, payload);
      else await adminApi.createClass(payload);
      state.editor = null;
    }, '班级信息已保存。');
  });
  const memberForm = document.querySelector<HTMLFormElement>('#member-form');
  memberForm?.addEventListener('submit', event => { event.preventDefault(); void runAction(memberForm.querySelector('button'), () => adminApi.addClassMember(memberForm.dataset.id!, { userId: String(new FormData(memberForm).get('userId')) }), '学生已加入班级。'); });
  const lockForm = document.querySelector<HTMLFormElement>('#lock-form');
  lockForm?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(lockForm); void runAction(lockForm.querySelector('button'), () => adminApi.lockAccountManual(String(data.get('email')), Number(data.get('minutes'))), '账号已锁定。'); });
  const bind = (selector: string, action: (button: HTMLButtonElement) => Promise<unknown>, message: string) => root.querySelectorAll<HTMLButtonElement>(selector).forEach(button => button.addEventListener('click', () => void runAction(button, () => action(button), message)));
  bind('[data-delete-user]', async button => { await adminApi.deleteUser(button.dataset.deleteUser!); state.editor = null; if (button.dataset.deleteUser === getAdminUser()?.id) { await adminLogout(); loginView('当前账号已删除。'); } }, '账号已删除。');
  bind('[data-delete-class]', async button => { await adminApi.deleteClass(button.dataset.deleteClass!); state.editor = null; }, '班级已删除。');
  bind('[data-unlock]', button => adminApi.unlockAccount(button.dataset.unlock!), '登录锁定已解除。');
  bind('[data-rotate]', button => adminApi.regenerateInviteCode(button.dataset.rotate!), '邀请码已更新。');
  bind('[data-remove-member]', button => adminApi.removeClassMember(button.dataset.class!, button.dataset.removeMember!), '学生已移出班级。');
  bind('[data-revoke-user]', button => adminApi.revokeUserSessions(button.dataset.revokeUser!), '该用户的设备会话已退出。');
  bind('[data-revoke-session]', button => adminApi.revokeSession(button.dataset.revokeSession!), '设备会话已退出。');
}
window.addEventListener('admin:unauthorized', () => loginView('登录已失效或权限已变更，请重新登录。', true));
async function init(): Promise<void> {
  try { if (await restoreAdmin()) { shell(); await load(); } else loginView(); }
  catch (err) { loginView(errorText(err), true); }
}
void init();
