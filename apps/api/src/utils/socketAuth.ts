import type { Socket } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from './jwt.js';

export interface SocketAuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
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
  options: { requireAdmin?: boolean } = {},
): Promise<SocketAuthUser> {
  const token = extractSocketToken(socket);
  if (!token) {
    throw new Error('AUTH_REQUIRED');
  }

  let decodedUserId: string;
  try {
    decodedUserId = verifyToken(token).userId;
  } catch {
    throw new Error('AUTH_INVALID');
  }

  const authUser = await prisma.user.findUnique({
    where: { id: decodedUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!authUser) {
    throw new Error('AUTH_INVALID');
  }

  if (options.requireAdmin && !['ADMIN', 'PRESIDENT'].includes(authUser.role)) {
    throw new Error('FORBIDDEN');
  }

  (socket as AuthenticatedSocket).data.authUser = authUser;
  return authUser;
}
