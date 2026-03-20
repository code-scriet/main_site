import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from './logger.js';

let io: SocketIOServer | null = null;

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
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket'],
    maxHttpBufferSize: 1e6,
    upgradeTimeout: 10000,
  });

  io.on('connection', (socket) => {
    logger.debug('Client connected', { socketId: socket.id });
    
    // Send a test ping to the client
    socket.emit('ping', { message: 'Hello from server', time: new Date().toISOString() });
    
    socket.on('disconnect', () => {
      logger.debug('Client disconnected', { socketId: socket.id });
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
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
};
