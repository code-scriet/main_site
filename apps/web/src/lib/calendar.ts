// S-04 — Calendar export. Builds a Google Calendar "add event" URL and a
// downloadable .ics file from event fields, entirely client-side (no backend,
// no dependency). The Google URL is also reused server-side for the
// registration-confirmation email (see apps/api/src/utils/emailTemplates.ts).

export interface CalendarEvent {
  title: string;
  description?: string | null; // plain text — pass shortDescription, not HTML
  location?: string | null;
  startDate: string | Date;
  endDate?: string | Date | null;
  url?: string; // canonical event URL embedded in the description
}

// Calendar timestamp in UTC basic format, e.g. 20260618T093000Z.
function toStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Fall back to start + 2h when there's no end date (mirrors the QR-window fallback).
function resolveEnd(start: Date, end?: string | Date | null): Date {
  if (end) {
    const e = new Date(end);
    if (!Number.isNaN(e.getTime()) && e.getTime() > start.getTime()) return e;
  }
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

function details(ev: CalendarEvent): string {
  return [ev.description?.trim().slice(0, 500), ev.url].filter(Boolean).join('\n\n');
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const start = new Date(ev.startDate);
  const end = resolveEnd(start, ev.endDate);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${toStamp(start)}/${toStamp(end)}`,
  });
  const d = details(ev);
  if (d) params.set('details', d);
  if (ev.location) params.set('location', ev.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Escape per RFC 5545 text rules.
function escapeICS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function buildICS(ev: CalendarEvent): string {
  const start = new Date(ev.startDate);
  const end = resolveEnd(start, ev.endDate);
  const uid = `${toStamp(start)}-${Math.random().toString(36).slice(2)}@codescriet.dev`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//code.scriet//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toStamp(new Date())}`,
    `DTSTART:${toStamp(start)}`,
    `DTEND:${toStamp(end)}`,
    `SUMMARY:${escapeICS(ev.title)}`,
  ];
  const d = details(ev);
  if (d) lines.push(`DESCRIPTION:${escapeICS(d)}`);
  if (ev.location) lines.push(`LOCATION:${escapeICS(ev.location)}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(ev: CalendarEvent, filename = 'event.ics'): void {
  const blob = new Blob([buildICS(ev)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
