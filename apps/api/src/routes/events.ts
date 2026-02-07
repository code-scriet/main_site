import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { EventStatus, Prisma } from '@prisma/client';
import { updateEventStatuses } from '../utils/eventStatus.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { sanitizeEventRegistrationFields } from '../utils/eventRegistrationFields.js';

export const eventsRouter = Router();

// Get all events with filtering
eventsRouter.get('/', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // Update statuses before fetching
    await updateEventStatuses();

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
    await updateEventStatuses();
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
    // Ideally we update status for just this event, but the bulk utility is fast enough
    await updateEventStatuses();
    
    // Support both ID and slug lookup
    const idOrSlug = req.params.id;
    const event = await prisma.event.findFirst({
      where: {
        OR: [
          { id: idOrSlug },
          { slug: idOrSlug }
        ]
      },
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
    let registrationFields;

    try {
      registrationFields = sanitizeEventRegistrationFields(data.registrationFields);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: { message: validationError instanceof Error ? validationError.message : 'Invalid registration fields' },
      });
    }

    // Generate slug from title
    const baseSlug = generateSlug(data.title);
    const existingSlugs = (await prisma.event.findMany({ select: { slug: true } })).map(e => e.slug);
    const slug = generateUniqueSlug(baseSlug, existingSlugs);

    const event = await prisma.event.create({
      data: {
        title: data.title,
        slug,
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
        // Extended event fields
        shortDescription: data.shortDescription || null,
        agenda: data.agenda || null,
        highlights: data.highlights || null,
        learningOutcomes: data.learningOutcomes || null,
        targetAudience: data.targetAudience || null,
        speakers: data.speakers || null,
        resources: data.resources || null,
        faqs: data.faqs || null,
        imageGallery: data.imageGallery || null,
        videoUrl: data.videoUrl || null,
        tags: data.tags || [],
        featured: data.featured || false,
        allowLateRegistration: data.allowLateRegistration || false,
        registrationFields: registrationFields.length > 0
          ? (registrationFields as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    await auditLog(authUser.id, 'CREATE', 'event', event.id, { title: event.title });

    // Send email notification to all users about new event (async, don't wait)
    sendNewEventEmailsAsync(event);

    res.status(201).json({ success: true, data: event, message: 'Event created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create event' } });
  }
});

eventsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const data = req.body;
    let registrationFieldsUpdate = {};

    // If title changed, regenerate slug
    let slugUpdate = {};
    if (data.title) {
      const baseSlug = generateSlug(data.title);
      const existingSlugs = (await prisma.event.findMany({ 
        where: { id: { not: req.params.id } },
        select: { slug: true } 
      })).map(e => e.slug);
      const newSlug = generateUniqueSlug(baseSlug, existingSlugs);
      slugUpdate = { slug: newSlug };
    }

    if (data.registrationFields !== undefined) {
      try {
        const registrationFields = sanitizeEventRegistrationFields(data.registrationFields);
        registrationFieldsUpdate = {
          registrationFields: registrationFields.length > 0
            ? (registrationFields as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        };
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          error: { message: validationError instanceof Error ? validationError.message : 'Invalid registration fields' },
        });
      }
    }

    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...slugUpdate,
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
        // Extended event fields
        ...(data.shortDescription !== undefined && { shortDescription: data.shortDescription }),
        ...(data.agenda !== undefined && { agenda: data.agenda }),
        ...(data.highlights !== undefined && { highlights: data.highlights }),
        ...(data.learningOutcomes !== undefined && { learningOutcomes: data.learningOutcomes }),
        ...(data.targetAudience !== undefined && { targetAudience: data.targetAudience }),
        ...(data.speakers !== undefined && { speakers: data.speakers }),
        ...(data.resources !== undefined && { resources: data.resources }),
        ...(data.faqs !== undefined && { faqs: data.faqs }),
        ...(data.imageGallery !== undefined && { imageGallery: data.imageGallery }),
        ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.featured !== undefined && { featured: data.featured }),
        ...(data.allowLateRegistration !== undefined && { allowLateRegistration: data.allowLateRegistration }),
        ...registrationFieldsUpdate,
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
      include: { 
        user: { 
          select: { 
            id: true, 
            name: true, 
            email: true, 
            avatar: true,
            phone: true,
            course: true,
            branch: true,
            year: true,
            role: true
          } 
        } 
      },
      orderBy: { timestamp: 'asc' },
    });
    res.json({ success: true, data: registrations });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

// Delete a registration (admin only)
eventsRouter.delete('/:eventId/registrations/:registrationId', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { eventId, registrationId } = req.params;
    
    const registration = await prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
    });
    
    if (!registration) {
      return res.status(404).json({ success: false, error: { message: 'Registration not found' } });
    }
    
    await prisma.eventRegistration.delete({ where: { id: registrationId } });
    res.json({ success: true, message: 'Registration deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

eventsRouter.get('/:id/registrations/export', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { format = 'xlsx' } = req.query;
    
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        registrations: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                course: true,
                branch: true,
                year: true,
                avatar: true,
                role: true,
                oauthProvider: true,
                githubUrl: true,
                linkedinUrl: true,
                twitterUrl: true,
                websiteUrl: true,
                createdAt: true,
              },
            },
          },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ success: false, error: { message: 'Event not found' } });
    }

    const registrationFields = sanitizeEventRegistrationFields(event.registrationFields);

    const getResponseMap = (responses: unknown): Map<string, string> => {
      const map = new Map<string, string>();
      if (!Array.isArray(responses)) {
        return map;
      }
      for (const item of responses) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const parsed = item as { fieldId?: unknown; value?: unknown };
        if (typeof parsed.fieldId !== 'string' || !parsed.fieldId) {
          continue;
        }
        map.set(parsed.fieldId, parsed.value === undefined || parsed.value === null ? '' : String(parsed.value));
      }
      return map;
    };

    const escapeCsv = (value: unknown): string => {
      const stringValue = value === undefined || value === null ? '' : String(value);
      return `"${stringValue.replace(/"/g, '""')}"`;
    };

    // For CSV format (backwards compatible)
    if (format === 'csv') {
      const header = [
        'S.No',
        'Name',
        'Email',
        'Phone',
        'Course',
        'Branch',
        'Year',
        'Role',
        'Registered At',
        'Account Created',
        ...registrationFields.map((field) => field.label),
      ];

      const rows = event.registrations.map((registration, index) => {
        const responseMap = getResponseMap(registration.customFieldResponses);
        return [
          index + 1,
          registration.user.name,
          registration.user.email,
          registration.user.phone || '',
          registration.user.course || '',
          registration.user.branch || '',
          registration.user.year || '',
          registration.user.role,
          registration.timestamp.toISOString(),
          registration.user.createdAt.toISOString(),
          ...registrationFields.map((field) => responseMap.get(field.id) || ''),
        ];
      });

      const csv = [header, ...rows]
        .map((row) => row.map(escapeCsv).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '_')}_registrations.csv"`);
      return res.send(csv);
    }

    // For Excel format
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Registrations');

    // Define columns with dynamic custom field columns
    worksheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Course', key: 'course', width: 12 },
      { header: 'Branch', key: 'branch', width: 15 },
      { header: 'Year', key: 'year', width: 12 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Registered At', key: 'registeredAt', width: 22 },
      { header: 'Account Created', key: 'accountCreated', width: 22 },
      { header: 'GitHub', key: 'github', width: 25 },
      { header: 'LinkedIn', key: 'linkedin', width: 25 },
      ...registrationFields.map((field) => ({
        header: field.label,
        key: `custom_${field.id}`,
        width: Math.max(18, Math.min(45, field.label.length + 10)),
      })),
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD97706' }, // Amber color
    };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 25;

    // Add data rows
    event.registrations.forEach((reg, index) => {
      const responseMap = getResponseMap(reg.customFieldResponses);
      const rowData: Record<string, unknown> = {
        sno: index + 1,
        name: reg.user.name,
        email: reg.user.email,
        phone: reg.user.phone || 'N/A',
        course: reg.user.course || 'N/A',
        branch: reg.user.branch || 'N/A',
        year: reg.user.year || 'N/A',
        role: reg.user.role,
        registeredAt: reg.timestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        accountCreated: reg.user.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        github: reg.user.githubUrl || '',
        linkedin: reg.user.linkedinUrl || '',
      };

      registrationFields.forEach((field) => {
        rowData[`custom_${field.id}`] = responseMap.get(field.id) || '';
      });

      worksheet.addRow(rowData);
    });

    // Add alternating row colors
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowNumber % 2 === 0 ? 'FFFEF3C7' : 'FFFFFFFF' },
        };
      }
      row.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });

    // Add summary info at the top
    const summarySheet = workbook.addWorksheet('Event Info');
    summarySheet.addRow(['Event Title', event.title]);
    summarySheet.addRow(['Start Date', event.startDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]);
    summarySheet.addRow(['End Date', event.endDate?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) || 'N/A']);
    summarySheet.addRow(['Location', event.location || 'N/A']);
    summarySheet.addRow(['Venue', event.venue || 'N/A']);
    summarySheet.addRow(['Total Registrations', event.registrations.length]);
    summarySheet.addRow(['Capacity', event.capacity || 'Unlimited']);
    summarySheet.addRow(['Export Date', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]);

    summarySheet.getColumn(1).width = 20;
    summarySheet.getColumn(1).font = { bold: true };
    summarySheet.getColumn(2).width = 40;

    // Send Excel file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '_')}_registrations.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Export error:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to export registrations' } });
  }
});

// ============================================
// Email notification helpers
// ============================================

// Helper function to send new event emails asynchronously
async function sendNewEventEmailsAsync(event: {
  title: string;
  description: string;
  startDate: Date;
  slug: string;
  shortDescription?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  tags?: string[];
  eventType?: string | null;
}) {
  try {
    // Get all users with email
    const users = await prisma.user.findMany({
      where: { email: { not: '' } },
      select: { email: true },
    });

    const emails = users.map(u => u.email).filter(Boolean) as string[];
    
    if (emails.length === 0) {
      logger.info('No users to notify for new event');
      return;
    }

    logger.info(`📧 Sending new event email to ${emails.length} users...`, { title: event.title });

    await emailService.sendNewEventToAll(
      emails,
      event.title,
      event.description,
      event.startDate,
      event.slug,
      event.shortDescription || undefined,
      event.location || undefined,
      event.imageUrl || undefined,
      event.tags || [],
      event.eventType || undefined
    );

    logger.info(`✅ New event emails sent to ${emails.length} users`);
  } catch (error) {
    logger.error('Failed to send new event emails', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Helper function to send event registration confirmation email
async function sendEventRegistrationEmailAsync(
  userEmail: string,
  userName: string,
  event: {
    title: string;
    startDate: Date;
    slug: string;
    location?: string | null;
    imageUrl?: string | null;
  }
) {
  try {
    logger.info(`📧 Sending event registration email to ${userEmail}...`);

    await emailService.sendEventRegistration(
      userEmail,
      userName,
      event.title,
      event.startDate,
      event.slug,
      event.location || undefined,
      event.imageUrl || undefined
    );

    logger.info(`✅ Event registration email sent to ${userEmail}`);
  } catch (error) {
    logger.error('Failed to send event registration email', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
