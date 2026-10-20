import { adminRequest } from './session.ts';
import type { AccountPreferences } from '../account/types.ts';
export interface ClassMetricItem {
  id: string;
  name: string;
  inviteCode: string;
  teacherName: string;
  teacherEmail: string;
  studentCount: number;
  whiteboardRevision: number;
  whiteboardOps: number;
}

export interface TrendPoint {
  date: string;
  teachers: number;
  students: number;
  operations: number;
}

export interface AdminOverview {
  totalUsers: number;
  teacherCount: number;
  studentCount: number;
  totalClasses: number;
  totalEnrollments: number;
  unassignedStudents: number;
  activeSessions: number;
  revokedSessions: number;
  expiredSessions: number;
  lockedAccounts: number;
  warningAccounts: number;
  totalWhiteboards: number;
  totalWhiteboardRevisions: number;
  totalWhiteboardOps: number;
  classMetrics: ClassMetricItem[];
  registrationTrend: TrendPoint[];
}

export interface AdminUser {
  isAdmin: boolean;
  preferences: AccountPreferences;
  id: string;
  email: string;
  role: 'teacher' | 'student';
  displayName: string | null;
  classId: string | null;
  className: string | null;
  inviteCode: string | null;
  studentCount: number;
  activeSessions: number;
  failedAttempts: number;
  lockedUntil: string | null;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClassStudentItem {
  id: string;
  email: string;
  displayName: string | null;
  joinedAt: string;
}

export interface AdminClass {
  id: string;
  name: string;
  inviteCode: string;
  teacherId: string;
  teacherName: string | null;
  teacherEmail: string;
  studentCount: number;
  whiteboardRevision: number;
  whiteboardOpsCount: number;
  whiteboardUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  students: ClassStudentItem[];
}

export interface LoginAttemptItem {
  email: string;
  userId: string | null;
  displayName: string | null;
  role: string | null;
  failedCount: number;
  lockedUntil: string | null;
  isLocked: boolean;
  updatedAt: string;
}

export interface SessionAuditItem {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  tokenFingerprint: string;
  status: 'active' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface SecurityAuditData {
  loginAttempts: LoginAttemptItem[];
  sessions: SessionAuditItem[];
}

export const adminApi = {
  checkHealth(): Promise<{ status: string }> {
    return adminRequest('/health');
  },
  getOverview(): Promise<AdminOverview> {
    return adminRequest('/api/v1/admin/overview');
  },
  listUsers(): Promise<AdminUser[]> {
    return adminRequest('/api/v1/admin/users');
  },
  createUser(payload: {
    role: 'teacher' | 'student';
    isAdmin?: boolean;
    preferences?: AccountPreferences;
    email: string;
    password: string;
    displayName: string;
    className?: string;
    inviteCode?: string;
    classId?: string;
  }): Promise<AdminUser> {
    return adminRequest('/api/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateUser(
    id: string,
    payload: {
      email?: string;
      displayName?: string;
      role?: 'teacher' | 'student';
      isAdmin?: boolean;
      preferences?: AccountPreferences;
      password?: string;
      classId?: string;
      className?: string;
    },
  ): Promise<AdminUser> {
    return adminRequest(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteUser(id: string): Promise<void> {
    return adminRequest(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  listClasses(): Promise<AdminClass[]> {
    return adminRequest('/api/v1/admin/classes');
  },
  createClass(payload: {
    teacherId: string;
    name: string;
    inviteCode?: string;
  }): Promise<AdminClass> {
    return adminRequest('/api/v1/admin/classes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateClass(
    id: string,
    payload: {
      name?: string;
      inviteCode?: string;
      teacherId?: string;
    },
  ): Promise<AdminClass> {
    return adminRequest(`/api/v1/admin/classes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  regenerateInviteCode(id: string): Promise<AdminClass> {
    return adminRequest(`/api/v1/admin/classes/${encodeURIComponent(id)}/regenerate-code`, {
      method: 'POST',
    });
  },
  addClassMember(
    classId: string,
    payload: { userId?: string; email?: string },
  ): Promise<AdminClass> {
    return adminRequest(`/api/v1/admin/classes/${encodeURIComponent(classId)}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  removeClassMember(classId: string, userId: string): Promise<AdminClass> {
    return adminRequest(
      `/api/v1/admin/classes/${encodeURIComponent(classId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
  },
  deleteClass(id: string): Promise<void> {
    return adminRequest(`/api/v1/admin/classes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  getSecurityAudit(): Promise<SecurityAuditData> {
    return adminRequest('/api/v1/admin/security');
  },
  unlockAccount(email: string): Promise<void> {
    return adminRequest('/api/v1/admin/security/unlock', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  unlockAllAccounts(): Promise<void> {
    return adminRequest('/api/v1/admin/security/unlock-all', {
      method: 'POST',
    });
  },
  lockAccountManual(email: string, minutes = 30): Promise<void> {
    return adminRequest('/api/v1/admin/security/lock', {
      method: 'POST',
      body: JSON.stringify({ email, minutes }),
    });
  },
  revokeSession(sessionId: string): Promise<void> {
    return adminRequest(`/api/v1/admin/security/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: 'POST',
    });
  },
  revokeUserSessions(userId: string): Promise<void> {
    return adminRequest(`/api/v1/admin/security/users/${encodeURIComponent(userId)}/revoke-all`, {
      method: 'POST',
    });
  },
};
