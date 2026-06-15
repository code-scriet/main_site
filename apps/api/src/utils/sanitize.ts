import sanitizeHtmlLib from 'sanitize-html';

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Uses `sanitize-html` (F1: consolidated onto the one library that already
 * powers the richer mail policy — isomorphic-dompurify dropped). sanitize-html
 * is allowlist-based: anything not explicitly permitted below is stripped, and
 * script/style content is discarded outright (nonTextTags) rather than kept as
 * text — equal-or-stricter than the prior DOMPurify config. on* handlers and
 * javascript:/data: URLs are rejected because they're absent from the
 * attribute/scheme allowlists.
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
  'class',
  // Links
  'href', 'target', 'rel', 'title',
  // Images
  'src', 'alt', 'width', 'height', 'loading',
  // Tables
  'colspan', 'rowspan',
];

// Allowed URL schemes — strict whitelist to prevent javascript:/data: XSS.
// (Relative `/...` and anchor `#...` URLs are permitted by allowRelativeUrls.)
const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

function buildOptions(tags: string[]): sanitizeHtmlLib.IOptions {
  return {
    allowedTags: tags,
    // DOMPurify's ALLOWED_ATTR was a flat list applied to every tag; '*'
    // reproduces that. on* handlers are excluded, so they're stripped.
    allowedAttributes: { '*': ALLOWED_ATTR },
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: {},
    allowProtocolRelative: false, // reject //evil.com
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    // Strip disallowed tags but keep their text (DOMPurify KEEP_CONTENT parity);
    // script/style/etc. remain nonTextTags so their content is discarded.
    disallowedTagsMode: 'discard',
  };
}

const RICH_OPTIONS = buildOptions(ALLOWED_TAGS);
const MARKDOWN_OPTIONS = buildOptions([...ALLOWED_TAGS, 'details', 'summary']);
const TEXT_OPTIONS: sanitizeHtmlLib.IOptions = { allowedTags: [], allowedAttributes: {} };

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param content - Raw HTML/Markdown content to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(content: string | null | undefined): string {
  if (!content) {
    return '';
  }
  return sanitizeHtmlLib(content, RICH_OPTIONS);
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
  return sanitizeHtmlLib(content, MARKDOWN_OPTIONS);
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
  return sanitizeHtmlLib(content, TEXT_OPTIONS);
}

/**
 * Escapes HTML-reserved characters so a value can be safely embedded
 * inside HTML text nodes OR attribute values (double-quoted).
 * Use this for every interpolation into email templates and any other
 * server-generated HTML — the HTML sanitizers strip tags but do not escape entities.
 * @param value - Raw string to escape
 * @returns Escaped string safe for HTML/attribute context
 */
export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  // Reject protocol-relative URLs (e.g. //evil.com)
  if (trimmed.startsWith('//')) {
    return '';
  }
  
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
