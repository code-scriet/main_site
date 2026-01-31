import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser, optionalAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { ApiResponse } from '../utils/response.js';
import { emailService } from '../utils/email.js';

export const hiringRouter = Router();

const applyingRoles = ['TECHNICAL', 'DESIGNING', 'VIDEO_EDITING', 'MANAGEMENT'] as const;
const applicationStatuses = ['PENDING', 'INTERVIEW_SCHEDULED', 'SELECTED', 'REJECTED'] as const;

const hiringApplicationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
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

// Submit a new hiring application (public or authenticated)
hiringRouter.post('/apply', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const validation = hiringApplicationSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.badRequest(res, validation.error.errors[0].message);
    }

    const { name, email, phone, department, year, skills, applyingRole } = validation.data;

    // Check if application already exists
    const existingApplication = await prisma.hiringApplication.findUnique({
      where: { email },
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

    // Send confirmation email
    await emailService.sendHiringApplication(email, name, applyingRole);

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
    console.error('Hiring application error:', error);
    return ApiResponse.internal(res, 'Failed to submit application');
  }
});

// Get all applications (Admin only)
hiringRouter.get('/applications', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const role = req.query.role as string;
    const search = req.query.search as string;

    const where: any = {};
    
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
    console.error('Get applications error:', error);
    return ApiResponse.internal(res, 'Failed to fetch applications');
  }
});

// Get application by ID (Admin only)
hiringRouter.get('/applications/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
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
    console.error('Get application error:', error);
    return ApiResponse.internal(res, 'Failed to fetch application');
  }
});

// Update application status (Admin only)
hiringRouter.patch('/applications/:id/status', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authUser = getAuthUser(req);
    
    const validation = updateStatusSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.badRequest(res, validation.error.errors[0].message);
    }

    const { status } = validation.data;

    const application = await prisma.hiringApplication.update({
      where: { id },
      data: { status },
    });

    if (authUser) {
      await auditLog(authUser.id, 'HIRING_STATUS_UPDATED', 'HiringApplication', id, {
        newStatus: status,
      });
    }

    return ApiResponse.success(res, {
      message: 'Application status updated',
      application,
    });
  } catch (error) {
    console.error('Update application status error:', error);
    return ApiResponse.internal(res, 'Failed to update application status');
  }
});

// Delete application (Admin only)
hiringRouter.delete('/applications/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authUser = getAuthUser(req);

    await prisma.hiringApplication.delete({
      where: { id },
    });

    if (authUser) {
      await auditLog(authUser.id, 'HIRING_APPLICATION_DELETED', 'HiringApplication', id);
    }

    return ApiResponse.success(res, { message: 'Application deleted successfully' });
  } catch (error) {
    console.error('Delete application error:', error);
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
          { email: authUser.email },
        ],
      },
    });

    if (!application) {
      return ApiResponse.success(res, { hasApplication: false });
    }

    return ApiResponse.success(res, {
      hasApplication: true,
      application: {
        id: application.id,
        applyingRole: application.applyingRole,
        status: application.status,
        createdAt: application.createdAt,
      },
    });
  } catch (error) {
    console.error('Get my application error:', error);
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
    console.error('Get hiring stats error:', error);
    return ApiResponse.internal(res, 'Failed to fetch hiring statistics');
  }
});

// Export applications to Excel (Admin only)
hiringRouter.get('/export', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { status, role } = req.query;

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

    // Format data for Excel
    const excelData = applications.map((app: any) => ({
      'Application ID': app.id,
      'Name': app.name,
      'Email': app.email,
      'Phone': app.phone || 'Not provided',
      'Department': app.department,
      'Year': app.year,
      'Skills': app.skills || 'Not provided',
      'Applying Role': app.applyingRole,
      'Status': app.status,
      'Applied On': new Date(app.createdAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      'User Account': app.user ? 'Yes' : 'No',
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Applications');

    // Auto-size columns
    const maxWidth = 50;
    const columnWidths = Object.keys(excelData[0] || {}).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...excelData.map((row: any) => String(row[key as keyof typeof row]).length)
      );
      return { wch: Math.min(maxLength + 2, maxWidth) };
    });
    worksheet['!cols'] = columnWidths;

    // Generate Excel file buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Generate filename with filters
    let filename = 'hiring_applications';
    if (role && typeof role === 'string') filename += `_${role.toLowerCase()}`;
    if (status && typeof status === 'string') filename += `_${status.toLowerCase()}`;
    filename += `_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Set headers and send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

    // Log audit
    const user = getAuthUser(req);
    if (user) {
      await auditLog(user.id, 'EXPORT', 'hiring_applications', 'bulk', {
        filters: { status, role },
        count: applications.length,
      });
    }
  } catch (error) {
    console.error('Export applications error:', error);
    return ApiResponse.internal(res, 'Failed to export applications');
  }
});
