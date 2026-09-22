export type AccountRole = 'teacher' | 'student';

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
  id: string;
  email: string;
  role: AccountRole;
  displayName: string | null;
  class: AccountClass | null;
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
