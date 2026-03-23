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
