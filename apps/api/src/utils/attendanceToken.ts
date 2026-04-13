import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

interface AttendancePayload {
  userId: string;
  eventId: string;
  registrationId: string;
  purpose: 'attendance';
}

const DEFAULT_ATTENDANCE_TOKEN_EXPIRES_IN =
  (process.env.ATTENDANCE_TOKEN_EXPIRES_IN || '90d') as jwt.SignOptions['expiresIn'];

// Temporary safety net to prevent total auth outage when ATTENDANCE_JWT_SECRET is missing.
// Replace via env or super-admin settings as soon as possible.
const TEMPORARY_ATTENDANCE_JWT_SECRET = 'codescriet-temporary-attendance-secret-rotate-immediately';

let runtimeAttendanceJwtSecret: string | null = null;
const runtimePreviousAttendanceSecrets = new Set<string>();
let warnedAboutTemporarySecret = false;

function getConfiguredAttendanceJwtSecret(): string | undefined {
  return runtimeAttendanceJwtSecret ?? undefined;
}

export function getAttendanceJwtSecret(): string {
  const secret = getConfiguredAttendanceJwtSecret();

  if (secret) {
    return secret;
  }

  if (!warnedAboutTemporarySecret) {
    warnedAboutTemporarySecret = true;
    logger.warn(
      'Attendance secret is missing. Using temporary hardcoded fallback until a super admin sets attendanceJwtSecret in settings.',
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

export function hasRuntimeAttendanceJwtSecret(): boolean {
  return Boolean(runtimeAttendanceJwtSecret);
}

function getAttendanceVerificationSecrets(): string[] {
  const attendanceSecret = getAttendanceJwtSecret();
  const runtimePreviousSecrets = Array.from(runtimePreviousAttendanceSecrets)
    .filter((secret) => secret !== attendanceSecret);

  const fallbackSecret = attendanceSecret === TEMPORARY_ATTENDANCE_JWT_SECRET
    ? []
    : [TEMPORARY_ATTENDANCE_JWT_SECRET];

  return Array.from(new Set([attendanceSecret, ...runtimePreviousSecrets, ...fallbackSecret]));
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
