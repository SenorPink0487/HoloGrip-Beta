const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeInviteCode(input: string): string | null {
  if (!input.trim()) return null;
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase();
  if (cleaned.length !== 8) return null;
  if (![...cleaned].every((char) => ALPHABET.includes(char))) return null;
  return cleaned;
}

export function formatInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return code.trim();
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}
