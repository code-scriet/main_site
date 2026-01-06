import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

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
    console.log('Client connected:', socket.id);
    
    // Send a test ping to the client
    socket.emit('ping', { message: 'Hello from server', time: new Date().toISOString() });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
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
    if (!io) console.warn('Socket.io not initialized, cannot emit user:created');
    else console.log('Emitting user:created', { userId });
    io?.emit('user:created', { userId });
  },
  userUpdated: (userId: string) => {
    if (!io) console.warn('Socket.io not initialized, cannot emit user:updated');
    else console.log('Emitting user:updated', { userId });
    io?.emit('user:updated', { userId });
  },
  userDeleted: (userId: string) => {
    if (!io) console.warn('Socket.io not initialized, cannot emit user:deleted');
    else console.log('Emitting user:deleted', { userId });
    io?.emit('user:deleted', { userId });
  },
  eventCreated: (eventId: string) => {
    io?.emit('event:created', { eventId });
  },
  eventUpdated: (eventId: string) => {
    io?.emit('event:updated', { eventId });
  },
  eventDeleted: (eventId: string) => {
    io?.emit('event:deleted', { eventId });
  },
  registrationCreated: (eventId: string, userId: string) => {
    io?.emit('registration:created', { eventId, userId });
  },
  registrationDeleted: (eventId: string, userId: string) => {
    io?.emit('registration:deleted', { eventId, userId });
  },
};
