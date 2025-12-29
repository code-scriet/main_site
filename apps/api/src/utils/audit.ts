import { prisma } from '../lib/prisma.js';

export const auditLog = async (
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  metadata?: object
) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        metadata: metadata || undefined,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
};
