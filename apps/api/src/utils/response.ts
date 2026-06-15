// API Response helpers for consistent response formatting
import { Response } from 'express';

// Evaluated at call time (not module load) so behavior tracks the current
// NODE_ENV — required for deterministic unit tests that exercise the
// production-only sanitization path in a shared test process.
const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * CDN/browser cache header for anonymous, identical-for-everyone GET responses.
 * Mirrors the header already used by GET /api/stats/home. Apply ONLY after
 * confirming the request is unauthenticated (`!getAuthUser(req)`) — many list
 * endpoints embed per-user fields (isRegistered, myVote) that must never be
 * cached at a shared edge. With Cloudflare in front of api.codescriet.dev the
 * `public` + s-maxage semantics also shed repeat hits before they reach Render.
 *
 * Vary: Authorization, Cookie is mandatory, not optional: on mixed-audience
 * endpoints (optionalAuth, e.g. GET /api/events) only the anonymous variant is
 * cacheable, and RFC 9111 §3.5 allows caches to reuse a `public` response even
 * for requests carrying an Authorization header. Without Vary, a user who
 * fetched anonymously and then logged in would be served the cached anonymous
 * payload (isRegistered always false) for up to max-age. Anonymous visitors
 * (no auth header, no cookies) keep full cache hits.
 */
export function setPublicCache(res: Response, maxAgeSeconds = 60, staleWhileRevalidateSeconds = maxAgeSeconds * 2) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`,
  );
  // res.vary() appends — it won't clobber the Vary: Origin set by cors().
  res.vary('Authorization');
  res.vary('Cookie');
}

// Filter potentially sensitive information from error details in production
function sanitizeErrorDetails(details: unknown, seen?: WeakSet<object>): unknown {
  if (!isProduction() || details === undefined) {
    return details;
  }

  // Filter out stack traces from error details
  if (typeof details === 'string') {
    // Check for stack trace patterns
    if (details.includes('    at ') || details.includes('Error:')) {
      return '[Error details hidden in production]';
    }
    return details;
  }

  if (typeof details === 'object' && details !== null) {
    // Guard against circular references
    const visited = seen || new WeakSet();
    if (visited.has(details as object)) {
      return '[Circular]';
    }
    visited.add(details as object);

    // Preserve arrays as arrays. The generic object path below rebuilds objects
    // via Object.entries, which would turn [{...}] into a {"0":{...}} map and
    // break any consumer that relies on Array.isArray — e.g. the field-error
    // lists in error.details emitted by ApiResponse.validationError(). Recurse
    // with the same visited set so nested entries are still sanitized.
    if (Array.isArray(details)) {
      return details.map((item) => sanitizeErrorDetails(item, visited));
    }

    // If it's an Error-like object, strip the stack
    if ('stack' in details) {
      const { stack: _stack, ...rest } = details as { stack?: string };
      return sanitizeErrorDetails(rest, visited);
    }
    // Recursively sanitize object properties
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      // Skip stack-like keys
      if (key === 'stack' || key === 'stackTrace') continue;
      sanitized[key] = sanitizeErrorDetails(value, visited);
    }
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  return details;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore?: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  status?: number;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Error codes
export const ErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',
  BAD_REQUEST: 'BAD_REQUEST',
  
  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  
  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  
  // Business logic errors
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  EVENT_FULL: 'EVENT_FULL',
  ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  REGISTRATION_NOT_STARTED: 'REGISTRATION_NOT_STARTED',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// Static response helper
export const ApiResponse = {
  // Success response
  success<T>(res: Response, data: T, message?: string) {
    const response: SuccessResponse<T> = {
      success: true,
      data,
      ...(message && { message }),
    };
    return res.status(200).json(response);
  },

  // Created response (201)
  created<T>(res: Response, data: T, message?: string) {
    const response: SuccessResponse<T> = {
      success: true,
      data,
      ...(message && { message }),
    };
    return res.status(201).json(response);
  },

  // Paginated response
  paginated<T>(res: Response, data: T[], meta: PaginationMeta) {
    const response: SuccessResponse<T[]> = {
      success: true,
      data,
      meta: {
        ...meta,
        hasMore: meta.page < meta.totalPages,
      },
    };
    return res.status(200).json(response);
  },

  // No content response
  noContent(res: Response) {
    return res.status(204).send();
  },

  // Error response
  error(res: Response, error: ApiError) {
    // Sanitize error details in production to prevent stack trace leakage
    const sanitizedDetails = sanitizeErrorDetails(error.details);
    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(sanitizedDetails ? { details: sanitizedDetails } : {}),
      },
    };
    return res.status(error.status || 400).json(response);
  },

  // Convenience methods
  unauthorized(res: Response, message = 'Authentication required') {
    return ApiResponse.error(res, {
      code: ErrorCodes.UNAUTHORIZED,
      message,
      status: 401,
    });
  },

  forbidden(res: Response, message = 'Access denied') {
    return ApiResponse.error(res, {
      code: ErrorCodes.FORBIDDEN,
      message,
      status: 403,
    });
  },

  notFound(res: Response, message = 'Resource not found') {
    return ApiResponse.error(res, {
      code: ErrorCodes.NOT_FOUND,
      message,
      status: 404,
    });
  },

  badRequest(res: Response, message: string, details?: unknown) {
    return ApiResponse.error(res, {
      code: ErrorCodes.BAD_REQUEST,
      message,
      details,
      status: 400,
    });
  },

  validationError(res: Response, errors: Array<{ field: string; message: string }>) {
    return ApiResponse.error(res, {
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'Validation failed',
      details: errors,
      status: 400,
    });
  },

  conflict(res: Response, message: string) {
    return ApiResponse.error(res, {
      code: ErrorCodes.ALREADY_EXISTS,
      message,
      status: 409,
    });
  },

  internal(res: Response, message = 'Internal server error') {
    return ApiResponse.error(res, {
      code: ErrorCodes.INTERNAL_ERROR,
      message,
      status: 500,
    });
  },

  rateLimited(res: Response, message = 'Too many requests') {
    return ApiResponse.error(res, {
      code: ErrorCodes.RATE_LIMITED,
      message,
      status: 429,
    });
  },
};

// Legacy helper function (for backward compatibility)
export const apiResponse = (res: Response) => ({
  success: <T>(data: T, message?: string) => ApiResponse.success(res, data, message),
  created: <T>(data: T, message?: string) => ApiResponse.created(res, data, message),
  error: (error: ApiError) => ApiResponse.error(res, error),
  notFound: (message?: string) => ApiResponse.notFound(res, message),
  unauthorized: (message?: string) => ApiResponse.unauthorized(res, message),
  forbidden: (message?: string) => ApiResponse.forbidden(res, message),
});
