/**
 * Date utility functions for consistent date/time formatting
 * Uses Indian locale (en-IN) and Asia/Kolkata timezone
 */

/**
 * Format a date for datetime-local input field
 * Returns format: YYYY-MM-DDTHH:MM in local timezone
 */
export function formatDateTimeLocal(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  // Get local date components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format a date as DD/MM/YYYY
 */
export function formatDate(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Format a date as DD/MM/YYYY HH:MM AM/PM
 */
export function formatDateTime(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  return `${day}/${month}/${year} ${displayHours}:${minutes} ${ampm}`;
}

/**
 * Format time as HH:MM AM/PM
 */
export function formatTime(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
}

/**
 * Get short weekday name (e.g., "Mon", "Tue")
 */
export function getWeekdayShort(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Get short month name (e.g., "Jan", "Feb")
 */
export function getMonthShort(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short' });
}

/**
 * Get day of month
 */
export function getDayOfMonth(dateString: string | Date | undefined | null): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.getDate();
}
