import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from './logger.js';
import { authenticateSocketConnection } from './socketAuth.js';
import { getSocketClientIp } from './clientIp.js';

let io: SocketIOServer | null = null;

const SOCKET_CONNECT_WINDOW_MS = 60 * 1000;
const SOCKET_CONNECT_MAX_PER_WINDOW = 30;
const socketConnectionRateMap = new Map<string, { count: number; windowStart: number }>();
const SOCKET_PING_TIMEOUT_MS = Number(process.env.SOCKET_PING_TIMEOUT_MS || 30000);
const SOCKET_PING_INTERVAL_MS = Number(process.env.SOCKET_PING_INTERVAL_MS || 10000);

// S2: IP resolution moved to utils/clientIp.ts. The old local version keyed
// the limiter on the FIRST X-Forwarded-For entry — fully client-controlled,
// so a direct-to-origin client could rotate XFF to defeat the 30-conn/min cap.

function isConnectionAllowed(ip: string): boolean {
  const now = Date.now();
  const current = socketConnectionRateMap.get(ip);

  if (!current || now - current.windowStart > SOCKET_CONNECT_WINDOW_MS) {
    socketConnectionRateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  current.count += 1;
  socketConnectionRateMap.set(ip, current);
  return current.count <= SOCKET_CONNECT_MAX_PER_WINDOW;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of socketConnectionRateMap.entries()) {
    if (now - entry.windowStart > SOCKET_CONNECT_WINDOW_MS * 2) {
      socketConnectionRateMap.delete(ip);
    }
  }
}, SOCKET_CONNECT_WINDOW_MS).unref();

export function initializeSocket(httpServer: HTTPServer) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        // Allow localhost for development
        if (origin.startsWith('http://localhost:')) {
          return callback(null, true);
        }

        // Allow private LAN origins in development (same Wi-Fi testing)
        if (
          isDevelopment &&
          (
            origin.startsWith('http://127.0.0.1:') ||
            /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(origin)
          )
        ) {
          return callback(null, true);
        }
        
        // Allow production frontend
        if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
          return callback(null, true);
        }
        
        // Allow codescriet.dev domains - explicit allowlist to prevent subdomain takeover
        const ALLOWED_CODESCRIET_ORIGINS = [
          'https://codescriet.dev',
          'https://www.codescriet.dev',
          'https://api.codescriet.dev',
          'https://code.codescriet.dev',
          'https://app.codescriet.dev',
        ];
        if (ALLOWED_CODESCRIET_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    // Lower defaults tighten stale-connection detection for large live quizzes.
    pingTimeout: SOCKET_PING_TIMEOUT_MS,
    pingInterval: SOCKET_PING_INTERVAL_MS,
    transports: ['websocket'],
    maxHttpBufferSize: 1e6,
    upgradeTimeout: 10000,
  });

  io.use((socket, next) => {
    const ip = getSocketClientIp(socket);
    if (!isConnectionAllowed(ip)) {
      logger.warn('Socket connection rate limit exceeded', { ip });
      next(new Error('RATE_LIMITED'));
      return;
    }

    void authenticateSocketConnection(socket, { requireAdmin: true })
      .then(() => next())
      .catch((error) => {
        next(new Error(error instanceof Error ? error.message : 'AUTH_INVALID'));
      });
  });

  io.on('connection', (socket) => {
    const authUser = socket.data.authUser as { id: string; role: string } | undefined;
    logger.debug('Client connected', { socketId: socket.id, userId: authUser?.id, role: authUser?.role });

    socket.emit('ping', { message: 'Hello from server', time: new Date().toISOString() });

    socket.on('disconnect', () => {
      logger.debug('Client disconnected', { socketId: socket.id, userId: authUser?.id });
    });
  });

  // /notifications namespace — open to all authenticated users.
  // Each connecting client joins room `user:<userId>` and receives targeted notification pushes
  // (invitation:received, certificate:issued, quiz:starting). Free-tier safe: no per-user buffers,
  // just one socket connection per active client, events fan out to room only.
  const notificationsNs = io.of('/notifications');
  notificationsNs.use((socket, next) => {
    const ip = getSocketClientIp(socket);
    if (!isConnectionAllowed(ip)) {
      next(new Error('RATE_LIMITED'));
      return;
    }
    void authenticateSocketConnection(socket, { requireAdmin: false })
      .then(() => next())
      .catch((error) => {
        next(new Error(error instanceof Error ? error.message : 'AUTH_INVALID'));
      });
  });
  notificationsNs.on('connection', (socket) => {
    const authUser = socket.data.authUser as { id: string } | undefined;
    if (authUser?.id) {
      socket.join(`user:${authUser.id}`);
    }
    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Disconnect every live Socket.io session that belongs to `userId` across all
 * namespaces. Called from force-logout, soft-delete, and hard-delete handlers
 * to immediately revoke the user's active socket connections — handshake-time
 * tokenVersion / isDeleted enforcement (in `socketAuth.ts`) only blocks NEW
 * connections, so this sweep is required to terminate the ones that were
 * already open at the moment of revocation.
 *
 * Safe to call when Socket.io isn't initialized (no-op).
 */
export async function disconnectUserSockets(userId: string): Promise<void> {
  if (!io || !userId) return;
  const namespaces = ['/', '/quiz', '/notifications', '/attendance', '/competition'];
  for (const nsName of namespaces) {
    try {
      const ns = io.of(nsName);
      const sockets = await ns.fetchSockets();
      for (const s of sockets) {
        const data = s.data as { authUser?: { id?: string }; userId?: string };
        const sid = data?.authUser?.id || data?.userId;
        if (sid === userId) {
          try {
            s.disconnect(true);
          } catch (err) {
            logger.warn('Failed to disconnect socket', { nsName, userId, err: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to sweep namespace for user sockets', { nsName, userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}

// Event emitters for different data types
export const socketEvents = {
  userCreated: (userId: string) => {
    if (!io) logger.warn('Socket.io not initialized, cannot emit user:created');
    else logger.debug('Emitting user:created', { userId });
    try {
      io?.emit('user:created', { userId });
    } catch (error) {
      logger.error('Failed to emit user:created', { userId, error: error instanceof Error ? error.message : String(error) });
    }
  },
  userUpdated: (userId: string) => {
    if (!io) logger.warn('Socket.io not initialized, cannot emit user:updated');
    else logger.debug('Emitting user:updated', { userId });
    try {
      io?.emit('user:updated', { userId });
    } catch (error) {
      logger.error('Failed to emit user:updated', { userId, error: error instanceof Error ? error.message : String(error) });
    }
  },
  userDeleted: (userId: string) => {
    if (!io) logger.warn('Socket.io not initialized, cannot emit user:deleted');
    else logger.debug('Emitting user:deleted', { userId });
    try {
      io?.emit('user:deleted', { userId });
    } catch (error) {
      logger.error('Failed to emit user:deleted', { userId, error: error instanceof Error ? error.message : String(error) });
    }
  },
  /** Dashboard v2 notification pushes — fan out to the recipient's user room on /notifications namespace. */
  invitationReceived: (toUserId: string, payload: { invitationId: string; eventTitle: string; inviter: string }) => {
    try {
      io?.of('/notifications').to(`user:${toUserId}`).emit('invitation:received', payload);
    } catch (error) {
      logger.error('Failed to emit invitation:received', { toUserId, error: error instanceof Error ? error.message : String(error) });
    }
  },
  certificateIssued: (toUserId: string, payload: { certId: string; eventName: string; type: string }) => {
    try {
      io?.of('/notifications').to(`user:${toUserId}`).emit('certificate:issued', payload);
    } catch (error) {
      logger.error('Failed to emit certificate:issued', { toUserId, error: error instanceof Error ? error.message : String(error) });
    }
  },
  quizStarting: (payload: { quizId: string; title: string; pin?: string | null }) => {
    try {
      io?.of('/notifications').emit('quiz:starting', payload);
    } catch (error) {
      logger.error('Failed to emit quiz:starting', { error: error instanceof Error ? error.message : String(error) });
    }
  },
};
