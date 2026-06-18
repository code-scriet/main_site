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

// Trim to ~500 chars on a word boundary (avoid cutting mid-word) with an ellipsis.
function clampDescription(raw?: string | null): string | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  if (text.length <= 500) return text;
  const cut = text.slice(0, 500);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 400 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function details(ev: CalendarEvent): string {
  return [clampDescription(ev.description), ev.url].filter(Boolean).join('\n\n');
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

// Fold content lines longer than 75 octets per RFC 5545 §3.1 (CRLF + a single
// leading space continues the line). Strict parsers reject over-long lines; this
// keeps us conformant. Char-length is a safe approximation for our ASCII content.
function foldICSLine(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

export function buildICS(ev: CalendarEvent): string {
  const start = new Date(ev.startDate);
  const end = resolveEnd(start, ev.endDate);
  // Collision-free UID. crypto.randomUUID exists in every browser we target (and
  // Node 18+ for any SSR path); fall back only if the API is somehow unavailable.
  const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const uid = `${toStamp(start)}-${rand}@codescriet.dev`;
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
  // URL is a URI value (not text-escaped), but strip any CR/LF so a stray newline
  // can't inject extra iCalendar properties.
  if (ev.url) lines.push(`URL:${ev.url.replace(/[\r\n]/g, '')}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldICSLine).join('\r\n');
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
