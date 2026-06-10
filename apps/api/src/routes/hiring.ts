import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser, optionalAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { ApiResponse } from '../utils/response.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { parsePaginationNumber } from '../utils/pagination.js';
import { requireUuid } from '../utils/idParams.js';

export const hiringRouter = Router();

const applyingRoles = ['TECHNICAL', 'DSA_CHAMPS', 'DESIGNING', 'SOCIAL_MEDIA', 'MANAGEMENT'] as const;
const applicationStatuses = ['PENDING', 'INTERVIEW_SCHEDULED', 'SELECTED', 'REJECTED'] as const;

const hiringApplicationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address').transform((value) => value.trim().toLowerCase()),
  phone: z.string().optional(),
  department: z.string().min(2, 'Department is required'),
  year: z.string().min(1, 'Year is required'),
  skills: z.string().optional(),
  applyingRole: z.enum(applyingRoles, {
    errorMap: () => ({ message: 'Please select a valid role' }),
  }),
});

const updateStatusSchema = z.object({
  status: z.enum(applicationStatuses),
});

const sendHiringStatusEmailAsync = (
  status: 'SELECTED' | 'REJECTED',
  payload: { email: string; name: string; applyingRole: (typeof applyingRoles)[number] }
) => {
  const promise = status === 'SELECTED'
    ? emailService.sendHiringSelected(payload.email, payload.name, payload.applyingRole)
    : emailService.sendHiringRejected(payload.email, payload.name, payload.applyingRole);

  promise
    .then(() => {
      logger.info('Hiring status email sent', { email: payload.email, status });
    })
    .catch((error) => {
      logger.error('Failed to send hiring status email', {
        email: payload.email,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    });
};

// Submit a new hiring application (public or authenticated)
hiringRouter.post('/apply', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const validation = hiringApplicationSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.badRequest(res, validation.error.errors[0].message);
    }

    const { name, email, phone, department, year, skills, applyingRole } = validation.data;

    // Check if application already exists
    const existingApplication = await prisma.hiringApplication.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
      },
    });

    if (existingApplication) {
      return ApiResponse.conflict(res, 'An application with this email already exists');
    }

    // Get user ID if authenticated
    let userId: string | null = null;
    try {
      const authUser = getAuthUser(req);
      userId = authUser?.id || null;
    } catch {
      // Not authenticated, that's fine
    }

    // Create the application
    const application = await prisma.hiringApplication.create({
      data: {
        name,
        email,
        phone,
        department,
        year,
        skills,
        applyingRole,
        userId,
      },
    });

    // Send confirmation email asynchronously so application creation never fails due to email provider issues.
    emailService.sendHiringApplication(email, name, applyingRole).catch((error) => {
      logger.error('Failed to send hiring application email', {
        email,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Log the application
    if (userId) {
      await auditLog(userId, 'HIRING_APPLICATION_SUBMITTED', 'HiringApplication', application.id, {
        email,
        applyingRole,
      });
    }

    return ApiResponse.created(res, {
      message: 'Application submitted successfully! You will receive login credentials at your email.',
      application: {
        id: application.id,
        email: application.email,
        applyingRole: application.applyingRole,
        status: application.status,
      },
    });
  } catch (error) {
    logger.error('Hiring application error:', { error: error instanceof Error ? error.message : String(error) });

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponse.conflict(res, 'An application with this email already exists');
    }

    // Helpful error when backend enum is outdated (migration not applied)
    if (
      error instanceof Error &&
      (error.message.includes('ApplyingRole') || error.message.includes('invalid input value for enum'))
    ) {
      return ApiResponse.badRequest(
        res,
        'Hiring roles are out of date on server. Please run the latest database migrations and try again.'
      );
    }

    return ApiResponse.internal(res, 'Failed to submit application');
  }
});

// Get all applications (Admin only)
hiringRouter.get('/applications', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const page = parsePaginationNumber(req.query.page, 1, { min: 1, max: 1000000 });
    const limit = parsePaginationNumber(req.query.limit, 20, { min: 1, max: 100 });
    const status = req.query.status as string;
    const role = req.query.role as string;
    const search = req.query.search as string;

    if (page === null) {
      return ApiResponse.badRequest(res, 'page must be a positive integer');
    }

    if (limit === null) {
      return ApiResponse.badRequest(res, 'limit must be an integer between 1 and 100');
    }

    const where: any = {};

    if (status && !applicationStatuses.includes(status as (typeof applicationStatuses)[number])) {
      return ApiResponse.badRequest(res, 'Invalid status filter');
    }

    if (role && !applyingRoles.includes(role as (typeof applyingRoles)[number])) {
      return ApiResponse.badRequest(res, 'Invalid role filter');
    }
    
    if (status && applicationStatuses.includes(status as any)) {
      where.status = status;
    }
    
    if (role && applyingRoles.includes(role as any)) {
      where.applyingRole = role;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [applications, total] = await Promise.all([
      prisma.hiringApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
      }),
      prisma.hiringApplication.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return ApiResponse.paginated(res, applications, {
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error) {
    logger.error('Get applications error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch applications');
  }
});

// Get application by ID (Admin only)
hiringRouter.get('/applications/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'application ID')) {
      return;
    }

    const application = await prisma.hiringApplication.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
      },
    });

    if (!application) {
      return ApiResponse.notFound(res, 'Application not found');
    }

    return ApiResponse.success(res, application);
  } catch (error) {
    logger.error('Get application error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch application');
  }
});

// Update application status (Admin only)
hiringRouter.patch('/applications/:id/status', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'application ID')) {
      return;
    }
    const authUser = getAuthUser(req);

    const validation = updateStatusSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.badRequest(res, validation.error.errors[0].message);
    }

    const { status } = validation.data;

    // Get application before update to check previous status
    const existingApplication = await prisma.hiringApplication.findUnique({
      where: { id },
    });

    if (!existingApplication) {
      return ApiResponse.notFound(res, 'Application not found');
    }

    const application = await prisma.hiringApplication.update({
      where: { id },
      data: { status },
    });

    // Send notification email in background if status changed to SELECTED or REJECTED.
    if (existingApplication.status !== status) {
      if (status === 'SELECTED') {
        sendHiringStatusEmailAsync('SELECTED', {
          email: application.email,
          name: application.name,
          applyingRole: application.applyingRole,
        });
      } else if (status === 'REJECTED') {
        sendHiringStatusEmailAsync('REJECTED', {
          email: application.email,
          name: application.name,
          applyingRole: application.applyingRole,
        });
      }
    }

    if (authUser) {
      await auditLog(authUser.id, 'HIRING_STATUS_UPDATED', 'HiringApplication', id, {
        previousStatus: existingApplication.status,
        newStatus: status,
        emailSent: status === 'SELECTED' || status === 'REJECTED',
      });
    }

    return ApiResponse.success(res, {
      message: 'Application status updated',
      application,
    });
  } catch (error) {
    logger.error('Update application status error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to update application status');
  }
});

// Delete application (Admin only)
hiringRouter.delete('/applications/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'application ID')) {
      return;
    }
    const authUser = getAuthUser(req);

    await prisma.hiringApplication.delete({
      where: { id },
    });

    if (authUser) {
      await auditLog(authUser.id, 'HIRING_APPLICATION_DELETED', 'HiringApplication', id);
    }

    return ApiResponse.success(res, { message: 'Application deleted successfully' });
  } catch (error) {
    logger.error('Delete application error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to delete application');
  }
});

// Get current user's application status
hiringRouter.get('/my-application', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    
    if (!authUser) {
      return ApiResponse.unauthorized(res);
    }

    const application = await prisma.hiringApplication.findFirst({
      where: {
        OR: [
          { userId: authUser.id },
          { email: { equals: authUser.email, mode: 'insensitive' } },
        ],
      },
    });

    if (!application) {
      return ApiResponse.success(res, { hasApplication: false, hasApplied: false });
    }

    return ApiResponse.success(res, {
      hasApplication: true,
      hasApplied: true,
      application: {
        id: application.id,
        applyingRole: application.applyingRole,
        status: application.status,
        createdAt: application.createdAt,
      },
    });
  } catch (error) {
    logger.error('Get my application error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch application');
  }
});

// Get hiring statistics (Admin only)
hiringRouter.get('/stats', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const [total, byStatus, byRole] = await Promise.all([
      prisma.hiringApplication.count(),
      prisma.hiringApplication.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.hiringApplication.groupBy({
        by: ['applyingRole'],
        _count: true,
      }),
    ]);

    return ApiResponse.success(res, {
      total,
      byStatus: byStatus.reduce((acc: Record<string, number>, item: any) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byRole: byRole.reduce((acc: Record<string, number>, item: any) => {
        acc[item.applyingRole] = item._count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    logger.error('Get hiring stats error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch hiring statistics');
  }
});

// Export applications to Excel (Admin only)
hiringRouter.get('/export', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { status, role } = req.query;

    if (typeof status === 'string' && !applicationStatuses.includes(status as (typeof applicationStatuses)[number])) {
      return ApiResponse.badRequest(res, 'Invalid status filter');
    }

    if (typeof role === 'string' && !applyingRoles.includes(role as (typeof applyingRoles)[number])) {
      return ApiResponse.badRequest(res, 'Invalid role filter');
    }

    // Build filter conditions
    const where: any = {};
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (role && typeof role === 'string') {
      where.applyingRole = role;
    }

    // Fetch applications
    const applications = await prisma.hiringApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // Build workbook with exceljs (safer than xlsx package)
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Applications');
    worksheet.columns = [
      { header: 'Application ID', key: 'applicationId', width: 40 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Year', key: 'year', width: 12 },
      { header: 'Skills', key: 'skills', width: 42 },
      { header: 'Applying Role', key: 'applyingRole', width: 18 },
      { header: 'Status', key: 'status', width: 22 },
      { header: 'Applied On', key: 'appliedOn', width: 28 },
      { header: 'User Account', key: 'userAccount', width: 14 },
    ];

    applications.forEach((app) => {
      worksheet.addRow({
        applicationId: app.id,
        name: app.name,
        email: app.email,
        phone: app.phone || 'Not provided',
        department: app.department,
        year: app.year,
        skills: app.skills || 'Not provided',
        applyingRole: app.applyingRole,
        status: app.status,
        appliedOn: new Date(app.createdAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        userAccount: app.user ? 'Yes' : 'No',
      });
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD97706' },
    };

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

    const summary = workbook.addWorksheet('Summary');
    summary.addRow(['Generated At', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]);
    summary.addRow(['Total Applications', applications.length]);
    summary.addRow(['Status Filter', typeof status === 'string' ? status : 'All']);
    summary.addRow(['Role Filter', typeof role === 'string' ? role : 'All']);
    summary.getColumn(1).width = 20;
    summary.getColumn(2).width = 30;
    summary.getColumn(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    // Generate filename with filters
    let filename = 'hiring_applications';
    if (role && typeof role === 'string') filename += `_${role.toLowerCase()}`;
    if (status && typeof status === 'string') filename += `_${status.toLowerCase()}`;
    filename += `_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Set headers and send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));

    // Log audit
    const user = getAuthUser(req);
    if (user) {
      await auditLog(user.id, 'EXPORT', 'hiring_applications', 'bulk', {
        filters: { status, role },
        count: applications.length,
      });
    }

    return;
  } catch (error) {
    logger.error('Export applications error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to export applications');
  }
});
