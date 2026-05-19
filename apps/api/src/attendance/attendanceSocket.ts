import { Server } from 'socket.io';
import { authenticateSocketConnection } from '../utils/socketAuth.js';
import { logger } from '../utils/logger.js';

export function initializeAttendanceSocket(io: Server): void {
  const ns = io.of('/attendance');

  ns.use((socket, next) => {
    void authenticateSocketConnection(socket)
      .then((authUser) => {
        // Role is sourced from DB (not the JWT claim) so role downgrades take effect
        // immediately for fresh handshakes. The shared helper also enforces
        // tokenVersion + isDeleted, so force-logout / soft-delete cannot reconnect.
        socket.data.userId = authUser.id;
        socket.data.role = authUser.role;
        next();
      })
      .catch((error) => {
        next(new Error(error instanceof Error ? error.message : 'AUTH_INVALID'));
      });
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
