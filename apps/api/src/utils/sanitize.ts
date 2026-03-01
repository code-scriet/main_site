import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Uses DOMPurify with a strict configuration for user-generated content.
 */

// Allowed HTML tags for rich content
const ALLOWED_TAGS = [
  // Text formatting
  'p', 'br', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark',
  'sup', 'sub', 'small',
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Lists
  'ul', 'ol', 'li',
  // Links and media
  'a', 'img',
  // Blockquote and code
  'blockquote', 'pre', 'code',
  // Tables
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  // Horizontal rule
  'hr',
];

// Allowed attributes for tags
const ALLOWED_ATTR = [
  // Global attributes
  'class', 'id', 'style',
  // Links
  'href', 'target', 'rel', 'title',
  // Images
  'src', 'alt', 'width', 'height', 'loading',
  // Tables
  'colspan', 'rowspan',
];

// Allowed URL schemes
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param content - Raw HTML/Markdown content to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(content: string | null | undefined): string {
  if (!content) {
    return '';
  }

  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    // Remove any script-related elements
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'svg', 'math'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    // Additional security measures
    ADD_ATTR: ['target'], // Allow target attribute
    ADD_TAGS: [], // Don't add extra tags
    KEEP_CONTENT: true, // Keep text content even if tags are stripped
    IN_PLACE: false, // Return new string instead of modifying original
  });
}

/**
 * Sanitizes content specifically for Markdown rendering
 * Allows a subset of HTML that's commonly embedded in Markdown
 * @param content - Raw Markdown content that may contain HTML
 * @returns Sanitized content
 */
export function sanitizeMarkdown(content: string | null | undefined): string {
  if (!content) {
    return '';
  }

  // For Markdown, we're more permissive but still remove dangerous elements
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      ...ALLOWED_TAGS,
      // Additional tags sometimes used in Markdown
      'details', 'summary',
    ],
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitizes a plain text field (no HTML allowed)
 * Strips all HTML tags but keeps text content
 * @param content - Raw text content
 * @returns Plain text without HTML
 */
export function sanitizeText(content: string | null | undefined): string {
  if (!content) {
    return '';
  }

  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitizes a URL to ensure it's safe
 * @param url - Raw URL string
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }

  const trimmed = url.trim();
  
  // Check for allowed protocols
  const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
  
  try {
    const parsed = new URL(trimmed, 'https://example.com');
    if (!allowedProtocols.includes(parsed.protocol)) {
      return '';
    }
    return trimmed;
  } catch {
    // If URL parsing fails, check if it's a relative URL
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
      return trimmed;
    }
    return '';
  }
}

/**
 * Sanitizes an object's string fields recursively
 * Useful for sanitizing entire request bodies
 * @param obj - Object to sanitize
 * @param richFields - Field names that should allow HTML (use sanitizeHtml)
 * @returns New object with sanitized strings
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  richFields: string[] = []
): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      if (richFields.includes(key)) {
        result[key] = sanitizeHtml(value);
      } else {
        result[key] = sanitizeText(value);
      }
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>, richFields);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
