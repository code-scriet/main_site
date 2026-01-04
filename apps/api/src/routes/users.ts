import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import bcrypt from 'bcryptjs';

export const usersRouter = Router();

// Get current user profile
usersRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        password: true,
        oauthProvider: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
        createdAt: true,
        _count: { select: { registrations: true, qotdSubmissions: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    // Return user data without password, but with hasPassword flag
    const { password, ...userData } = user;
    res.json({ 
      success: true, 
      data: {
        ...userData,
        hasPassword: !!password,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch profile' } });
  }
});

// Update current user profile
usersRouter.put('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { name, bio, avatarUrl, githubUrl, linkedinUrl, twitterUrl, websiteUrl, phone, course, branch, year } = req.body;

    // Check if this is a profile completion (all required fields provided)
    const isProfileCompletion = phone && course && branch && year;

    const user = await prisma.user.update({
      where: { id: authUser.id },
      data: {
        ...(name && { name }),
        ...(bio !== undefined && { bio }),
        ...(avatarUrl !== undefined && { avatar: avatarUrl }),
        ...(githubUrl !== undefined && { githubUrl }),
        ...(linkedinUrl !== undefined && { linkedinUrl }),
        ...(twitterUrl !== undefined && { twitterUrl }),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(phone !== undefined && { phone }),
        ...(course !== undefined && { course }),
        ...(branch !== undefined && { branch }),
        ...(year !== undefined && { year }),
        ...(isProfileCompletion && { profileCompleted: true }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'user', authUser.id, { fields: Object.keys(req.body) });
    res.json({ success: true, data: user, message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update profile' } });
  }
});

// Add password for OAuth-only accounts
usersRouter.post('/me/add-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ success: false, error: { message: 'New password is required' } });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: { message: 'Password must be at least 8 characters' } });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, password: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (user.password) {
      return res.status(400).json({ success: false, error: { message: 'You already have a password set. Use "Change Password" instead.' } });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: authUser.id },
      data: { password: hashedPassword },
    });

    await auditLog(authUser.id, 'CREATE', 'user', authUser.id, { action: 'password_added' });
    res.json({ success: true, message: 'Password added successfully! You can now sign in with email and password.' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to add password' } });
  }
});

// Change password
usersRouter.post('/me/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: { message: 'Current password and new password are required' } });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: { message: 'New password must be at least 8 characters' } });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, password: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (!user.password) {
      return res.status(400).json({ success: false, error: { message: 'You have not set a password yet. Please use "Add Password" instead.' } });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, error: { message: 'Current password is incorrect' } });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: authUser.id },
      data: { password: hashedPassword },
    });

    await auditLog(authUser.id, 'UPDATE', 'user', authUser.id, { action: 'password_change' });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to change password' } });
  }
});

// Get user's event registrations
usersRouter.get('/me/registrations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const registrations = await prisma.eventRegistration.findMany({
      where: { userId: authUser.id },
      include: { event: { select: { id: true, title: true, startDate: true, location: true, imageUrl: true } } },
      orderBy: { timestamp: 'desc' },
    });

    res.json({ success: true, data: registrations });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

// Get user's QOTD stats
usersRouter.get('/me/qotd-stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const submissions = await prisma.qOTDSubmission.findMany({
      where: { userId: authUser.id },
      include: { qotd: true },
      orderBy: { timestamp: 'desc' },
    });

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < submissions.length; i++) {
      const submissionDate = new Date(submissions[i].qotd.date);
      submissionDate.setHours(0, 0, 0, 0);
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);

      if (submissionDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    res.json({
      success: true,
      data: {
        totalSubmissions: submissions.length,
        currentStreak: streak,
        recentSubmissions: submissions.slice(0, 10).map((s) => ({
          date: s.qotd.date,
          difficulty: s.qotd.difficulty,
          timestamp: s.timestamp,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch QOTD stats' } });
  }
});

// Search users (admin)
usersRouter.get('/search', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query || query.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      select: { id: true, name: true, email: true, avatar: true, role: true },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to search users' } });
  }
});

// Get all users (admin)
usersRouter.get('/', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true, 
        avatar: true, 
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        createdAt: true 
      },
    });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch users' } });
  }
});

// Get user by ID (admin)
usersRouter.get('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        oauthProvider: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
        createdAt: true,
        _count: { select: { registrations: true, qotdSubmissions: true } },
        registrations: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                startDate: true,
                status: true,
                imageUrl: true,
              },
            },
          },
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    // Check permissions: Super admin can see everyone, other admins cannot see other admins
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = authUser.email === superAdminEmail;
    
    if (targetUser.role === 'ADMIN' && !isSuperAdmin) {
      return res.status(403).json({ success: false, error: { message: 'You cannot view other admin profiles' } });
    }

    res.json({ success: true, data: targetUser });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch user' } });
  }
});

// Update user profile (admin)
usersRouter.put('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { name, bio, phone, course, branch, year, avatarUrl, githubUrl, linkedinUrl, twitterUrl, websiteUrl, password } = req.body;

    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    // Check permissions: Super admin can edit everyone, other admins cannot edit other admins
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = authUser.email === superAdminEmail;
    
    if (targetUser.role === 'ADMIN' && !isSuperAdmin) {
      return res.status(403).json({ success: false, error: { message: 'You cannot edit other admin profiles' } });
    }

    // Prevent editing super admin unless you are super admin
    if (targetUser.email === superAdminEmail && !isSuperAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Cannot modify super admin' } });
    }

    const isProfileCompletion = phone && course && branch && year;

    let hashedPassword: string | undefined;
    if (password) {
        if (password.length < 8) {
             return res.status(400).json({ success: false, error: { message: 'Password must be at least 8 characters' } });
        }
        hashedPassword = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(bio !== undefined && { bio }),
        ...(avatarUrl !== undefined && { avatar: avatarUrl }),
        ...(githubUrl !== undefined && { githubUrl }),
        ...(linkedinUrl !== undefined && { linkedinUrl }),
        ...(twitterUrl !== undefined && { twitterUrl }),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(phone !== undefined && { phone }),
        ...(course !== undefined && { course }),
        ...(branch !== undefined && { branch }),
        ...(year !== undefined && { year }),
        ...(isProfileCompletion && { profileCompleted: true }),
        ...(hashedPassword && { password: hashedPassword }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'user', user.id, { updatedBy: 'admin' });
    res.json({ success: true, data: user, message: 'User profile updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update user profile' } });
  }
});

// Update user role (admin)
usersRouter.put('/:id/role', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { role } = req.body;

    if (!['USER', 'CORE_MEMBER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid role' } });
    }

    // Get target user to check their current role
    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true }
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    // Super admin protection: only super admin can modify admin roles
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = authUser.email === superAdminEmail;

    // Check if this action involves admin role changes
    const involvesAdminRole = role === 'ADMIN' || targetUser.role === 'ADMIN';

    if (involvesAdminRole && !isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: { message: 'Only super admin can promote to or demote from admin role' } 
      });
    }

    // Prevent changing super admin's role
    if (targetUser.email === superAdminEmail && !isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: { message: 'Cannot modify super admin role' } 
      });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    await auditLog(authUser.id, 'UPDATE_ROLE', 'user', user.id, { newRole: role });
    res.json({ success: true, data: user, message: 'User role updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update user role' } });
  }
});

// Delete user (admin)
usersRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    
    if (req.params.id === authUser.id) {
      return res.status(400).json({ success: false, error: { message: 'Cannot delete your own account' } });
    }

    // Get target user to check their role
    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true }
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    // Super admin protection
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = authUser.email === superAdminEmail;

    // Prevent deleting super admin
    if (targetUser.email === superAdminEmail) {
      return res.status(403).json({ 
        success: false, 
        error: { message: 'Cannot delete super admin account' } 
      });
    }

    // Only super admin can delete other admins
    if (targetUser.role === 'ADMIN' && !isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: { message: 'Only super admin can delete admin accounts' } 
      });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'user', req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete user' } });
  }
});
