import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

export const registrationsRouter = Router();

// Register for an event
registrationsRouter.post('/events/:eventId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { _count: { select: { registrations: true } } },
    });

    if (!event) {
      return res.status(404).json({ success: false, error: { message: 'Event not found' } });
    }

    // Cannot register for past events
    if (event.status === 'PAST') {
      return res.status(400).json({ success: false, error: { message: 'Cannot register for a past event' } });
    }

    const now = new Date();
    if (event.registrationStartDate && now < event.registrationStartDate) {
      return res.status(400).json({ success: false, error: { message: 'Registration has not started yet' } });
    }

    // Check if registration has ended
    // If allowLateRegistration is enabled, registration can extend past event start
    // Otherwise, registration closes at either registrationEndDate or event start, whichever is earlier
    const eventStart = new Date(event.startDate);
    let registrationClosed = false;
    
    if (event.allowLateRegistration) {
      // Late registration allowed: only check registrationEndDate
      if (event.registrationEndDate && now > event.registrationEndDate) {
        registrationClosed = true;
      }
    } else {
      // Standard behavior: registration closes at registrationEndDate or event start
      const effectiveEndDate = event.registrationEndDate 
        ? new Date(event.registrationEndDate) 
        : eventStart;
      if (now > effectiveEndDate) {
        registrationClosed = true;
      }
    }
    
    if (registrationClosed) {
      return res.status(400).json({ success: false, error: { message: 'Registration has ended' } });
    }

    if (event.capacity && event._count.registrations >= event.capacity) {
      return res.status(400).json({ success: false, error: { message: 'Event is full' } });
    }

    const existing = await prisma.eventRegistration.findUnique({
      where: { userId_eventId: { userId: authUser.id, eventId } },
    });

    if (existing) {
      return res.status(400).json({ success: false, error: { message: 'Already registered for this event' } });
    }

    const registration = await prisma.eventRegistration.create({
      data: { userId: authUser.id, eventId },
      include: { event: { select: { id: true, title: true, startDate: true } } },
    });

    await auditLog(authUser.id, 'REGISTER', 'event', eventId, { eventTitle: event.title });

    res.status(201).json({
      success: true,
      data: registration,
      message: `Successfully registered for ${event.title}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to register' } });
  }
});

// Unregister from an event
registrationsRouter.delete('/events/:eventId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { eventId } = req.params;

    const registration = await prisma.eventRegistration.findUnique({
      where: { userId_eventId: { userId: authUser.id, eventId } },
      include: { event: { select: { id: true, title: true, startDate: true } } },
    });

    if (!registration) {
      return res.status(404).json({ success: false, error: { message: 'Not registered for this event' } });
    }

    if (registration.event.startDate < new Date()) {
      return res.status(400).json({ success: false, error: { message: 'Cannot unregister from an event that has already started' } });
    }

    await prisma.eventRegistration.delete({
      where: { userId_eventId: { userId: authUser.id, eventId } },
    });

    await auditLog(authUser.id, 'UNREGISTER', 'event', eventId, { eventTitle: registration.event.title });

    res.json({ success: true, message: `Successfully unregistered from ${registration.event.title}` });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to unregister' } });
  }
});

// Get user's registrations
registrationsRouter.get('/my', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const registrations = await prisma.eventRegistration.findMany({
      where: { userId: authUser.id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
            location: true,
            venue: true,
            status: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    res.json({ success: true, data: registrations });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

// Check registration status
registrationsRouter.get('/events/:eventId/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { eventId } = req.params;

    const registration = await prisma.eventRegistration.findUnique({
      where: { userId_eventId: { userId: authUser.id, eventId } },
    });

    res.json({
      success: true,
      data: { isRegistered: !!registration, registeredAt: registration?.timestamp || null },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to check status' } });
  }
});
