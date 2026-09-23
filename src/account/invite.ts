const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LEN = 5;

export function normalizeInviteCode(input: string): string | null {
  if (!input.trim()) return null;
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase();
  if (cleaned.length !== CODE_LEN) return null;
  if (![...cleaned].every((char) => ALPHABET.includes(char))) return null;
  return cleaned;
}

export function formatInviteCode(code: string): string {
  return normalizeInviteCode(code) ?? code.trim();
}
