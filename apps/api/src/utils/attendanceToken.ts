import jwt from 'jsonwebtoken';

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

function getConfiguredAttendanceJwtSecret(): string | undefined {
  for (const key of ATTENDANCE_JWT_SECRET_ENV_CANDIDATES) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
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

  if (!secret) {
    throw new Error(
      'ATTENDANCE_JWT_SECRET must be configured. Attendance tokens cannot share JWT_SECRET.',
    );
  }

  return secret;
}

function getAttendanceVerificationSecrets(): string[] {
  const attendanceSecret = getAttendanceJwtSecret();
  const previousSecrets = getConfiguredPreviousAttendanceSecrets()
    .filter((secret) => secret !== attendanceSecret);

  return [attendanceSecret, ...previousSecrets];
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
