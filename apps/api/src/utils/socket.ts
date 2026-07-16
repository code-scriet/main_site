import { Server as SocketIOServer, type ServerOptions, type Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createRequire } from 'node:module';
import { logger } from './logger.js';
import { authenticateSocketConnection } from './socketAuth.js';
import { getSocketClientIp } from './clientIp.js';
import { resolveSocketConnectKey } from './socketConnectKey.js';
import { getInternalApiSecret, getPlaygroundRelayBase } from './internalApi.js';

let io: SocketIOServer | null = null;

// S7a: sync CJS require inside this ESM module — used to lazy-load the OPTIONAL
// native `eiows` engine, which is the DEFAULT WebSocket engine (see
// resolveWsEngine below); a require failure falls back to stock `ws`.
const nodeRequire = createRequire(import.meta.url);

// ─── WebSocket engine selection (S7a) ────────────────────────────────────────
// eiows (a µWebSockets C++ fork) is the DEFAULT engine — ≈5-8x lower
// per-connection memory than stock JS `ws`, the lever that raises the
// ~900-concurrent socket ceiling. It stays an optionalDependency, so the
// selection can never hard-break startup:
//   • (default)             → use eiows
//   • WS_ENGINE=ws          → force stock `ws` (instant, no-code rollback)
//   • eiows unavailable     → AUTOMATICALLY fall back to `ws`, but LOUDLY (error
//                             log + the /health `wsEngine` field), so a silent
//                             native-build regression can't quietly cost you the
//                             headroom while you believe eiows is active
//   • WS_ENGINE_STRICT=true → refuse to boot instead of falling back, so a
//                             regressed build fails the DEPLOY, not production
// The Socket.IO wire protocol is identical either way — socket.io-client on
// web/playground is unaffected.
export type WsEngineName = 'eiows' | 'ws';

// Pure, unit-tested decision core: given the env intent + a loader (which throws
// when eiows can't be required), pick the engine. `strict` turns a load failure
// into a thrown error instead of a `ws` fallback; the load error is returned (not
// swallowed) so the caller can log it.
export function chooseWsEngine(opts: {
  forceStock: boolean;
  strict: boolean;
  loadEiows: () => { Server: unknown };
}): { engine: WsEngineName; server: unknown; error?: unknown } {
  if (opts.forceStock) return { engine: 'ws', server: undefined };
  try {
    const mod = opts.loadEiows();
    return { engine: 'eiows', server: mod.Server };
  } catch (err) {
    if (opts.strict) throw err;
    return { engine: 'ws', server: undefined, error: err };
  }
}

let activeWsEngine: WsEngineName = 'ws';
/** The WebSocket engine actually in use after initializeSocket() — surfaced on /health. */
export function getActiveWsEngine(): WsEngineName {
  return activeWsEngine;
}

function resolveWsEngine(): ServerOptions['wsEngine'] {
  const forceStock = process.env.WS_ENGINE === 'ws';
  const strict = process.env.WS_ENGINE_STRICT === 'true';
  let result: ReturnType<typeof chooseWsEngine>;
  try {
    result = chooseWsEngine({
      forceStock,
      strict,
      loadEiows: () => nodeRequire('eiows') as { Server: unknown },
    });
  } catch (err) {
    // Only reachable with WS_ENGINE_STRICT=true and eiows unavailable: fail loud.
    logger.error('Socket.IO: eiows required (WS_ENGINE_STRICT=true) but failed to load — refusing to start', {
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  activeWsEngine = result.engine;
  if (result.engine === 'eiows') {
    logger.info('Socket.IO: using eiows (C++) WebSocket engine (low-memory default)');
  } else if (forceStock) {
    logger.info('Socket.IO: WebSocket engine forced to stock `ws` (WS_ENGINE=ws)');
  } else {
    logger.error(
      'Socket.IO: eiows unavailable — FELL BACK to stock `ws`. The ~5-8x per-connection memory headroom is NOT active. Rebuild eiows, or set WS_ENGINE=ws to make this intentional (or WS_ENGINE_STRICT=true to fail the deploy instead).',
      { err: result.error instanceof Error ? result.error.message : String(result.error) },
    );
  }
  return result.server as ServerOptions['wsEngine'];
}

const SOCKET_CONNECT_WINDOW_MS = 60 * 1000;
// Allowance PER BUCKET KEY. The key is now NAT-safe (resolveSocketConnectKey):
// a verified session gets a `u:<userId>` bucket, anonymous/invalid handshakes
// share the `ip:<ip>` bucket. 30/60s is the same budget the whole IP had
// before — now it's PER PERSON for authenticated users (sockets legitimately
// reconnect on tab refocus / network blips), while anonymous handshakes keep
// 30/IP/60s as pure abuse protection (they're rejected by namespace auth
// anyway). The 200-250 student campus-NAT contest hall is no longer capped at
// 30 dashboard/notification sockets per minute campus-wide.
const SOCKET_CONNECT_MAX_PER_WINDOW = 30;
// Bounded: one entry per active bucket key in a 2×window span (~250 users ⇒
// ~250 entries), swept below. Keyed by the resolveSocketConnectKey string.
const socketConnectionRateMap = new Map<string, { count: number; windowStart: number }>();
const SOCKET_PING_TIMEOUT_MS = Number(process.env.SOCKET_PING_TIMEOUT_MS || 30000);
const SOCKET_PING_INTERVAL_MS = Number(process.env.SOCKET_PING_INTERVAL_MS || 10000);

// S2: IP resolution moved to utils/clientIp.ts. The old local version keyed
// the limiter on the FIRST X-Forwarded-For entry — fully client-controlled,
// so a direct-to-origin client could rotate XFF to defeat the 30-conn/min cap.
// Campus-NAT fix: the limiter now keys on resolveSocketConnectKey (per-user for
// verified sessions, per-IP otherwise) instead of the raw IP.

function isConnectionAllowed(key: string): boolean {
  const now = Date.now();
  const current = socketConnectionRateMap.get(key);

  if (!current || now - current.windowStart > SOCKET_CONNECT_WINDOW_MS) {
    socketConnectionRateMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  current.count += 1;
  socketConnectionRateMap.set(key, current);
  return current.count <= SOCKET_CONNECT_MAX_PER_WINDOW;
}

/** Resolve the NAT-safe bucket key for a handshake (per-user or per-IP). */
function socketConnectKey(socket: Socket): string {
  return resolveSocketConnectKey({
    ip: getSocketClientIp(socket),
    auth: socket.handshake.auth,
    headers: socket.handshake.headers,
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of socketConnectionRateMap.entries()) {
    if (now - entry.windowStart > SOCKET_CONNECT_WINDOW_MS * 2) {
      socketConnectionRateMap.delete(key);
    }
  }
}, SOCKET_CONNECT_WINDOW_MS).unref();

export function initializeSocket(httpServer: HTTPServer) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const wsEngine = resolveWsEngine();

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
    // S7a: opt-in native engine (WS_ENGINE=eiows). The key MUST be omitted (not
    // set to undefined) when unused: engine.io merges opts with Object.assign,
    // which copies an explicit `wsEngine: undefined` OVER its `ws` default and
    // would crash every connection. Every option above is preserved either way.
    ...(wsEngine ? { wsEngine } : {}),
  });

  io.use((socket, next) => {
    const connectKey = socketConnectKey(socket);
    if (!isConnectionAllowed(connectKey)) {
      logger.warn('Socket connection rate limit exceeded', { key: connectKey });
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
    const connectKey = socketConnectKey(socket);
    if (!isConnectionAllowed(connectKey)) {
      logger.warn('Socket connection rate limit exceeded', { key: connectKey, ns: '/notifications' });
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
  if (!userId) return;
  // The /competition namespace lives on the playground relay — tell it to drop this
  // user's contest sockets too (best-effort; force-logout still works without it).
  const relayBase = getPlaygroundRelayBase();
  const relaySecret = getInternalApiSecret();
  if (relayBase && relaySecret) {
    void fetch(`${relayBase}/internal/disconnect-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': relaySecret },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => undefined);
  }
  if (!io) return;
  const namespaces = ['/', '/quiz', '/notifications', '/attendance'];
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
