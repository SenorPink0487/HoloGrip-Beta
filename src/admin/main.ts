import {
  adminApi,
  type AdminClass,
  type AdminOverview,
  type AdminUser,
  type SecurityAuditData,
} from './api.ts';

type TabKey = 'overview' | 'users' | 'classes' | 'security';

interface AdminState {
  activeTab: TabKey;
  loading: boolean;
  connected: boolean;
  lastLatencyMs: number;
  overview: AdminOverview | null;
  users: AdminUser[];
  classes: AdminClass[];
  security: SecurityAuditData | null;
  userSearch: string;
  userRoleFilter: 'all' | 'teacher' | 'student' | 'locked' | 'unassigned';
  classSearch: string;
  sessionFilter: 'all' | 'active' | 'revoked' | 'expired';
}

const state: AdminState = {
  activeTab: 'overview',
  loading: true,
  connected: true,
  lastLatencyMs: 0,
  overview: null,
  users: [],
  classes: [],
  security: null,
  userSearch: '',
  userRoleFilter: 'all',
  classSearch: '',
  sessionFilter: 'all',
};

function escapeHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showNotice(message: string, isError = false): void {
  const bar = document.getElementById('nexus-status-bar');
  if (!bar) return;
  const item = document.createElement('div');
  item.className = `nexus-notice${isError ? ' error' : ''}`;
  item.innerHTML = `
    <span style="font-family:var(--font-mono);font-weight:700;color:${isError ? '#fb7185' : '#38bdf8'}">${isError ? '[ERR]' : '[OK]'}</span>
    <span>${escapeHtml(message)}</span>
  `;
  bar.appendChild(item);
  setTimeout(() => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(8px)';
    item.style.transition = 'all 0.25s ease';
    setTimeout(() => item.remove(), 260);
  }, 3200);
}

function bindSpotlightCards(): void {
  const cards = document.querySelectorAll<HTMLElement>('.bento-card');
  cards.forEach((card) => {
    card.onmousemove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };
  });
}

async function refreshAllData(silent = false): Promise<void> {
  if (!silent) {
    state.loading = true;
  }
  const t0 = performance.now();
  try {
    const [overview, users, classes, security] = await Promise.all([
      adminApi.getOverview(),
      adminApi.listUsers(),
      adminApi.listClasses(),
      adminApi.getSecurityAudit(),
    ]);
    const rtt = Math.max(1, Math.round(performance.now() - t0));
    state.overview = overview;
    state.users = users;
    state.classes = classes;
    state.security = security;
    state.connected = true;
    state.lastLatencyMs = rtt;
    state.loading = false;
    updateHeaderTelemetry();
    renderActiveView();
  } catch (err) {
    state.connected = false;
    state.loading = false;
    updateHeaderTelemetry();
    renderActiveView();
    showNotice(err instanceof Error ? err.message : '无法连接 Rust/MySQL 后端服务', true);
  }
}

function updateHeaderTelemetry(): void {
  const dot = document.getElementById('db-heartbeat-dot');
  const label = document.getElementById('db-heartbeat-label');
  const rtt = document.getElementById('api-latency-readout');
  if (dot && label && rtt) {
    if (state.connected) {
      dot.classList.remove('offline');
      label.textContent = 'MYSQL 8.4 // VIRT_LAB_DB CONNECTED';
      rtt.textContent = `RTT: ${state.lastLatencyMs} ms`;
    } else {
      dot.classList.add('offline');
      label.textContent = 'MYSQL 8.4 // CONNECTION INTERRUPTED';
      rtt.textContent = 'RTT: OFFLINE';
    }
  }

  const countUsers = document.getElementById('tab-count-users');
  const countClasses = document.getElementById('tab-count-classes');
  const countSecurity = document.getElementById('tab-count-security');
  if (countUsers) countUsers.textContent = String(state.users.length);
  if (countClasses) countClasses.textContent = String(state.classes.length);
  if (countSecurity && state.security) {
    countSecurity.textContent = String(
      state.security.loginAttempts.length +
        state.security.sessions.filter((s) => s.status === 'active').length,
    );
  }
}

function switchTab(tab: TabKey): void {
  state.activeTab = tab;
  document.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderActiveView();
}

function renderActiveView(): void {
  const root = document.getElementById('admin-view-root');
  if (!root) return;

  if (!state.connected && !state.overview) {
    root.innerHTML = `
      <div class="bento-card" style="text-align:center;padding:64px 24px;">
        <div class="section-code" style="color:#fb7185;margin-bottom:8px;">BACKEND DISCONNECTED // PORT 8080</div>
        <h2 style="font-family:var(--font-display);font-size:26px;margin-bottom:12px;">无法连接 Rust / MySQL 教务数据引擎</h2>
        <p style="color:var(--surface-titanium);max-width:540px;margin:0 auto 24px;font-size:14px;line-height:1.6;">
          请确认 MySQL 容器与 Rust Axum 后端服务（<code>http://127.0.0.1:8080</code>）正在运行。
        </p>
        <button class="btn-cyan" id="retry-connect-btn">↻ 重新连接数据库</button>
      </div>
    `;
    document.getElementById('retry-connect-btn')?.addEventListener('click', () => {
      void refreshAllData();
    });
    return;
  }

  if (state.activeTab === 'overview') {
    renderOverviewTab(root);
  } else if (state.activeTab === 'users') {
    renderUsersTab(root);
  } else if (state.activeTab === 'classes') {
    renderClassesTab(root);
  } else if (state.activeTab === 'security') {
    renderSecurityTab(root);
  }

  bindSpotlightCards();
}

function renderFiveCharBadge(code: string, classId?: string): string {
  const chars = code.padEnd(5, '-').slice(0, 5).split('');
  return `
    <div class="five-char-cells" ${classId ? `data-code-vault="${escapeHtml(classId)}"` : ''}>
      ${chars.map((c) => `<span class="char-cell">${escapeHtml(c)}</span>`).join('')}
    </div>
  `;
}

function animateInviteCodeCells(classId: string, finalCode: string): void {
  const vault = document.querySelector(`[data-code-vault="${classId}"]`);
  if (!vault) return;
  const cells = vault.querySelectorAll<HTMLElement>('.char-cell');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let frame = 0;
  const timer = setInterval(() => {
    frame++;
    cells.forEach((cell, idx) => {
      if (frame >= (idx + 1) * 3) {
        cell.textContent = finalCode[idx] || '-';
        cell.style.borderColor = 'rgba(56, 189, 248, 0.75)';
      } else {
        cell.textContent = alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    });
    if (frame >= 16) {
      clearInterval(timer);
      cells.forEach((cell) => {
        cell.style.borderColor = '';
      });
    }
  }, 35);
}

/* ============================================================================
 * VIEW 01: 全域遥测矩阵 (OVERVIEW)
 * ========================================================================== */
function renderOverviewTab(root: HTMLElement): void {
  const ov = state.overview;
  if (!ov) return;

  const teacherPct = ov.totalUsers > 0 ? Math.round((ov.teacherCount / ov.totalUsers) * 100) : 0;
  const studentPct = Math.max(0, 100 - teacherPct);
  const enrollPct =
    ov.studentCount > 0 ? Math.min(100, Math.round((ov.totalEnrollments / ov.studentCount) * 100)) : 100;
  const totalTokens = Math.max(1, ov.activeSessions + ov.revokedSessions + ov.expiredSessions);
  const activeTokenPct = Math.round((ov.activeSessions / totalTokens) * 100);

  // 构建 SVG 趋势图
  const trend = ov.registrationTrend || [];
  const chartW = 720;
  const chartH = 220;
  const padX = 42;
  const padY = 26;
  const maxVal = Math.max(
    4,
    ...trend.map((p) => Math.max(p.students + p.teachers, p.operations)),
  );

  const ptsUsers = trend.map((p, idx) => {
    const x =
      trend.length > 1
        ? padX + (idx / (trend.length - 1)) * (chartW - padX * 2)
        : chartW / 2;
    const val = p.students + p.teachers;
    const y = chartH - padY - (val / maxVal) * (chartH - padY * 2);
    return { x, y, val, teachers: p.teachers, students: p.students, date: p.date };
  });

  const polylinePoints = ptsUsers.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints =
    ptsUsers.length > 0
      ? `${ptsUsers[0].x.toFixed(1)},${chartH - padY} ${polylinePoints} ${ptsUsers[ptsUsers.length - 1].x.toFixed(1)},${chartH - padY}`
      : '';

  root.innerHTML = `
    <!-- 四联核心遥测 KPI -->
    <section class="kpi-grid">
      <article class="bento-card">
        <span class="corner-reticle tl"></span><span class="corner-reticle tr"></span>
        <div class="kpi-eyebrow">
          <span>01 // ACADEMIC ACCOUNTS</span>
          <span style="color:var(--accent-cyan)">USERS TABLE</span>
        </div>
        <div class="kpi-value-row">
          <div class="kpi-number">${ov.totalUsers}</div>
          <span class="kpi-delta">${ov.teacherCount} 师 / ${ov.studentCount} 生</span>
        </div>
        <div class="kpi-ratio-bar">
          <div class="kpi-ratio-seg" style="width:${teacherPct}%;background:var(--accent-brass)"></div>
          <div class="kpi-ratio-seg" style="width:${studentPct}%;background:var(--accent-cyan)"></div>
        </div>
        <div class="kpi-subtext">
          <span>教师占比 ${teacherPct}% · 学生 ${studentPct}%</span>
          <button class="btn-ghost btn-sm" data-quick-action="new-user">+ 新增账号</button>
        </div>
      </article>

      <article class="bento-card">
        <span class="corner-reticle tl"></span><span class="corner-reticle tr"></span>
        <div class="kpi-eyebrow">
          <span>02 // CLASS & 5-CHAR CODES</span>
          <span style="color:var(--accent-brass-glow)">CLASSES TABLE</span>
        </div>
        <div class="kpi-value-row">
          <div class="kpi-number">${ov.totalClasses}</div>
          <span class="kpi-delta warn">入班率 ${enrollPct}%</span>
        </div>
        <div class="kpi-ratio-bar">
          <div class="kpi-ratio-seg" style="width:${enrollPct}%;background:linear-gradient(90deg, #f59e0b, #38bdf8)"></div>
        </div>
        <div class="kpi-subtext">
          <span>已入班 ${ov.totalEnrollments} 人 · 待分班 ${ov.unassignedStudents} 人</span>
          <button class="btn-ghost btn-sm" data-quick-action="new-class">+ 新建班级</button>
        </div>
      </article>

      <article class="bento-card">
        <span class="corner-reticle tl"></span><span class="corner-reticle tr"></span>
        <div class="kpi-eyebrow">
          <span>03 // WHITEBOARD & TOKENS</span>
          <span style="color:#34d399">REALTIME SYNC</span>
        </div>
        <div class="kpi-value-row">
          <div class="kpi-number">${ov.activeSessions}</div>
          <span class="kpi-delta">白板修订 v${ov.totalWhiteboardRevisions}</span>
        </div>
        <div class="kpi-ratio-bar">
          <div class="kpi-ratio-seg" style="width:${activeTokenPct}%;background:#10b981"></div>
        </div>
        <div class="kpi-subtext">
          <span>活跃令牌 ${ov.activeSessions} · 已吊销 ${ov.revokedSessions} · 过期 ${ov.expiredSessions}</span>
          <button class="btn-ghost btn-sm" data-goto-tab="security">会话审计 →</button>
        </div>
      </article>

      <article class="bento-card">
        <span class="corner-reticle tl"></span><span class="corner-reticle tr"></span>
        <div class="kpi-eyebrow">
          <span>04 // SECURITY SHIELD</span>
          <span style="color:${ov.lockedAccounts > 0 ? '#fb7185' : '#34d399'}">LOGIN_ATTEMPTS</span>
        </div>
        <div class="kpi-value-row">
          <div class="kpi-number" style="color:${ov.lockedAccounts > 0 ? '#fb7185' : '#ffffff'}">${ov.lockedAccounts}</div>
          <span class="kpi-delta ${ov.lockedAccounts > 0 ? 'danger' : ''}">
            ${ov.lockedAccounts > 0 ? `${ov.lockedAccounts} 账号锁定中` : '0 锁定 / 防线正常'}
          </span>
        </div>
        <div class="kpi-ratio-bar">
          <div class="kpi-ratio-seg" style="width:${Math.min(100, ov.warningAccounts * 20)}%;background:${ov.lockedAccounts > 0 ? '#f43f5e' : '#f59e0b'}"></div>
        </div>
        <div class="kpi-subtext">
          <span>累计异常试探记录 ${ov.warningAccounts} 条</span>
          <button class="btn-ghost btn-sm" data-goto-tab="security">安全处置 →</button>
        </div>
      </article>
    </section>

    <!-- 双栏主分析 Bento -->
    <section class="analytics-bento">
      <!-- 左：时间序列与班级容量分布 -->
      <div class="bento-card">
        <div class="section-header">
          <div class="section-title-group">
            <span class="section-code">TELEMETRY STREAM // COHORT & REVISION VELOCITY</span>
            <h2 class="section-title">师生注册脉冲与班级容量分布</h2>
          </div>
          <div style="display:flex;gap:14px;font-family:var(--font-mono);font-size:11px;color:var(--surface-titanium);">
            <span style="display:flex;align-items:center;gap:6px;">
              <i style="width:8px;height:8px;border-radius:50%;background:#38bdf8;display:inline-block;"></i>新增师生轨迹
            </span>
            <span style="display:flex;align-items:center;gap:6px;">
              <i style="width:8px;height:8px;border-radius:2px;background:#f59e0b;display:inline-block;"></i>白板快照版本Σ=${ov.totalWhiteboardRevisions}
            </span>
          </div>
        </div>

        <div style="width:100%;overflow-x:auto;">
          <svg viewBox="0 0 ${chartW} ${chartH}" style="width:100%;height:215px;display:block;">
            <defs>
              <linearGradient id="cyanAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.36" />
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <!-- 水平参考刻度线 -->
            ${[0.2, 0.5, 0.8].map((r) => {
              const y = (padY + r * (chartH - padY * 2)).toFixed(1);
              return `<line x1="${padX}" y1="${y}" x2="${chartW - padX}" y2="${y}" stroke="rgba(226,232,240,0.07)" stroke-dasharray="4 4" />`;
            }).join('')}

            ${areaPoints ? `<polygon points="${areaPoints}" fill="url(#cyanAreaGrad)" />` : ''}
            ${polylinePoints ? `<polyline fill="none" stroke="#38bdf8" stroke-width="2.6" points="${polylinePoints}" />` : ''}

            ${ptsUsers.map((p) => `
              <g>
                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#050914" stroke="#38bdf8" stroke-width="2.5" />
                <text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" text-anchor="middle" fill="#e2e8f0" font-family="JetBrains Mono" font-size="10">${p.val > 0 ? `+${p.val}` : ''}</text>
                <text x="${p.x.toFixed(1)}" y="${chartH - 6}" text-anchor="middle" fill="#64748b" font-family="JetBrains Mono" font-size="9.5">${escapeHtml(p.date.slice(5))}</text>
              </g>
            `).join('')}
          </svg>
        </div>

        <!-- 班级成员负载横条矩阵 -->
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-hairline);display:flex;flex-direction:column;gap:10px;">
          ${ov.classMetrics.slice(0, 4).map((cm) => {
            const maxStu = Math.max(6, ...ov.classMetrics.map((m) => m.studentCount));
            const wPct = Math.max(6, Math.round((cm.studentCount / maxStu) * 100));
            return `
              <div style="display:grid;grid-template-columns:190px 1fr 120px;align-items:center;gap:12px;font-size:12.5px;">
                <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;color:var(--surface-silver);" title="${escapeHtml(cm.name)}">
                  ${escapeHtml(cm.name)}
                </div>
                <div style="height:8px;background:rgba(255,255,255,0.05);border-radius:999px;overflow:hidden;">
                  <div style="width:${wPct}%;height:100%;background:linear-gradient(90deg,#38bdf8,#f59e0b);border-radius:999px;"></div>
                </div>
                <div style="font-family:var(--font-mono);font-size:11px;text-align:right;color:var(--surface-titanium);">
                  <span style="color:var(--accent-brass-glow)">#${escapeHtml(cm.inviteCode)}</span> · ${cm.studentCount}生
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 右：5位邀请码实时派发与轮换中枢 -->
      <div class="bento-card">
        <div class="section-header">
          <div class="section-title-group">
            <span class="section-code">INVITE CODE DISPATCH // CHAR(5) REGISTRY</span>
            <h2 class="section-title">5 位班级邀请码快捷管控</h2>
          </div>
          <button class="btn-ghost btn-sm" data-goto-tab="classes">全部班级 →</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px;max-height:345px;overflow-y:auto;padding-right:4px;">
          ${state.classes.map((cls) => `
            <div style="background:rgba(5,9,20,0.68);border:1px solid var(--border-hairline);border-radius:14px;padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div style="min-width:140px;flex:1;">
                <div style="font-weight:700;font-size:13.5px;color:#fff;margin-bottom:3px;">${escapeHtml(cls.name)}</div>
                <div style="font-size:11.5px;color:var(--surface-muted);">
                  导师：${escapeHtml(cls.teacherName || cls.teacherEmail)} · <strong>${cls.studentCount}</strong> 名学生
                </div>
              </div>
              ${renderFiveCharBadge(cls.inviteCode, cls.id)}
              <div style="display:flex;align-items:center;gap:6px;">
                <button class="btn-ghost btn-sm" data-copy-code="${escapeHtml(cls.inviteCode)}" title="复制 5 位邀请码">复制</button>
                <button class="btn-brass btn-sm" data-rotate-code="${escapeHtml(cls.id)}" title="在 MySQL 中重新生成 5 位随机邀请码">↻ 轮换</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- 底部：最新师生名录与实时安全态势预览 -->
    <section class="bento-card">
      <div class="section-header">
        <div class="section-title-group">
          <span class="section-code">LIVE ROSTER SNAPSHOT // MYSQL USERS & SESSIONS</span>
          <h2 class="section-title">最新活跃师生与安全状态矩阵</h2>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-cyan btn-sm" data-quick-action="new-user">+ 新建师生账号</button>
          <button class="btn-ghost btn-sm" data-goto-tab="users">进入完整 CRUD 名册 →</button>
        </div>
      </div>
      ${renderUsersTableMarkup(state.users.slice(0, 8))}
    </section>
  `;

  bindOverviewEvents(root);
}

function bindOverviewEvents(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-goto-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.gotoTab as TabKey;
      if (target) switchTab(target);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-quick-action="new-user"]').forEach((btn) => {
    btn.addEventListener('click', () => openUserModal());
  });

  root.querySelectorAll<HTMLElement>('[data-quick-action="new-class"]').forEach((btn) => {
    btn.addEventListener('click', () => openClassModal());
  });

  bindCommonTableActions(root);
}

/* ============================================================================
 * VIEW 02: 师生账号 CRUD 花名册 (USERS)
 * ========================================================================== */
function getFilteredUsers(): AdminUser[] {
  const q = state.userSearch.trim().toLowerCase();
  return state.users.filter((u) => {
    if (state.userRoleFilter === 'teacher' && u.role !== 'teacher') return false;
    if (state.userRoleFilter === 'student' && u.role !== 'student') return false;
    if (state.userRoleFilter === 'locked' && !u.isLocked && u.failedAttempts === 0) return false;
    if (state.userRoleFilter === 'unassigned' && (u.role !== 'student' || u.classId)) return false;

    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.className || '').toLowerCase().includes(q) ||
      (u.inviteCode || '').toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });
}

function renderUsersTableMarkup(list: AdminUser[]): string {
  if (list.length === 0) {
    return `
      <div style="padding:42px;text-align:center;color:var(--surface-muted);font-size:13.5px;">
        没有匹配的师生记录。可点击右上角「+ 新建师生账号」或「✦ 同步教研样本库」。
      </div>
    `;
  }
  return `
    <div class="data-table-wrap">
      <table class="nexus-table">
        <thead>
          <tr>
            <th>姓名 / ID 指纹</th>
            <th>角色</th>
            <th>电子邮箱 (登录凭证)</th>
            <th>所属/执教班级</th>
            <th>5 位邀请码</th>
            <th>在线令牌</th>
            <th>安全防线状态</th>
            <th>注册时间</th>
            <th style="text-align:right;">管理操作</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((u) => {
            const securityBadge = u.isLocked
              ? `<span class="security-chip locked">● 已锁定 (${u.failedAttempts}次失败)</span>`
              : u.failedAttempts > 0
                ? `<span class="security-chip warning">▲ 告警 (${u.failedAttempts}/8次失败)</span>`
                : `<span class="security-chip healthy">✓ 正常</span>`;

            return `
              <tr>
                <td>
                  <div style="font-weight:700;color:#ffffff;">${escapeHtml(u.displayName || '未命名用户')}</div>
                  <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--surface-muted);">${escapeHtml(u.id.slice(0, 13))}…</div>
                </td>
                <td>
                  <span class="role-badge ${u.role}">
                    ${u.role === 'teacher' ? '★ 教师 FACULTY' : '● 学生 STUDENT'}
                  </span>
                </td>
                <td style="font-family:var(--font-mono);font-size:12.5px;color:var(--surface-titanium);">${escapeHtml(u.email)}</td>
                <td>
                  ${
                    u.className
                      ? `<span style="color:#fff;font-weight:500;">${escapeHtml(u.className)}</span>
                         ${u.role === 'teacher' ? `<span style="font-family:var(--font-mono);font-size:11px;color:var(--surface-muted);"> (${u.studentCount}生)</span>` : ''}`
                      : `<span style="color:var(--surface-muted);font-style:italic;">未分配班级</span>`
                  }
                </td>
                <td>
                  ${
                    u.inviteCode
                      ? `<span class="code-pill" data-copy-code="${escapeHtml(u.inviteCode)}" title="点击复制 5 位邀请码">
                           #${escapeHtml(u.inviteCode)}
                         </span>`
                      : '<span style="color:var(--surface-muted);">—</span>'
                  }
                </td>
                <td>
                  <span style="font-family:var(--font-mono);font-size:12px;color:${u.activeSessions > 0 ? '#34d399' : 'var(--surface-muted)'};">
                    ${u.activeSessions} 活跃
                  </span>
                </td>
                <td>${securityBadge}</td>
                <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--surface-muted);">${formatTimeShort(u.createdAt)}</td>
                <td style="text-align:right;white-space:nowrap;">
                  <div style="display:inline-flex;gap:6px;">
                    <button class="btn-ghost btn-sm" data-edit-user="${escapeHtml(u.id)}">编辑 / 调班</button>
                    ${
                      u.failedAttempts > 0 || u.isLocked
                        ? `<button class="btn-brass btn-sm" data-unlock-email="${escapeHtml(u.email)}">解锁</button>`
                        : ''
                    }
                    ${
                      u.activeSessions > 0
                        ? `<button class="btn-ghost btn-sm" data-revoke-user="${escapeHtml(u.id)}" title="强制吊销该用户所有活跃令牌">下线</button>`
                        : ''
                    }
                    <button class="btn-danger btn-sm" data-delete-user="${escapeHtml(u.id)}" data-delete-name="${escapeHtml(u.displayName || u.email)}">删除</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUsersTab(root: HTMLElement): void {
  const filtered = getFilteredUsers();
  root.innerHTML = `
    <section class="bento-card">
      <div class="section-header">
        <div class="section-title-group">
          <span class="section-code">USER DIRECTORY & ROSTER // MYSQL CRUD</span>
          <h2 class="section-title">师生账号矩阵与分班管理 (${filtered.length} / ${state.users.length})</h2>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-ghost" id="export-users-csv-btn">⇣ 导出 CSV 报表</button>
          <button class="btn-cyan" id="create-user-modal-btn">+ 新建师生账号</button>
        </div>
      </div>

      <div class="filter-toolbar">
        <div class="search-box">
          <span class="search-icon">⌕</span>
          <input
            type="text"
            class="search-input"
            id="user-search-input"
            placeholder="搜索姓名、邮箱、班级名称、5位邀请码或 UUID…"
            value="${escapeHtml(state.userSearch)}"
          />
        </div>
        <div class="pill-filters">
          <button class="filter-pill ${state.userRoleFilter === 'all' ? 'active' : ''}" data-role-filter="all">全部 (${state.users.length})</button>
          <button class="filter-pill ${state.userRoleFilter === 'teacher' ? 'active' : ''}" data-role-filter="teacher">教师 Faculty (${state.users.filter((u) => u.role === 'teacher').length})</button>
          <button class="filter-pill ${state.userRoleFilter === 'student' ? 'active' : ''}" data-role-filter="student">学生 Student (${state.users.filter((u) => u.role === 'student').length})</button>
          <button class="filter-pill ${state.userRoleFilter === 'unassigned' ? 'active' : ''}" data-role-filter="unassigned">待分班学生 (${state.users.filter((u) => u.role === 'student' && !u.classId).length})</button>
          <button class="filter-pill ${state.userRoleFilter === 'locked' ? 'active' : ''}" data-role-filter="locked">安全告警/锁定 (${state.users.filter((u) => u.isLocked || u.failedAttempts > 0).length})</button>
        </div>
      </div>

      <div id="users-table-container">
        ${renderUsersTableMarkup(filtered)}
      </div>
    </section>
  `;

  const searchInput = document.getElementById('user-search-input') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    state.userSearch = searchInput.value;
    const container = document.getElementById('users-table-container');
    if (container) {
      container.innerHTML = renderUsersTableMarkup(getFilteredUsers());
      bindCommonTableActions(container);
    }
  });

  root.querySelectorAll<HTMLButtonElement>('[data-role-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.userRoleFilter = (btn.dataset.roleFilter as AdminState['userRoleFilter']) || 'all';
      renderUsersTab(root);
    });
  });

  document.getElementById('create-user-modal-btn')?.addEventListener('click', () => openUserModal());
  document.getElementById('export-users-csv-btn')?.addEventListener('click', exportUsersCsv);

  bindCommonTableActions(root);
}

function exportUsersCsv(): void {
  const rows = getFilteredUsers();
  const headers = ['ID', 'Role', 'DisplayName', 'Email', 'ClassName', 'InviteCode', 'ActiveSessions', 'FailedAttempts', 'CreatedAt'];
  const csvLines = [
    headers.join(','),
    ...rows.map((u) =>
      [
        u.id,
        u.role,
        `"${(u.displayName || '').replace(/"/g, '""')}"`,
        u.email,
        `"${(u.className || '').replace(/"/g, '""')}"`,
        u.inviteCode || '',
        u.activeSessions,
        u.failedAttempts,
        u.createdAt,
      ].join(','),
    ),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hologrip-academic-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showNotice(`已导出 ${rows.length} 条师生记录至 CSV`);
}

/* ============================================================================
 * VIEW 03: 班级与 5 位邀请码矩阵 (CLASSES & 5-CHAR INVITE CODES)
 * ========================================================================== */
function renderClassesTab(root: HTMLElement): void {
  const q = state.classSearch.trim().toLowerCase();
  const filtered = state.classes.filter((c) => {
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.inviteCode.toLowerCase().includes(q) ||
      (c.teacherName || '').toLowerCase().includes(q) ||
      c.teacherEmail.toLowerCase().includes(q)
    );
  });

  root.innerHTML = `
    <section class="bento-card" style="margin-bottom:20px;">
      <div class="section-header">
        <div class="section-title-group">
          <span class="section-code">CLASS MATRIX & 5-DIGIT INVITE CODE ENGINE</span>
          <h2 class="section-title">教学班级矩阵与 5 位邀请码管控 (${filtered.length} 个班级)</h2>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-cyan" id="create-class-modal-btn">+ 新建教学班级</button>
        </div>
      </div>

      <div class="filter-toolbar" style="margin-bottom:0;">
        <div class="search-box">
          <span class="search-icon">⌕</span>
          <input
            type="text"
            class="search-input"
            id="class-search-input"
            placeholder="搜索班级名称、5位邀请码（如 S4JJK / EM84X）或负责教师…"
            value="${escapeHtml(state.classSearch)}"
          />
        </div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--surface-titanium);">
          邀请码规格：<span style="color:var(--accent-brass-glow)">CHAR(5) 大写字母与数字</span> · 支持一键轮换与自定义指定
        </div>
      </div>
    </section>

    <section class="invite-code-matrix">
      ${filtered.map((cls) => `
        <article class="bento-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:16px;">
          <div>
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px;">
              <div>
                <span class="section-code">CLASS COHORT // REV v${cls.whiteboardRevision}</span>
                <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:#fff;margin-top:3px;">
                  ${escapeHtml(cls.name)}
                </h3>
              </div>
              <span class="role-badge student">${cls.studentCount} 名学生</span>
            </div>

            <div style="font-size:12.5px;color:var(--surface-titanium);margin-bottom:14px;display:flex;flex-direction:column;gap:4px;">
              <div>负责导师：<strong style="color:#fff;">${escapeHtml(cls.teacherName || '未命名导师')}</strong> (${escapeHtml(cls.teacherEmail)})</div>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--surface-muted);">
                白板同步修订：v${cls.whiteboardRevision} · 协作指令数：${cls.whiteboardOpsCount}
              </div>
            </div>

            <!-- 5位机械邀请码保险匣 -->
            <div class="five-char-vault" style="margin-bottom:14px;">
              <div>
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--surface-muted);letter-spacing:0.12em;margin-bottom:5px;">
                  5-DIGIT INVITE CODE
                </div>
                ${renderFiveCharBadge(cls.inviteCode, cls.id)}
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;">
                <button class="btn-ghost btn-sm" data-copy-code="${escapeHtml(cls.inviteCode)}">复制邀请码</button>
                <button class="btn-brass btn-sm" data-rotate-code="${escapeHtml(cls.id)}">↻ 随机重置</button>
              </div>
            </div>

            <!-- 班级成员快览 -->
            <div style="border-top:1px solid var(--border-hairline);padding-top:12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <span style="font-family:var(--font-mono);font-size:11px;color:var(--surface-muted);">班级学生名册 (${cls.students.length})</span>
                <button class="btn-ghost btn-sm" data-add-member-class="${escapeHtml(cls.id)}" data-add-member-name="${escapeHtml(cls.name)}">+ 录入学生</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:150px;overflow-y:auto;">
                ${
                  cls.students.length === 0
                    ? `<div style="font-size:12px;color:var(--surface-muted);padding:8px 0;">暂无学生加入，可使用上方 5 位邀请码入班</div>`
                    : cls.students.map((stu) => `
                        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(5,9,20,0.55);padding:6px 10px;border-radius:8px;font-size:12px;">
                          <div>
                            <span style="color:#fff;font-weight:600;">${escapeHtml(stu.displayName || '学生')}</span>
                            <span style="font-family:var(--font-mono);font-size:11px;color:var(--surface-muted);margin-left:6px;">${escapeHtml(stu.email)}</span>
                          </div>
                          <button class="btn-danger btn-sm" style="padding:2px 7px;font-size:10.5px;" data-remove-member-class="${escapeHtml(cls.id)}" data-remove-member-user="${escapeHtml(stu.id)}" title="移出班级">移出</button>
                        </div>
                      `).join('')
                }
              </div>
            </div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border-hairline);">
            <button class="btn-ghost btn-sm" data-edit-class="${escapeHtml(cls.id)}">✎ 编辑名称 / 自定义5位码</button>
            <button class="btn-danger btn-sm" data-delete-class="${escapeHtml(cls.id)}" data-delete-class-name="${escapeHtml(cls.name)}">解散班级</button>
          </div>
        </article>
      `).join('')}
    </section>
  `;

  const searchInput = document.getElementById('class-search-input') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    state.classSearch = searchInput.value;
    renderClassesTab(root);
    const nextInput = document.getElementById('class-search-input') as HTMLInputElement | null;
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
    }
  });

  document.getElementById('create-class-modal-btn')?.addEventListener('click', () => openClassModal());
  bindCommonTableActions(root);
}

/* ============================================================================
 * VIEW 04: 安全审计与会话令牌中枢 (SECURITY & SESSIONS)
 * ========================================================================== */
function renderSecurityTab(root: HTMLElement): void {
  const sec = state.security;
  if (!sec) return;

  const filteredSessions = sec.sessions.filter((s) => {
    if (state.sessionFilter === 'all') return true;
    return s.status === state.sessionFilter;
  });

  root.innerHTML = `
    <!-- 登录防暴破与锁定审计 -->
    <section class="bento-card" style="margin-bottom:22px;">
      <div class="section-header">
        <div class="section-title-group">
          <span class="section-code">BRUTE-FORCE DEFENSE // LOGIN_ATTEMPTS TABLE</span>
          <h2 class="section-title">登录异常与账号锁定审计 (${sec.loginAttempts.length} 条追踪记录)</h2>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-brass" id="manual-lock-btn">🔒 手动冻结/锁定邮箱</button>
          ${
            sec.loginAttempts.length > 0
              ? `<button class="btn-cyan" id="unlock-all-btn">✓ 一键清空全部锁定与失败记录</button>`
              : ''
          }
        </div>
      </div>

      ${
        sec.loginAttempts.length === 0
          ? `<div style="padding:32px;text-align:center;color:#34d399;font-family:var(--font-mono);font-size:13px;">
               [SHIELD HEALTHY] 当前 login_attempts 表无任何失败或锁定记录，全站认证防线正常。
             </div>`
          : `
            <div class="data-table-wrap">
              <table class="nexus-table">
                <thead>
                  <tr>
                    <th>目标邮箱</th>
                    <th>关联账号信息</th>
                    <th>连续失败次数 (阈值 8 次锁定)</th>
                    <th>当前安全状态</th>
                    <th>锁定截止时间</th>
                    <th>最后触发时间</th>
                    <th style="text-align:right;">应急处置</th>
                  </tr>
                </thead>
                <tbody>
                  ${sec.loginAttempts.map((item) => {
                    const pct = Math.min(100, Math.round((item.failedCount / 8) * 100));
                    return `
                      <tr>
                        <td style="font-family:var(--font-mono);font-weight:600;color:#fff;">${escapeHtml(item.email)}</td>
                        <td>
                          ${
                            item.userId
                              ? `<span style="color:var(--surface-silver);font-weight:600;">${escapeHtml(item.displayName || '已注册用户')}</span>
                                 <span class="role-badge ${item.role === 'teacher' ? 'teacher' : 'student'}" style="margin-left:6px;">${item.role === 'teacher' ? '教师' : '学生'}</span>`
                              : `<span style="color:var(--surface-muted);font-style:italic;">外部未知探测源 (未注册邮箱)</span>`
                          }
                        </td>
                        <td style="min-width:170px;">
                          <div style="display:flex;align-items:center;gap:10px;">
                            <div style="flex:1;height:7px;background:rgba(255,255,255,0.07);border-radius:999px;overflow:hidden;">
                              <div style="width:${pct}%;height:100%;background:${item.isLocked ? '#f43f5e' : '#f59e0b'};border-radius:999px;"></div>
                            </div>
                            <span style="font-family:var(--font-mono);font-size:12px;color:#fff;">${item.failedCount} / 8</span>
                          </div>
                        </td>
                        <td>
                          ${
                            item.isLocked
                              ? `<span class="security-chip locked">● 强制锁定中</span>`
                              : `<span class="security-chip warning">▲ 密码试探告警</span>`
                          }
                        </td>
                        <td style="font-family:var(--font-mono);font-size:12px;color:${item.isLocked ? '#fb7185' : 'var(--surface-muted)'};">
                          ${item.lockedUntil ? formatTimeShort(item.lockedUntil) : '未触发封禁'}
                        </td>
                        <td style="font-family:var(--font-mono);font-size:12px;color:var(--surface-muted);">${formatTimeShort(item.updatedAt)}</td>
                        <td style="text-align:right;">
                          <button class="btn-cyan btn-sm" data-unlock-email="${escapeHtml(item.email)}">解除锁定 / 清零</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `
      }
    </section>

    <!-- Refresh Token 会话审计 -->
    <section class="bento-card">
      <div class="section-header">
        <div class="section-title-group">
          <span class="section-code">SESSION & TOKEN REGISTRY // REFRESH_TOKENS TABLE</span>
          <h2 class="section-title">SHA-256 刷新令牌与活跃会话审计 (${filteredSessions.length} 条)</h2>
        </div>
        <div class="pill-filters">
          <button class="filter-pill ${state.sessionFilter === 'all' ? 'active' : ''}" data-session-filter="all">全部 (${sec.sessions.length})</button>
          <button class="filter-pill ${state.sessionFilter === 'active' ? 'active' : ''}" data-session-filter="active">活跃 Active (${sec.sessions.filter((s) => s.status === 'active').length})</button>
          <button class="filter-pill ${state.sessionFilter === 'revoked' ? 'active' : ''}" data-session-filter="revoked">已吊销 Revoked (${sec.sessions.filter((s) => s.status === 'revoked').length})</button>
          <button class="filter-pill ${state.sessionFilter === 'expired' ? 'active' : ''}" data-session-filter="expired">已过期 Expired (${sec.sessions.filter((s) => s.status === 'expired').length})</button>
        </div>
      </div>

      <div class="data-table-wrap">
        <table class="nexus-table">
          <thead>
            <tr>
              <th>令牌 SHA-256 指纹</th>
              <th>持有人</th>
              <th>角色</th>
              <th>令牌状态</th>
              <th>签发时间</th>
              <th>到期/吊销时间</th>
              <th style="text-align:right;">会话管控</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredSessions.length === 0
                ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--surface-muted);">暂无符合筛选条件的会话令牌记录</td></tr>`
                : filteredSessions.map((s) => `
                    <tr>
                      <td style="font-family:var(--font-mono);font-size:12px;color:var(--accent-cyan);">
                        #${escapeHtml(s.tokenFingerprint)}…
                      </td>
                      <td>
                        <div style="font-weight:600;color:#fff;">${escapeHtml(s.displayName || '用户')}</div>
                        <div style="font-family:var(--font-mono);font-size:11px;color:var(--surface-muted);">${escapeHtml(s.email)}</div>
                      </td>
                      <td>
                        <span class="role-badge ${s.role}">${s.role === 'teacher' ? '教师' : '学生'}</span>
                      </td>
                      <td>
                        ${
                          s.status === 'active'
                            ? `<span class="security-chip healthy">● ACTIVE 活跃</span>`
                            : s.status === 'revoked'
                              ? `<span class="security-chip locked">✕ REVOKED 已吊销</span>`
                              : `<span class="security-chip warning">⌛ EXPIRED 已过期</span>`
                        }
                      </td>
                      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--surface-muted);">${formatTimeShort(s.createdAt)}</td>
                      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--surface-muted);">
                        ${s.revokedAt ? `吊销于 ${formatTimeShort(s.revokedAt)}` : formatTimeShort(s.expiresAt)}
                      </td>
                      <td style="text-align:right;">
                        ${
                          s.status === 'active'
                            ? `<button class="btn-danger btn-sm" data-revoke-session="${escapeHtml(s.id)}">吊销令牌</button>`
                            : `<span style="font-family:var(--font-mono);font-size:11px;color:var(--surface-muted);">已失效</span>`
                        }
                      </td>
                    </tr>
                  `).join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-session-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.sessionFilter = (btn.dataset.sessionFilter as AdminState['sessionFilter']) || 'all';
      renderSecurityTab(root);
    });
  });

  document.getElementById('unlock-all-btn')?.addEventListener('click', async () => {
    try {
      await adminApi.unlockAllAccounts();
      showNotice('已清空 login_attempts 表全部锁定与失败记录');
      await refreshAllData(true);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '操作失败', true);
    }
  });

  document.getElementById('manual-lock-btn')?.addEventListener('click', () => openManualLockModal());

  bindCommonTableActions(root);
}

/* ============================================================================
 * 通用表格与卡片交互事件绑定
 * ========================================================================== */
function bindCommonTableActions(container: HTMLElement): void {
  // 复制 5 位邀请码
  container.querySelectorAll<HTMLElement>('[data-copy-code]').forEach((el) => {
    el.addEventListener('click', () => {
      const code = el.dataset.copyCode;
      if (!code) return;
      navigator.clipboard?.writeText(code).catch(() => {});
      showNotice(`已复制 5 位班级邀请码：${code}`);
    });
  });

  // 轮换 5 位邀请码
  container.querySelectorAll<HTMLButtonElement>('[data-rotate-code]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const classId = btn.dataset.rotateCode;
      if (!classId) return;
      btn.disabled = true;
      try {
        const updated = await adminApi.regenerateInviteCode(classId);
        animateInviteCodeCells(classId, updated.inviteCode);
        showNotice(`班级「${updated.name}」邀请码已轮换为 #${updated.inviteCode}`);
        setTimeout(() => {
          void refreshAllData(true);
        }, 620);
      } catch (err) {
        btn.disabled = false;
        showNotice(err instanceof Error ? err.message : '轮换邀请码失败', true);
      }
    });
  });

  // 编辑用户
  container.querySelectorAll<HTMLButtonElement>('[data-edit-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.editUser;
      const user = state.users.find((u) => u.id === uid);
      if (user) openUserModal(user);
    });
  });

  // 删除用户
  container.querySelectorAll<HTMLButtonElement>('[data-delete-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.deleteUser;
      const name = btn.dataset.deleteName || uid;
      if (!uid) return;
      openConfirmModal(
        '确认删除账号',
        `即将从 MySQL 数据库中永久删除账号「${name}」及其关联会话与成员记录。此操作不可撤销。`,
        async () => {
          await adminApi.deleteUser(uid);
          showNotice(`已删除账号：${name}`);
          await refreshAllData(true);
        },
      );
    });
  });

  // 解锁单个邮箱
  container.querySelectorAll<HTMLButtonElement>('[data-unlock-email]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.unlockEmail;
      if (!email) return;
      try {
        await adminApi.unlockAccount(email);
        showNotice(`已解除账号锁定并清零失败计数：${email}`);
        await refreshAllData(true);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : '解锁失败', true);
      }
    });
  });

  // 吊销用户全部活跃令牌
  container.querySelectorAll<HTMLButtonElement>('[data-revoke-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.revokeUser;
      if (!uid) return;
      try {
        await adminApi.revokeUserSessions(uid);
        showNotice('已强制吊销该用户的全部活跃会话令牌');
        await refreshAllData(true);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : '吊销失败', true);
      }
    });
  });

  // 吊销单条会话令牌
  container.querySelectorAll<HTMLButtonElement>('[data-revoke-session]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.revokeSession;
      if (!sid) return;
      try {
        await adminApi.revokeSession(sid);
        showNotice('该刷新令牌已在 MySQL 中标记为已吊销');
        await refreshAllData(true);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : '操作失败', true);
      }
    });
  });

  // 编辑班级
  container.querySelectorAll<HTMLButtonElement>('[data-edit-class]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.editClass;
      const cls = state.classes.find((c) => c.id === cid);
      if (cls) openClassModal(cls);
    });
  });

  // 删除班级
  container.querySelectorAll<HTMLButtonElement>('[data-delete-class]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.deleteClass;
      const cname = btn.dataset.deleteClassName || cid;
      if (!cid) return;
      openConfirmModal(
        '确认解散班级',
        `即将解散班级「${cname}」，释放其 5 位邀请码并解除所有学生的入班绑定。`,
        async () => {
          await adminApi.deleteClass(cid);
          showNotice(`已解散班级：${cname}`);
          await refreshAllData(true);
        },
      );
    });
  });

  // 班级录入学生
  container.querySelectorAll<HTMLButtonElement>('[data-add-member-class]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.addMemberClass;
      const cname = btn.dataset.addMemberName || '';
      if (cid) openAddMemberModal(cid, cname);
    });
  });

  // 班级移出学生
  container.querySelectorAll<HTMLButtonElement>('[data-remove-member-class]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = btn.dataset.removeMemberClass;
      const uid = btn.dataset.removeMemberUser;
      if (!cid || !uid) return;
      try {
        await adminApi.removeClassMember(cid, uid);
        showNotice('已将该学生移出班级');
        await refreshAllData(true);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : '移出失败', true);
      }
    });
  });
}

/* ============================================================================
 * 模态框系统 (新建/编辑师生、新建/编辑班级、录入学生、手动锁定、命令面板)
 * ========================================================================== */
function openModal(html: string): HTMLElement | null {
  const backdrop = document.getElementById('admin-modal-backdrop');
  const card = document.getElementById('admin-modal-card');
  if (!backdrop || !card) return null;
  card.innerHTML = html;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');

  card.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });
  return card;
}

function closeModal(): void {
  const backdrop = document.getElementById('admin-modal-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
}

function openConfirmModal(title: string, desc: string, onConfirm: () => Promise<void>): void {
  const card = openModal(`
    <div class="section-code" style="color:#fb7185;">SECURITY CONFIRMATION // MYSQL TX</div>
    <h3 style="font-family:var(--font-display);font-size:20px;margin:6px 0 12px;color:#fff;">${escapeHtml(title)}</h3>
    <p style="font-size:13.5px;color:var(--surface-titanium);line-height:1.6;margin-bottom:22px;">${escapeHtml(desc)}</p>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button type="button" class="btn-ghost" data-close-modal>取消</button>
      <button type="button" class="btn-danger" id="modal-confirm-exec-btn">确认执行</button>
    </div>
  `);
  if (!card) return;
  const confirmBtn = card.querySelector<HTMLButtonElement>('#modal-confirm-exec-btn');
  confirmBtn?.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '执行中…';
    try {
      await onConfirm();
      closeModal();
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确认执行';
      showNotice(err instanceof Error ? err.message : '执行失败', true);
    }
  });
}

function openUserModal(existing?: AdminUser): void {
  const isEdit = Boolean(existing);
  const currentRole = existing?.role || 'student';

  const card = openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <span class="section-code">${isEdit ? 'UPDATE USER // MYSQL' : 'CREATE USER // MYSQL'}</span>
        <h3 style="font-family:var(--font-display);font-size:20px;color:#fff;margin-top:3px;">
          ${isEdit ? `编辑账号：${escapeHtml(existing?.displayName || existing?.email)}` : '新建师生账号'}
        </h3>
      </div>
      <button type="button" class="btn-ghost btn-sm" data-close-modal>✕</button>
    </div>

    <form class="form-grid" id="admin-user-form">
      <div class="form-field">
        <label class="form-label">角色类型 (Role)</label>
        <select class="form-select" name="role" id="modal-user-role">
          <option value="student" ${currentRole === 'student' ? 'selected' : ''}>学生 (Student)</option>
          <option value="teacher" ${currentRole === 'teacher' ? 'selected' : ''}>教师 (Teacher / 班级导师)</option>
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">姓名 / 显示名称 (Display Name)</label>
        <input class="form-input" type="text" name="displayName" required maxlength="64" placeholder="例如：林致远 教授 / 沈奕辰" value="${escapeHtml(existing?.displayName || '')}" />
      </div>

      <div class="form-field">
        <label class="form-label">电子邮箱 (Email)</label>
        <input class="form-input" type="email" name="email" required placeholder="name@hologrip.edu.cn" value="${escapeHtml(existing?.email || '')}" />
      </div>

      <div class="form-field">
        <label class="form-label">${isEdit ? '重置登录密码 (留空则保持原密码不变)' : '初始登录密码 (至少 8 位，Argon2id 加密存储)'}</label>
        <input class="form-input" type="password" name="password" ${isEdit ? '' : 'required'} minlength="8" maxlength="72" placeholder="${isEdit ? '如需重置请输入至少 8 位新密码…' : '至少 8 位字符…'}" />
      </div>

      <div class="form-field" id="field-student-class" style="display:${currentRole === 'student' ? 'flex' : 'none'};">
        <label class="form-label">分配教学班级 (Class Assignment)</label>
        <select class="form-select" name="classId">
          <option value="none">— 暂不分配班级 (Unassigned) —</option>
          ${state.classes.map((c) => `
            <option value="${escapeHtml(c.id)}" ${existing?.classId === c.id ? 'selected' : ''}>
              [${escapeHtml(c.inviteCode)}] ${escapeHtml(c.name)} (${escapeHtml(c.teacherName || c.teacherEmail)})
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-field" id="field-teacher-class" style="display:${currentRole === 'teacher' ? 'flex' : 'none'};">
        <label class="form-label">执教班级名称 (选填，填写后自动同步/创建班级与 5 位邀请码)</label>
        <input class="form-input" type="text" name="className" maxlength="64" placeholder="例如：高三 (1) 班 · 经典力学实验组" value="${escapeHtml(existing?.role === 'teacher' ? existing?.className || '' : '')}" />
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
        <button type="button" class="btn-ghost" data-close-modal>取消</button>
        <button type="submit" class="btn-cyan" id="user-form-submit-btn">${isEdit ? '保存修改至 MySQL' : '立即创建账号'}</button>
      </div>
    </form>
  `);

  if (!card) return;
  const roleSelect = card.querySelector<HTMLSelectElement>('#modal-user-role');
  const stuField = card.querySelector<HTMLElement>('#field-student-class');
  const teaField = card.querySelector<HTMLElement>('#field-teacher-class');

  roleSelect?.addEventListener('change', () => {
    const r = roleSelect.value;
    if (stuField) stuField.style.display = r === 'student' ? 'flex' : 'none';
    if (teaField) teaField.style.display = r === 'teacher' ? 'flex' : 'none';
  });

  const form = card.querySelector<HTMLFormElement>('#admin-user-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const role = (fd.get('role') as 'teacher' | 'student') || 'student';
    const displayName = String(fd.get('displayName') || '').trim();
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const classId = String(fd.get('classId') || '');
    const className = String(fd.get('className') || '').trim();

    const submitBtn = card.querySelector<HTMLButtonElement>('#user-form-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (isEdit && existing) {
        await adminApi.updateUser(existing.id, {
          role,
          displayName,
          email,
          password: password || undefined,
          classId: role === 'student' ? classId : undefined,
          className: role === 'teacher' ? className : undefined,
        });
        showNotice(`已更新账号：${displayName}`);
      } else {
        await adminApi.createUser({
          role,
          displayName,
          email,
          password,
          classId: role === 'student' && classId !== 'none' ? classId : undefined,
          className: role === 'teacher' && className ? className : undefined,
        });
        showNotice(`已创建新账号：${displayName}`);
      }
      closeModal();
      await refreshAllData(true);
    } catch (err) {
      if (submitBtn) submitBtn.disabled = false;
      showNotice(err instanceof Error ? err.message : '保存失败', true);
    }
  });
}

function openClassModal(existing?: AdminClass): void {
  const isEdit = Boolean(existing);
  const teachers = state.users.filter((u) => u.role === 'teacher');

  const card = openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <span class="section-code">${isEdit ? 'UPDATE CLASS & 5-CODE' : 'CREATE CLASS & 5-CODE'}</span>
        <h3 style="font-family:var(--font-display);font-size:20px;color:#fff;margin-top:3px;">
          ${isEdit ? `编辑班级：${escapeHtml(existing?.name)}` : '新建教学班级与 5 位邀请码'}
        </h3>
      </div>
      <button type="button" class="btn-ghost btn-sm" data-close-modal>✕</button>
    </div>

    <form class="form-grid" id="admin-class-form">
      <div class="form-field">
        <label class="form-label">班级名称 (Class Name)</label>
        <input class="form-input" type="text" name="name" required maxlength="64" placeholder="例如：高三 (2) 班 · 电磁学与霍尔效应实验班" value="${escapeHtml(existing?.name || '')}" />
      </div>

      <div class="form-field">
        <label class="form-label">负责教师 (Class Teacher — 每位教师可执教一个主班级)</label>
        <select class="form-select" name="teacherId" required>
          ${teachers.map((t) => `
            <option value="${escapeHtml(t.id)}" ${existing?.teacherId === t.id ? 'selected' : ''}>
              ${escapeHtml(t.displayName || t.email)} (${escapeHtml(t.email)}) ${t.classId && t.classId !== existing?.id ? '· [已有班级]' : ''}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">5 位班级邀请码 (5-Char Invite Code，留空则自动生成随机 5 位码)</label>
        <input
          class="form-input"
          type="text"
          name="inviteCode"
          maxlength="6"
          style="font-family:var(--font-mono);letter-spacing:0.2em;text-transform:uppercase;color:var(--accent-brass-glow);font-weight:700;"
          placeholder="例如：EM84X（留空自动生成）"
          value="${escapeHtml(existing?.inviteCode || '')}"
        />
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
        <button type="button" class="btn-ghost" data-close-modal>取消</button>
        <button type="submit" class="btn-cyan" id="class-form-submit-btn">${isEdit ? '保存班级设置' : '创建班级并生成邀请码'}</button>
      </div>
    </form>
  `);

  if (!card) return;
  const form = card.querySelector<HTMLFormElement>('#admin-class-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const teacherId = String(fd.get('teacherId') || '').trim();
    const inviteCode = String(fd.get('inviteCode') || '').trim();

    const submitBtn = card.querySelector<HTMLButtonElement>('#class-form-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (isEdit && existing) {
        await adminApi.updateClass(existing.id, {
          name,
          teacherId,
          inviteCode: inviteCode || undefined,
        });
        showNotice(`已更新班级「${name}」`);
      } else {
        const created = await adminApi.createClass({
          name,
          teacherId,
          inviteCode: inviteCode || undefined,
        });
        showNotice(`已创建班级「${created.name}」，5位邀请码：#${created.inviteCode}`);
      }
      closeModal();
      await refreshAllData(true);
    } catch (err) {
      if (submitBtn) submitBtn.disabled = false;
      showNotice(err instanceof Error ? err.message : '操作失败', true);
    }
  });
}

function openAddMemberModal(classId: string, className: string): void {
  const students = state.users.filter((u) => u.role === 'student' && u.classId !== classId);
  const card = openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <span class="section-code">ENROLL STUDENT // CLASS_MEMBERS</span>
        <h3 style="font-family:var(--font-display);font-size:20px;color:#fff;margin-top:3px;">
          向「${escapeHtml(className)}」录入学生
        </h3>
      </div>
      <button type="button" class="btn-ghost btn-sm" data-close-modal>✕</button>
    </div>

    <form class="form-grid" id="add-member-form">
      <div class="form-field">
        <label class="form-label">从现有学生名册中选择</label>
        <select class="form-select" name="userId">
          <option value="">— 请选择学生账号 —</option>
          ${students.map((s) => `
            <option value="${escapeHtml(s.id)}">
              ${escapeHtml(s.displayName || '学生')} (${escapeHtml(s.email)}) ${s.className ? `[当前在：${escapeHtml(s.className)}]` : '[待分班]'}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">或者直接输入学生邮箱</label>
        <input class="form-input" type="email" name="email" placeholder="student@stu.hologrip.edu.cn" />
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
        <button type="button" class="btn-ghost" data-close-modal>取消</button>
        <button type="submit" class="btn-cyan">确认录入班级</button>
      </div>
    </form>
  `);

  if (!card) return;
  const form = card.querySelector<HTMLFormElement>('#add-member-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const userId = String(fd.get('userId') || '').trim();
    const email = String(fd.get('email') || '').trim();
    try {
      await adminApi.addClassMember(classId, {
        userId: userId || undefined,
        email: email || undefined,
      });
      showNotice(`学生已录入班级「${className}」`);
      closeModal();
      await refreshAllData(true);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '录入失败', true);
    }
  });
}

function openManualLockModal(): void {
  const card = openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <span class="section-code">SECURITY ENFORCEMENT // FREEZE ACCOUNT</span>
        <h3 style="font-family:var(--font-display);font-size:20px;color:#fff;margin-top:3px;">
          手动冻结 / 锁定目标账号邮箱
        </h3>
      </div>
      <button type="button" class="btn-ghost btn-sm" data-close-modal>✕</button>
    </div>

    <form class="form-grid" id="manual-lock-form">
      <div class="form-field">
        <label class="form-label">目标登录邮箱 (Email)</label>
        <input class="form-input" type="email" name="email" required placeholder="输入需要临时冻结登录的邮箱…" list="known-emails-list" />
        <datalist id="known-emails-list">
          ${state.users.map((u) => `<option value="${escapeHtml(u.email)}">${escapeHtml(u.displayName || '')}</option>`).join('')}
        </datalist>
      </div>

      <div class="form-field">
        <label class="form-label">锁定时长 (Duration)</label>
        <select class="form-select" name="minutes">
          <option value="15">15 分钟 (标准防暴破封禁时长)</option>
          <option value="60">1 小时</option>
          <option value="360">6 小时</option>
          <option value="1440">24 小时</option>
        </select>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
        <button type="button" class="btn-ghost" data-close-modal>取消</button>
        <button type="submit" class="btn-danger">立即写入锁定策略</button>
      </div>
    </form>
  `);

  if (!card) return;
  const form = card.querySelector<HTMLFormElement>('#manual-lock-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const minutes = Number(fd.get('minutes') || 15);
    try {
      await adminApi.lockAccountManual(email, minutes);
      showNotice(`已冻结账号 ${email}（时长 ${minutes} 分钟）`);
      closeModal();
      await refreshAllData(true);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '操作失败', true);
    }
  });
}

function openCommandPalette(): void {
  const card = openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span class="section-code">NEXUS SPOTLIGHT // COMMAND PALETTE (⌘K)</span>
      <button type="button" class="btn-ghost btn-sm" data-close-modal>ESC</button>
    </div>
    <input
      type="text"
      class="form-input"
      id="cmd-palette-input"
      placeholder="输入指令、教师/学生姓名、班级或 5 位邀请码…"
      style="font-size:15px;padding:12px 16px;margin-bottom:14px;"
    />
    <div id="cmd-palette-results" style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;"></div>
  `);
  if (!card) return;
  const input = card.querySelector<HTMLInputElement>('#cmd-palette-input');
  const results = card.querySelector<HTMLElement>('#cmd-palette-results');

  const renderItems = (q: string) => {
    if (!results) return;
    const query = q.trim().toLowerCase();
    const actions = [
      { label: '新建师生账号 (Create Teacher / Student)', tag: 'ACTION', run: () => openUserModal() },
      { label: '新建教学班级与 5 位邀请码 (Create Class)', tag: 'ACTION', run: () => openClassModal() },
      {
        label: '同步/写入标准学科教研样本库 (Seed MySQL Cohort)',
        tag: 'MYSQL',
        run: async () => {
          closeModal();
          await adminApi.seedCohort();
          showNotice('已向 MySQL 同步学科教研班级与师生样本');
          await refreshAllData(true);
        },
      },
      {
        label: '切换至：01 全域遥测矩阵 (Overview)',
        tag: 'NAV',
        run: () => {
          closeModal();
          switchTab('overview');
        },
      },
      {
        label: '切换至：02 师生账号 CRUD 名册 (Users)',
        tag: 'NAV',
        run: () => {
          closeModal();
          switchTab('users');
        },
      },
      {
        label: '切换至：03 班级与 5 位邀请码 (Classes)',
        tag: 'NAV',
        run: () => {
          closeModal();
          switchTab('classes');
        },
      },
      {
        label: '切换至：04 安全防线与令牌审计 (Security)',
        tag: 'NAV',
        run: () => {
          closeModal();
          switchTab('security');
        },
      },
    ];

    const matchedUsers = state.users
      .filter(
        (u) =>
          query &&
          ((u.displayName || '').toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            (u.inviteCode || '').toLowerCase().includes(query)),
      )
      .slice(0, 5)
      .map((u) => ({
        label: `${u.displayName || u.email} (${u.email})`,
        tag: u.role === 'teacher' ? 'TEACHER' : 'STUDENT',
        run: () => openUserModal(u),
      }));

    const matchedClasses = state.classes
      .filter(
        (c) =>
          query &&
          (c.name.toLowerCase().includes(query) || c.inviteCode.toLowerCase().includes(query)),
      )
      .slice(0, 4)
      .map((c) => ({
        label: `班级：${c.name} [邀请码 #${c.inviteCode}]`,
        tag: 'CLASS',
        run: () => openClassModal(c),
      }));

    const combined = [
      ...matchedClasses,
      ...matchedUsers,
      ...actions.filter((a) => !query || a.label.toLowerCase().includes(query)),
    ];

    results.innerHTML = combined
      .map(
        (item, idx) => `
        <button
          type="button"
          data-cmd-idx="${idx}"
          style="appearance:none;border:1px solid var(--border-hairline);background:rgba(5,9,20,0.65);color:#fff;padding:10px 14px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;text-align:left;font-size:13px;"
        >
          <span>${escapeHtml(item.label)}</span>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--accent-cyan);padding:2px 7px;background:rgba(56,189,248,0.12);border-radius:5px;">${item.tag}</span>
        </button>
      `,
      )
      .join('');

    results.querySelectorAll<HTMLButtonElement>('[data-cmd-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.cmdIdx);
        combined[idx]?.run();
      });
    });
  };

  renderItems('');
  input?.focus();
  input?.addEventListener('input', () => renderItems(input.value));
}

/* ============================================================================
 * 全息精密坐标与磁力粒子背景 Canvas
 * ========================================================================== */
function initBackgroundField(): void {
  const canvas = document.getElementById('admin-bg-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);
  let mouseX = width * 0.5;
  let mouseY = height * 0.3;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  const nodes = Array.from({ length: 42 }, (_, i) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.32,
    vy: (Math.random() - 0.5) * 0.32,
    r: i % 5 === 0 ? 2.2 : 1.3,
    gold: i % 5 === 0,
  }));

  function frame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // 顶部深海蓝宝石与香槟金环境光晕
    const grad = ctx.createRadialGradient(mouseX, mouseY, 10, mouseX, mouseY, 560);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.065)');
    grad.addColorStop(0.5, 'rgba(14, 116, 144, 0.02)');
    grad.addColorStop(1, 'rgba(5, 9, 20, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx;
      a.y += a.vy;
      if (a.x < 0 || a.x > width) a.vx *= -1;
      if (a.y < 0 || a.y > height) a.vy *= -1;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 165) {
          const alpha = (1 - dist / 165) * 0.14;
          ctx.strokeStyle = a.gold
            ? `rgba(245, 158, 11, ${alpha})`
            : `rgba(56, 189, 248, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = a.gold ? 'rgba(251, 191, 36, 0.65)' : 'rgba(125, 211, 252, 0.55)';
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

/* ============================================================================
 * 初始化与全局快捷键挂载
 * ========================================================================== */
function initAdminNexus(): void {
  initBackgroundField();

  // 实时 UTC 时钟
  const updateClock = () => {
    const el = document.getElementById('utc-clock-readout');
    if (el) {
      const now = new Date();
      el.textContent = `${now.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
    }
  };
  updateClock();
  setInterval(updateClock, 1000);

  // 顶部导航切换
  document.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab as TabKey;
      if (tab) switchTab(tab);
    });
  });

  // 头部操作按钮
  document.getElementById('refresh-all-btn')?.addEventListener('click', async () => {
    await refreshAllData();
    showNotice('已从 MySQL 同步最新遥测与教务数据');
  });

  document.getElementById('seed-cohort-btn')?.addEventListener('click', async () => {
    try {
      await adminApi.seedCohort();
      showNotice('已向 MySQL 同步标准学科班级、5位邀请码与师生样本');
      await refreshAllData(true);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '同步样本失败', true);
    }
  });

  document.getElementById('open-cmd-palette-btn')?.addEventListener('click', openCommandPalette);

  // 点击遮罩关闭模态框
  const backdrop = document.getElementById('admin-modal-backdrop');
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  // 全局快捷键 (⌘K / Ctrl+K 打开命令面板，ESC 关闭模态框)
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  });

  void refreshAllData();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initAdminNexus);
} else {
  initAdminNexus();
}
