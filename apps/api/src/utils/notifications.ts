// Dashboard v3 — notification broadcast helper.
// Writes a NotificationFeed row + emits a `notification:broadcast` socket event so connected
// clients can refresh their bell in real time.

import { Prisma, NotificationSource, NotificationAudience } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getIO } from './socket.js';
import { logger } from './logger.js';

export interface BroadcastInput {
  source: NotificationSource;
  audience: NotificationAudience;
  audienceRoles?: string[];
  audienceUserIds?: string[];
  category?: string;
  icon?: string;
  title: string;
  body?: string;
  link?: string;
  refEntity?: string;
  refEntityId?: string;
  expiresAt?: Date;
  createdById?: string | null;
}

export async function broadcastNotification(input: BroadcastInput) {
  const created = await prisma.notificationFeed.create({
    data: {
      source: input.source,
      audience: input.audience,
      audienceRoles: input.audienceRoles ? (input.audienceRoles as unknown as Prisma.InputJsonValue) : undefined,
      audienceUserIds: input.audienceUserIds ? (input.audienceUserIds as unknown as Prisma.InputJsonValue) : undefined,
      category: input.category ?? 'system',
      icon: input.icon ?? 'bell',
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 2000),
      link: input.link?.slice(0, 500),
      refEntity: input.refEntity,
      refEntityId: input.refEntityId,
      expiresAt: input.expiresAt,
      createdById: input.createdById ?? null,
    },
  });

  // Live ping: every connected /notifications client gets a heads-up to refetch.
  // We don't push the payload itself (clients fetch the full aggregate to apply audience filters).
  try {
    const io = getIO();
    io?.of('/notifications').emit('notification:broadcast', { id: created.id, audience: input.audience });
  } catch (error) {
    logger.error('Failed to emit notification:broadcast', { error: error instanceof Error ? error.message : String(error) });
  }

  return created;
}
