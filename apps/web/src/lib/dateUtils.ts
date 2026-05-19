/**
 * Date utility functions for consistent date/time formatting
 * Uses Indian locale (en-IN) and Asia/Kolkata timezone
 */

const IST_TIMEZONE = 'Asia/Kolkata';
const LOCALE = 'en-IN';
type DateFormatStyle = 'numeric' | 'short' | 'long';

const DATE_STYLE_OPTIONS: Record<DateFormatStyle, Intl.DateTimeFormatOptions> = {
  numeric: {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  },
  short: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
  long: {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  },
};

/**
 * Format a date for datetime-local input field
 * Returns format: YYYY-MM-DDTHH:MM in IST timezone
 */
export function formatDateTimeLocal(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  // Get IST date components
  const formatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
}

/**
 * Format a date as DD/MM/YYYY in IST
 */
export function formatDate(
  dateString: string | Date | undefined | null,
  style: DateFormatStyle = 'numeric',
): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  return date.toLocaleDateString(LOCALE, {
    timeZone: IST_TIMEZONE,
    ...DATE_STYLE_OPTIONS[style],
  });
}

/**
 * Format a date as DD/MM/YYYY HH:MM AM/PM in IST
 */
export function formatDateTime(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  return date.toLocaleString(LOCALE, {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format time as HH:MM AM/PM in IST
 */
export function formatTime(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  return date.toLocaleTimeString(LOCALE, { 
    timeZone: IST_TIMEZONE,
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
}

/**
 * Get short weekday name (e.g., "Mon", "Tue") in IST
 */
export function getWeekdayShort(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString(LOCALE, { 
    timeZone: IST_TIMEZONE,
    weekday: 'short' 
  });
}

/**
 * Get short month name (e.g., "Jan", "Feb") in IST
 */
export function getMonthShort(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString(LOCALE, { 
    timeZone: IST_TIMEZONE,
    month: 'short' 
  });
}

/**
 * Get day of month in IST
 */
export function getDayOfMonth(dateString: string | Date | undefined | null): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  const day = date.toLocaleDateString(LOCALE, {
    timeZone: IST_TIMEZONE,
    day: 'numeric',
  });
  return parseInt(day, 10);
}

/**
 * Format a duration in milliseconds as Hh Mm Ss / Mm Ss / Ss.
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Format time in IST (HH:MM 24-hr style).
 */
export function formatIstTime(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString(LOCALE, {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format date + time in IST (DD MMM YYYY HH:MM).
 */
export function formatIstDateTime(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString(LOCALE, {
    timeZone: IST_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Relative time string: "just now", "5m ago", "3h ago", "2d ago", or absolute for older.
 */
export function relativeTime(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const ts = date.getTime();
  if (!Number.isFinite(ts)) return '';
  const now = Date.now();
  const diffMs = now - ts;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const sec = Math.round(abs / 1000);
  const min = Math.round(abs / 60_000);
  const hour = Math.round(abs / 3_600_000);
  const day = Math.round(abs / 86_400_000);
  if (sec < 45) return future ? 'in a few seconds' : 'just now';
  if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
  if (hour < 24) return future ? `in ${hour}h` : `${hour}h ago`;
  if (day < 7) return future ? `in ${day}d` : `${day}d ago`;
  return formatDate(date, 'short');
}
