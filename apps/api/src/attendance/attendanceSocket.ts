import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

export function initializeAttendanceSocket(io: Server): void {
  const ns = io.of('/attendance');

  ns.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const decoded = verifyToken(token);
      socket.data.userId = decoded.userId;
      socket.data.role = decoded.role;
      next();
    } catch {
      next(new Error('Invalid authentication token'));
    }
  });

  ns.on('connection', (socket) => {
    logger.debug('Attendance socket connected', { userId: socket.data.userId });

    socket.on('join:event', (eventId: string) => {
      if (!['ADMIN', 'PRESIDENT', 'CORE_MEMBER'].includes(socket.data.role)) {
        socket.emit('error', { message: 'Core member or admin role required' });
        return;
      }
      socket.join(`event:${eventId}`);
      logger.debug('Admin joined attendance room', { userId: socket.data.userId, eventId });
    });

    socket.on('leave:event', (eventId: string) => {
      socket.leave(`event:${eventId}`);
    });

    socket.on('disconnect', () => {
      logger.debug('Attendance socket disconnected', { userId: socket.data.userId });
      delete socket.data.userId;
      delete socket.data.role;
    });
  });

  logger.info('Attendance socket namespace initialized on /attendance');
}
