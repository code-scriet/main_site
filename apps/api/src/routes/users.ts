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

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch profile' } });
  }
});

// Update current user profile
usersRouter.put('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { name, bio, avatarUrl, githubUrl, linkedinUrl, twitterUrl, websiteUrl } = req.body;

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
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
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
      return res.status(400).json({ success: false, error: { message: 'Cannot change password for OAuth-only accounts' } });
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
      select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
    });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch users' } });
  }
});

// Get user by ID (admin)
usersRouter.get('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        githubUrl: true,
        linkedinUrl: true,
        createdAt: true,
        _count: { select: { registrations: true, qotdSubmissions: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch user' } });
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

    await prisma.user.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'user', req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete user' } });
  }
});
