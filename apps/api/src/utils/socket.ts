import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from './logger.js';

let io: SocketIOServer | null = null;

export function initializeSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        // Allow localhost for development
        if (origin.startsWith('http://localhost:')) {
          return callback(null, true);
        }
        
        // Allow production frontend
        if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
          return callback(null, true);
        }
        
        // Allow codescriet.dev domains
        if (origin.endsWith('.codescriet.dev') || origin === 'https://codescriet.dev') {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
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
    io?.emit('user:created', { userId });
  },
  userUpdated: (userId: string) => {
    if (!io) logger.warn('Socket.io not initialized, cannot emit user:updated');
    else logger.debug('Emitting user:updated', { userId });
    io?.emit('user:updated', { userId });
  },
  userDeleted: (userId: string) => {
    if (!io) logger.warn('Socket.io not initialized, cannot emit user:deleted');
    else logger.debug('Emitting user:deleted', { userId });
    io?.emit('user:deleted', { userId });
  },
};
