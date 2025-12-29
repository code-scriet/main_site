import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { EventStatus } from '@prisma/client';

export const eventsRouter = Router();

// Get all events with filtering
eventsRouter.get('/', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, search, limit = '10', offset = '0' } = req.query;
    const where: Record<string, unknown> = {};

    if (status && ['UPCOMING', 'ONGOING', 'PAST'].includes(status as string)) {
      where.status = status as EventStatus;
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: { _count: { select: { registrations: true } } },
      }),
      prisma.event.count({ where }),
    ]);

    const authUser = getAuthUser(req);
    const eventsWithRegistration = await Promise.all(
      events.map(async (event) => {
        let isRegistered = false;
        if (authUser) {
          const registration = await prisma.eventRegistration.findUnique({
            where: { userId_eventId: { userId: authUser.id, eventId: event.id } },
          });
          isRegistered = !!registration;
        }
        return { ...event, isRegistered };
      })
    );

    res.json({
      success: true,
      data: eventsWithRegistration,
      pagination: { total, limit: parseInt(limit as string), offset: parseInt(offset as string) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch events' } });
  }
});

eventsRouter.get('/upcoming', async (_req: Request, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      where: { status: 'UPCOMING', startDate: { gte: new Date() } },
      orderBy: { startDate: 'asc' },
      take: 5,
      include: { _count: { select: { registrations: true } } },
    });
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch upcoming events' } });
  }
});

eventsRouter.get('/:id', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { registrations: true } } },
    });

    if (!event) {
      return res.status(404).json({ success: false, error: { message: 'Event not found' } });
    }

    const authUser = getAuthUser(req);
    let isRegistered = false;
    if (authUser) {
      const registration = await prisma.eventRegistration.findUnique({
        where: { userId_eventId: { userId: authUser.id, eventId: event.id } },
      });
      isRegistered = !!registration;
    }

    const now = new Date();
    let registrationStatus = 'open';
    if (event.registrationStartDate && now < event.registrationStartDate) {
      registrationStatus = 'not_started';
    } else if (event.registrationEndDate && now > event.registrationEndDate) {
      registrationStatus = 'closed';
    } else if (event.capacity && event._count.registrations >= event.capacity) {
      registrationStatus = 'full';
    }

    res.json({
      success: true,
      data: { ...event, isRegistered, registrationStatus, spotsRemaining: event.capacity ? event.capacity - event._count.registrations : null },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch event' } });
  }
});

eventsRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const data = req.body;

    const event = await prisma.event.create({
      data: {
        title: data.title,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        registrationStartDate: data.registrationStartDate ? new Date(data.registrationStartDate) : null,
        registrationEndDate: data.registrationEndDate ? new Date(data.registrationEndDate) : null,
        location: data.location || null,
        venue: data.venue || null,
        eventType: data.eventType || null,
        prerequisites: data.prerequisites || null,
        capacity: data.capacity ? parseInt(data.capacity) : null,
        imageUrl: data.imageUrl || null,
        status: data.status || 'UPCOMING',
        createdBy: authUser.id,
      },
    });

    await auditLog(authUser.id, 'CREATE', 'event', event.id, { title: event.title });
    res.status(201).json({ success: true, data: event, message: 'Event created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create event' } });
  }
});

eventsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const data = req.body;

    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.registrationStartDate !== undefined && { registrationStartDate: data.registrationStartDate ? new Date(data.registrationStartDate) : null }),
        ...(data.registrationEndDate !== undefined && { registrationEndDate: data.registrationEndDate ? new Date(data.registrationEndDate) : null }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.venue !== undefined && { venue: data.venue }),
        ...(data.eventType !== undefined && { eventType: data.eventType }),
        ...(data.prerequisites !== undefined && { prerequisites: data.prerequisites }),
        ...(data.capacity !== undefined && { capacity: data.capacity ? parseInt(data.capacity) : null }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.status && { status: data.status }),
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'event', event.id);
    res.json({ success: true, data: event, message: 'Event updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update event' } });
  }
});

eventsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    await prisma.event.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'event', req.params.id);
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete event' } });
  }
});

eventsRouter.get('/:id/registrations', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      orderBy: { timestamp: 'asc' },
    });
    res.json({ success: true, data: registrations });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

eventsRouter.get('/:id/registrations/export', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { registrations: { include: { user: { select: { name: true, email: true } } } } },
    });

    if (!event) {
      return res.status(404).json({ success: false, error: { message: 'Event not found' } });
    }

    const csv = ['Name,Email,Registered At', ...event.registrations.map((r) => `"${r.user.name}","${r.user.email}","${r.timestamp.toISOString()}"`)].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '_')}_registrations.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to export registrations' } });
  }
});
