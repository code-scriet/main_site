import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

interface AttendancePayload {
  userId: string;
  eventId: string;
  registrationId: string;
  purpose: 'attendance';
}

const ATTENDANCE_JWT_SECRET_ENV_CANDIDATES = [
  'ATTENDANCE_JWT_SECRET',
  'ATTENDANCE_TOKEN_SECRET',
] as const;

const ATTENDANCE_PREVIOUS_SECRET_ENV_CANDIDATES = [
  'ATTENDANCE_JWT_PREVIOUS_SECRET',
  'ATTENDANCE_JWT_PREVIOUS_SECRETS',
  'ATTENDANCE_TOKEN_PREVIOUS_SECRET',
] as const;

const DEFAULT_ATTENDANCE_TOKEN_EXPIRES_IN =
  (process.env.ATTENDANCE_TOKEN_EXPIRES_IN || '90d') as jwt.SignOptions['expiresIn'];

// Temporary safety net to prevent total auth outage when ATTENDANCE_JWT_SECRET is missing.
// Replace via env or super-admin settings as soon as possible.
const TEMPORARY_ATTENDANCE_JWT_SECRET = 'codescriet-temporary-attendance-secret-rotate-immediately';

let runtimeAttendanceJwtSecret: string | null = null;
const runtimePreviousAttendanceSecrets = new Set<string>();
let warnedAboutTemporarySecret = false;

function getConfiguredAttendanceJwtSecret(): string | undefined {
  for (const key of ATTENDANCE_JWT_SECRET_ENV_CANDIDATES) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return runtimeAttendanceJwtSecret ?? undefined;
}

function getConfiguredPreviousAttendanceSecrets(): string[] {
  const values: string[] = [];

  for (const key of ATTENDANCE_PREVIOUS_SECRET_ENV_CANDIDATES) {
    const raw = process.env[key]?.trim();
    if (!raw) {
      continue;
    }

    const parts = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    values.push(...parts);
  }

  return Array.from(new Set(values));
}

export function getAttendanceJwtSecret(): string {
  const secret = getConfiguredAttendanceJwtSecret();

  if (secret) {
    return secret;
  }

  if (!warnedAboutTemporarySecret) {
    warnedAboutTemporarySecret = true;
    logger.warn(
      'ATTENDANCE_JWT_SECRET is missing. Using temporary hardcoded fallback until a super admin sets attendanceJwtSecret in settings or env.',
    );
  }

  return TEMPORARY_ATTENDANCE_JWT_SECRET;
}

export function setRuntimeAttendanceJwtSecret(secret: string | null | undefined): void {
  const normalized = secret?.trim() || null;

  if (runtimeAttendanceJwtSecret && normalized && runtimeAttendanceJwtSecret !== normalized) {
    runtimePreviousAttendanceSecrets.add(runtimeAttendanceJwtSecret);
  }

  runtimeAttendanceJwtSecret = normalized;

  if (normalized) {
    runtimePreviousAttendanceSecrets.delete(normalized);
  }

  warnedAboutTemporarySecret = false;
}

function getAttendanceVerificationSecrets(): string[] {
  const attendanceSecret = getAttendanceJwtSecret();
  const previousSecrets = getConfiguredPreviousAttendanceSecrets()
    .filter((secret) => secret !== attendanceSecret);
  const runtimePreviousSecrets = Array.from(runtimePreviousAttendanceSecrets)
    .filter((secret) => secret !== attendanceSecret);

  const fallbackSecret = attendanceSecret === TEMPORARY_ATTENDANCE_JWT_SECRET
    ? []
    : [TEMPORARY_ATTENDANCE_JWT_SECRET];

  return Array.from(new Set([attendanceSecret, ...runtimePreviousSecrets, ...previousSecrets, ...fallbackSecret]));
}

function verifyAttendancePayload(token: string, secret: string): AttendancePayload {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AttendancePayload;
  if (decoded.purpose !== 'attendance') {
    throw new Error('Invalid token purpose');
  }

  return decoded;
}

export function generateAttendanceToken(userId: string, eventId: string, registrationId: string): string {
  return jwt.sign(
    { userId, eventId, registrationId, purpose: 'attendance' } satisfies AttendancePayload,
    getAttendanceJwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn: DEFAULT_ATTENDANCE_TOKEN_EXPIRES_IN,
    },
  );
}

export function verifyAttendanceToken(token: string): AttendancePayload {
  let lastError: Error | undefined;

  for (const secret of getAttendanceVerificationSecrets()) {
    try {
      return verifyAttendancePayload(token, secret);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('Invalid attendance token');
}
