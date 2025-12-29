import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { ApiResponse, ErrorCodes } from './response.js';

// Common validation schemas
export const schemas = {
  // ID validations
  id: z.string().uuid('Invalid ID format'),
  mongoId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid MongoDB ID'),
  
  // String validations
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  
  // Name validations  
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long').trim(),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  
  // URL and link validations
  url: z.string().url('Invalid URL format').optional().or(z.literal('')),
  imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
  
  // Content validations
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long').trim(),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000, 'Description too long').trim(),
  shortText: z.string().max(500, 'Text too long').trim(),
  
  // Date validations
  date: z.string().datetime('Invalid date format'),
  futureDate: z.string().datetime().refine(
    (date) => new Date(date) > new Date(),
    'Date must be in the future'
  ),
  pastDate: z.string().datetime().refine(
    (date) => new Date(date) < new Date(),
    'Date must be in the past'
  ),
  
  // Numeric validations
  positiveInt: z.number().int().positive('Must be a positive integer'),
  page: z.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.number().int().min(1).max(100, 'Limit cannot exceed 100').default(10),
  
  // Enum validations
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MEMBER']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  eventType: z.enum(['WORKSHOP', 'SEMINAR', 'HACKATHON', 'MEETUP', 'COMPETITION', 'OTHER']),
  
  // Boolean
  boolean: z.boolean(),
  optionalBoolean: z.boolean().optional(),
};

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Search schema
export const searchSchema = z.object({
  q: z.string().min(1, 'Search query required').max(100).trim(),
  ...paginationSchema.shape,
});

// Event schemas
export const eventSchemas = {
  create: z.object({
    title: schemas.title,
    description: schemas.description,
    date: schemas.futureDate,
    location: z.string().min(3).max(200).trim().optional(),
    venue: z.string().min(3).max(200).trim().optional(),
    eventType: schemas.eventType.optional(),
    maxParticipants: z.number().int().positive().optional(),
    registrationStartDate: z.string().datetime().optional(),
    registrationEndDate: z.string().datetime().optional(),
    prerequisites: z.string().max(1000).optional(),
    imageUrl: schemas.imageUrl,
    isPublic: schemas.optionalBoolean,
  }),
  
  update: z.object({
    title: schemas.title.optional(),
    description: schemas.description.optional(),
    date: z.string().datetime().optional(),
    location: z.string().min(3).max(200).trim().optional(),
    venue: z.string().min(3).max(200).trim().optional(),
    eventType: schemas.eventType.optional(),
    maxParticipants: z.number().int().positive().optional(),
    registrationStartDate: z.string().datetime().optional(),
    registrationEndDate: z.string().datetime().optional(),
    prerequisites: z.string().max(1000).optional(),
    imageUrl: schemas.imageUrl,
    isPublic: schemas.optionalBoolean,
  }),
};

// Announcement schemas
export const announcementSchemas = {
  create: z.object({
    title: schemas.title,
    body: schemas.description,
    priority: schemas.priority.default('NORMAL'),
  }),
  
  update: z.object({
    title: schemas.title.optional(),
    body: schemas.description.optional(),
    priority: schemas.priority.optional(),
  }),
};

// User schemas
export const userSchemas = {
  updateProfile: z.object({
    name: schemas.name.optional(),
    bio: z.string().max(500, 'Bio too long').optional(),
    avatarUrl: schemas.imageUrl,
    githubUrl: z.string().url().optional().or(z.literal('')),
    linkedinUrl: z.string().url().optional().or(z.literal('')),
    twitterUrl: z.string().url().optional().or(z.literal('')),
    websiteUrl: z.string().url().optional().or(z.literal('')),
  }),
  
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password required'),
    newPassword: schemas.password,
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
  
  register: z.object({
    email: schemas.email,
    password: schemas.password,
    name: schemas.name,
  }),
  
  login: z.object({
    email: schemas.email,
    password: z.string().min(1, 'Password required'),
  }),
};

// Achievement schemas
export const achievementSchemas = {
  create: z.object({
    title: schemas.title,
    description: schemas.description,
    date: z.string().datetime(),
    category: z.string().min(2).max(50).optional(),
    imageUrl: schemas.imageUrl,
    participants: z.array(z.string().uuid()).optional(),
  }),
  
  update: z.object({
    title: schemas.title.optional(),
    description: schemas.description.optional(),
    date: z.string().datetime().optional(),
    category: z.string().min(2).max(50).optional(),
    imageUrl: schemas.imageUrl,
    participants: z.array(z.string().uuid()).optional(),
  }),
};

// Team member schemas
export const teamSchemas = {
  create: z.object({
    userId: schemas.id,
    position: z.string().min(2).max(100).trim(),
    department: z.string().min(2).max(100).trim().optional(),
    order: z.number().int().min(0).optional(),
    isActive: schemas.optionalBoolean,
  }),
  
  update: z.object({
    position: z.string().min(2).max(100).trim().optional(),
    department: z.string().min(2).max(100).trim().optional(),
    order: z.number().int().min(0).optional(),
    isActive: schemas.optionalBoolean,
  }),
};

// QOTD schemas
export const qotdSchemas = {
  submit: z.object({
    answer: z.string().min(1, 'Answer required').max(5000, 'Answer too long').trim(),
  }),
  
  create: z.object({
    question: z.string().min(10, 'Question too short').max(1000, 'Question too long').trim(),
    date: z.string().datetime().optional(),
  }),
};

// Settings schema
export const settingsSchema = z.object({
  clubName: z.string().min(2).max(100).optional(),
  clubDescription: z.string().max(1000).optional(),
  clubLogo: schemas.imageUrl,
  contactEmail: schemas.email.optional(),
  socialLinks: z.object({
    github: z.string().url().optional().or(z.literal('')),
    twitter: z.string().url().optional().or(z.literal('')),
    linkedin: z.string().url().optional().or(z.literal('')),
    discord: z.string().url().optional().or(z.literal('')),
    instagram: z.string().url().optional().or(z.literal('')),
  }).optional(),
  showLeaderboard: schemas.optionalBoolean,
  showQOTD: schemas.optionalBoolean,
  showAchievements: schemas.optionalBoolean,
  maintenanceMode: schemas.optionalBoolean,
});

// Validation middleware factory
export function validate<T extends z.ZodSchema>(
  schema: T,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[source]);
      req[source] = data; // Replace with validated data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        
        return ApiResponse.validationError(res, errors);
      }
      
      return ApiResponse.error(res, {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Validation failed',
      });
    }
  };
}

// Helper to validate and parse data (for use outside middleware)
export function parseSchema<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; errors: Array<{ field: string; message: string }> } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
  
  return { success: false, errors };
}
