import jwt from 'jsonwebtoken';
import { getJwtSecret } from './jwt.js';

interface AttendancePayload {
  userId: string;
  eventId: string;
  registrationId: string;
  purpose: 'attendance';
}

export function generateAttendanceToken(userId: string, eventId: string, registrationId: string): string {
  return jwt.sign(
    { userId, eventId, registrationId, purpose: 'attendance' } satisfies AttendancePayload,
    getJwtSecret(),
    {
      algorithm: 'HS256',
      // No expiresIn — token validity is controlled by:
      // 1. attended flag (single-use)
      // 2. eventId in payload (event-scoped)
      // 3. scan window check in scan endpoint (time-scoped)
    },
  );
}

export function verifyAttendanceToken(token: string): AttendancePayload {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as AttendancePayload;
  if (decoded.purpose !== 'attendance') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
}
