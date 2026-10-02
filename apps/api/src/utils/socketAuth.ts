import type { Socket } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from './jwt.js';
import { getCachedAuthUser, setCachedAuthUser, type CachedAuthUser } from './userAuthCache.js';

export interface SocketAuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tokenVersion: number;
}

type AuthenticatedSocket = Socket & {
  data: Socket['data'] & {
    authUser?: SocketAuthUser;
  };
};

function extractSocketToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const authorizationHeader = socket.handshake.headers.authorization;
  if (typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.slice(7).trim();
  }

  return null;
}

export async function authenticateSocketConnection(
  socket: Socket,
  options: { requireAdmin?: boolean; requireCoreMember?: boolean } = {},
): Promise<SocketAuthUser> {
  const token = extractSocketToken(socket);
  if (!token) {
    throw new Error('AUTH_REQUIRED');
  }

  // Decode the JWT once so we can compare its tokenVersion claim against the DB
  // watermark below. Legacy tokens (no claim) are treated as 0.
  // verifyToken also enforces the purpose allowlist (audit S1): special-purpose
  // tokens (oauth_exchange, invitation_claim, quiz_access — and attendance QR
  // as defense-in-depth) are rejected there, so they can never authenticate a
  // socket either.
  let claimUserId: string;
  let claimTokenVersion = 0;
  try {
    const decoded = verifyToken(token);
    claimUserId = decoded.userId;
    if (typeof decoded.tokenVersion === 'number') {
      claimTokenVersion = decoded.tokenVersion;
    }
  } catch {
    throw new Error('AUTH_INVALID');
  }

  // Shared 30s bounded LRU with HTTP authMiddleware (utils/userAuthCache.ts):
  // a 900-player quiz join burst was 900 point reads even though most players
  // hit an API route moments earlier. Revocation semantics are identical to
  // HTTP — same TTL, same invalidateCachedAuthUser() on every user-row
  // mutation — and the isDeleted/tokenVersion checks below run on cached
  // entries too, so force-logout and soft-delete still propagate within 30s
  // worst-case (instantly when the mutation invalidates the entry).
  let authUser: CachedAuthUser | null = getCachedAuthUser(claimUserId);
  if (!authUser) {
    const row = await prisma.user.findUnique({
      where: { id: claimUserId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        // admin-deep-control: enforce force-logout (tokenVersion) + soft-delete (isDeleted)
        // on every socket handshake. HTTP authMiddleware already enforces these — the
        // socket layer must mirror them or revocation is bypassable via Socket.io.
        tokenVersion: true,
        isDeleted: true,
      },
    });
    if (!row) {
      throw new Error('AUTH_INVALID');
    }
    authUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      avatar: row.avatar,
      phone: row.phone,
      course: row.course,
      branch: row.branch,
      year: row.year,
      profileCompleted: row.profileCompleted,
      tokenVersion: typeof row.tokenVersion === 'number' ? row.tokenVersion : 0,
      isDeleted: row.isDeleted,
    };
    setCachedAuthUser(authUser);
  }

  if (authUser.isDeleted) {
    throw new Error('AUTH_INVALID');
  }

  const dbTokenVersion = typeof authUser.tokenVersion === 'number' ? authUser.tokenVersion : 0;
  if (dbTokenVersion > claimTokenVersion) {
    throw new Error('AUTH_INVALID');
  }

  if (options.requireAdmin && !['ADMIN', 'PRESIDENT'].includes(authUser.role)) {
    throw new Error('FORBIDDEN');
  }

  if (options.requireCoreMember && !['ADMIN', 'PRESIDENT', 'CORE_MEMBER'].includes(authUser.role)) {
    throw new Error('FORBIDDEN');
  }

  const result: SocketAuthUser = {
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
    role: authUser.role,
    tokenVersion: dbTokenVersion,
  };
  (socket as AuthenticatedSocket).data.authUser = result;
  return result;
}
