// /competition Socket.io namespace (Phase G). Contestants and admins join a round room
// and receive live pushes (leaderboard, clarifications, first-solve, status, proctor).
// Mirrors the attendance-socket structure; auth is DB-sourced (role downgrades + force
// logout take effect on the handshake). Free-tier safe: one connection per active
// client, fan-out to rooms only — no per-user server buffers.

import { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { authenticateSocketConnection } from '../utils/socketAuth.js';
import { hasPermission } from '../middleware/role.js';
import { logger } from '../utils/logger.js';
import { roomAll, roomAdmin, roomUser } from './competitionRealtime.js';

export function initCompetitionSocket(io: Server): void {
  const ns = io.of('/competition');

  ns.use((socket, next) => {
    void authenticateSocketConnection(socket)
      .then((authUser) => {
        socket.data.userId = authUser.id;
        socket.data.role = authUser.role;
        next();
      })
      .catch((error) => next(new Error(error instanceof Error ? error.message : 'AUTH_INVALID')));
  });

  ns.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const role = socket.data.role as string;

    socket.on('join', async (payload: { roundId?: string }) => {
      const roundId = payload?.roundId;
      if (!roundId || typeof roundId !== 'string') {
        socket.emit('contest:error', { message: 'roundId required' });
        return;
      }
      try {
        const round = await prisma.competitionRound.findUnique({ where: { id: roundId }, select: { eventId: true } });
        if (!round) {
          socket.emit('contest:error', { message: 'Round not found' });
          return;
        }
        if (hasPermission(role, 'ADMIN')) {
          socket.join(roomAdmin(roundId));
          return;
        }
        const reg = await prisma.eventRegistration.findUnique({
          where: { userId_eventId: { userId, eventId: round.eventId } },
          select: { id: true },
        });
        if (!reg) {
          socket.emit('contest:error', { message: 'Not registered for this event' });
          return;
        }
        socket.join(roomAll(roundId));
        socket.join(roomUser(roundId, userId)); // targeted proctor lock/unlock
      } catch (error) {
        logger.warn('competition socket join failed', { roundId, error: error instanceof Error ? error.message : String(error) });
        socket.emit('contest:error', { message: 'Could not join round' });
      }
    });

    socket.on('leave', (payload: { roundId?: string }) => {
      const roundId = payload?.roundId;
      if (!roundId) return;
      socket.leave(roomAll(roundId));
      socket.leave(roomAdmin(roundId));
      socket.leave(roomUser(roundId, userId));
    });

    socket.on('disconnect', () => {
      delete socket.data.userId;
      delete socket.data.role;
    });
  });

  logger.info('Competition socket namespace initialized on /competition');
}
