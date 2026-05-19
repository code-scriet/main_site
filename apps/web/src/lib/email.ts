export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (e: string): boolean => EMAIL_RE.test(e.trim());
