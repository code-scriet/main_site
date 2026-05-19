import type { Socket } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from './jwt.js';

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

  const authUser = await prisma.user.findUnique({
    where: { id: claimUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      // admin-deep-control: enforce force-logout (tokenVersion) + soft-delete (isDeleted)
      // on every socket handshake. HTTP authMiddleware already enforces these — the
      // socket layer must mirror them or revocation is bypassable via Socket.io.
      tokenVersion: true,
      isDeleted: true,
    },
  });

  if (!authUser) {
    throw new Error('AUTH_INVALID');
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
