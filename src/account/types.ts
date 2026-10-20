export type AccountRole = 'teacher' | 'student';

export interface AccountPreferences {
  spatialWindowScale?: number;
  whiteboardTheme?: 'plain' | 'grid' | 'chalkboard' | 'dark';
}

export interface ClassStudent {
  id: string;
  email: string;
  displayName: string | null;
  joinedAt: string;
}

export interface AccountClass {
  id: string;
  name: string;
  inviteCode?: string;
  students?: ClassStudent[];
}

export interface AccountUser {
  isAdmin?: boolean;
  id: string;
  email: string;
  role: AccountRole;
  displayName: string | null;
  class: AccountClass | null;
  preferences?: AccountPreferences;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AccountUser;
}

export class AccountApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AccountApiError';
    this.code = code;
    this.status = status;
  }
}
