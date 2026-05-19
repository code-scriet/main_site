// QRTicket — inner ticket card (no Sheet wrapper).
// QRTicketSheet — self-scoped right/bottom sheet usable from any surface
// (public EventDetailPage or dashboard pages).
// Design source: /tmp/design_bundle/.../project/js/screen-events.jsx (TicketSheet, lines 333-420).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  CalendarX2,
  Check,
  CheckCircle2,
  Download,
  Share2,
  X,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime, formatTime } from '@/lib/dateUtils';
import { copyTextToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types

interface DayAttendanceRow {
  dayNumber: number;
  attended: boolean;
  scannedAt: string | null;
}

interface QRTicketEvent {
  title: string;
  startDate: string;
  endDate: string | null;
  status?: string;
  /** Event type / format, e.g. "Hackathon", "Workshop". Renders in the gradient strip pill. */
  eventType?: string;
}

interface QRTicketProps {
  attendanceToken: string | null;
  attended: boolean;
  scannedAt: string | null;
  eventDays?: number;
  dayLabels?: string[];
  dayAttendances?: DayAttendanceRow[];
  daysAttended?: number;
  allDaysAttended?: boolean;
  event: QRTicketEvent;
  /** Optional gradient cover (Tailwind classes, e.g. "from-orange-500 to-red-600"). */
  coverGradient?: string;
  /** Holder name printed on the ticket. Defaults to signed-in user. */
  holderName?: string;
  /** Team name (if part of a team registration). */
  teamName?: string;
  /** Short ticket reference string (e.g. team invite code or registration id slice). */
  ticketReference?: string;
}

const DEFAULT_EVENT_DURATION_MS = 4 * 60 * 60 * 1000;

type TicketState = 'attended' | 'past_not_attended' | 'qr_visible' | 'no_token';

// ─────────────────────────────────────────────────────────────────────────────
// State resolution

function getAttendedDayCount(props: Pick<QRTicketProps, 'daysAttended' | 'dayAttendances' | 'attended'>): number {
  if (typeof props.daysAttended === 'number') return Math.max(0, props.daysAttended);
  if (Array.isArray(props.dayAttendances)) return props.dayAttendances.filter((d) => d.attended).length;
  return props.attended ? 1 : 0;
}

function isFullyAttended(props: QRTicketProps): boolean {
  if (typeof props.allDaysAttended === 'boolean') return props.allDaysAttended;
  const totalDays = Number.isInteger(props.eventDays) && (props.eventDays || 0) > 1
    ? (props.eventDays as number)
    : 1;
  if (totalDays <= 1) return props.attended;
  if (Array.isArray(props.dayAttendances) && props.dayAttendances.length > 0) {
    return getAttendedDayCount(props) >= totalDays;
  }
  return false;
}

function resolveState(props: QRTicketProps): TicketState {
  if (isFullyAttended(props)) return 'attended';
  if (!props.attendanceToken) return 'no_token';
  const now = Date.now();
  const startMs = new Date(props.event.startDate).getTime();
  const endMs = props.event.endDate
    ? new Date(props.event.endDate).getTime()
    : startMs + DEFAULT_EVENT_DURATION_MS;
  if (props.event.status === 'PAST' || now > endMs) return 'past_not_attended';
  return 'qr_visible';
}

// Deterministic gradient when caller didn't supply one. Avoids the all-grey fallback.
const FALLBACK_GRADIENTS = [
  'from-orange-500 to-red-600',
  'from-violet-500 to-fuchsia-600',
  'from-teal-500 to-cyan-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
];
function fallbackGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 7) % FALLBACK_GRADIENTS.length;
  return FALLBACK_GRADIENTS[h];
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner ticket card (no sheet chrome)

export default function QRTicket(props: QRTicketProps) {
  const {
    attendanceToken, attended, scannedAt,
    eventDays, dayLabels, dayAttendances, daysAttended,
    event, coverGradient, holderName, teamName, ticketReference,
  } = props;
  const { user } = useAuth();

  const normalizedDays = Number.isInteger(eventDays) && (eventDays || 0) > 1 ? (eventDays as number) : 1;
  const attendedCount = getAttendedDayCount({ daysAttended, dayAttendances, attended });

  const [ticketState, setTicketState] = useState<TicketState>(() => resolveState(props));
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTicketState(resolveState(props));
    const tick = () => setTicketState(resolveState(props));
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [props]);

  const gradient = coverGradient || fallbackGradient(event.title);
  const displayHolder = holderName || user?.name || 'Holder';
  const reference = ticketReference || (attendanceToken ? attendanceToken.slice(-8).toUpperCase() : '——');

  const dayCards = useMemo(() => {
    if (normalizedDays <= 1) return null;
    return Array.from({ length: normalizedDays }, (_, i) => {
      const dayNumber = i + 1;
      const label = dayLabels?.[i] || `Day ${dayNumber}`;
      const row = dayAttendances?.find((d) => d.dayNumber === dayNumber);
      const isAttended = row?.attended ?? (attendedCount > i);
      return { dayNumber, label, isAttended };
    });
  }, [normalizedDays, dayLabels, dayAttendances, attendedCount]);

  const handleDownload = useCallback(() => {
    const svgElement = qrRef.current?.querySelector('svg');
    if (!svgElement) return;
    const padding = 32;
    const qrSize = 200;
    const titleHeight = 48;
    const subtitleHeight = 36;
    const canvasWidth = qrSize + padding * 2;
    const canvasHeight = qrSize + padding * 2 + titleHeight + subtitleHeight;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const titleText = event.title.length > 30 ? event.title.substring(0, 28) + '…' : event.title;
    ctx.fillText(titleText, canvasWidth / 2, padding + 18);

    ctx.fillStyle = '#4b5563';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`${formatDate(event.startDate)} · ${formatTime(event.startDate)}`, canvasWidth / 2, padding + 36);

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const qrX = (canvasWidth - qrSize) / 2;
      const qrY = padding + titleHeight;
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
      URL.revokeObjectURL(url);

      ctx.fillStyle = '#6b7280';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('Scan to mark attendance', canvasWidth / 2, qrY + qrSize + 22);

      const link = document.createElement('a');
      link.download = `qr-ticket-${event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  }, [event.title, event.startDate]);

  const handleShare = useCallback(async () => {
    const text = `My ticket for ${event.title} — ${formatDate(event.startDate)}`;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && (navigator as Navigator).share) {
      try {
        await (navigator as Navigator).share({ title: event.title, text, url });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    const ok = await copyTextToClipboard(url);
    toast[ok ? 'success' : 'error'](ok ? 'Event link copied' : 'Could not copy link');
  }, [event.title, event.startDate]);

  return (
    <div className="flex flex-col gap-4">
      {/* Ticket card */}
      <div className="rounded-[14px] overflow-hidden border border-[var(--border-default)] bg-[var(--bg-raised)] shadow-md">
        {/* Top gradient strip */}
        <div className={cn('p-4 bg-gradient-to-br text-white', gradient)}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] px-2 h-[20px] rounded-[6px] bg-white/20 border border-transparent">
              {(event.eventType || 'Event') + (teamName ? ' · Team' : ' · Solo')}
            </span>
            <span className="text-[10.5px] font-mono tabular-nums opacity-80">TICKET · {reference}</span>
          </div>
          <div className="text-[18px] font-semibold leading-tight mt-2">{event.title}</div>
          <div className="text-[12px] opacity-90 mt-1">
            {formatDate(event.startDate)} · {formatTime(event.startDate)}
          </div>
        </div>

        {/* QR / state body — exact spec from screen-events.jsx:355-373.
            Box: 200×200, rounded-[10px], bg-[var(--surface-soft)], p-3 (12px
            internal padding). The QR fills the inner 176×176 area edge-to-edge
            so the rounded box bg acts as the visible "frame", matching the
            design mock.
            level="L" + boostLevel keeps the module count as low as the JWT
            payload allows. marginSize=0 because the box padding is the quiet
            zone — adding more would shrink the cells visibly. */}
        <div className="p-5 bg-[var(--bg-raised)] flex justify-center">
          {ticketState === 'qr_visible' && attendanceToken && (
            <div ref={qrRef} className="w-[200px] h-[200px] rounded-[10px] bg-[var(--surface-soft)] p-3 flex items-center justify-center">
              <QRCodeSVG
                value={attendanceToken}
                size={176}
                level="L"
                marginSize={0}
                boostLevel
                bgColor="transparent"
                fgColor="var(--ds-text-1, #111827)"
              />
            </div>
          )}
          {ticketState === 'attended' && (
            <div className="w-[200px] h-[200px] rounded-[10px] bg-[var(--success-bg)] flex flex-col items-center justify-center gap-2 text-center px-4">
              <div className="size-12 rounded-full bg-[var(--success)] text-white flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="text-[13.5px] font-semibold text-[var(--success)]">Attended</div>
              {normalizedDays > 1 && (
                <div className="text-[11px] text-[var(--ds-text-2)]">
                  All {normalizedDays} days complete
                </div>
              )}
              {scannedAt && (
                <div className="text-[10.5px] text-[var(--ds-text-3)] font-mono">
                  {formatDateTime(scannedAt)}
                </div>
              )}
            </div>
          )}
          {ticketState === 'past_not_attended' && (
            <div className="w-[200px] h-[200px] rounded-[10px] bg-[var(--surface-soft)] flex flex-col items-center justify-center gap-2 text-center px-4">
              <CalendarX2 className="h-8 w-8 text-[var(--ds-text-3)]" />
              <div className="text-[12.5px] text-[var(--ds-text-2)]">This event has ended.</div>
              <div className="text-[10.5px] text-[var(--ds-text-3)]">Attendance was not recorded.</div>
            </div>
          )}
          {ticketState === 'no_token' && (
            <div className="w-[200px] h-[200px] rounded-[10px] bg-[var(--surface-soft)] flex flex-col items-center justify-center gap-2 text-center px-4">
              <AlertCircle className="h-8 w-8 text-[var(--ds-text-3)]" />
              <div className="text-[12.5px] text-[var(--ds-text-2)]">No QR ticket yet.</div>
              <div className="text-[10.5px] text-[var(--ds-text-3)]">Contact the organizer if this looks wrong.</div>
            </div>
          )}
        </div>

        {/* Footer — holder / team */}
        <div className="p-4 border-t border-[var(--border-subtle)]">
          <div className={cn('grid gap-3', teamName ? 'grid-cols-2' : 'grid-cols-1')}>
            <div>
              <div className="text-[10.5px] uppercase text-[var(--ds-text-3)] font-semibold tracking-[0.06em]">Holder</div>
              <div className="text-[13.5px] font-medium mt-0.5 truncate">{displayHolder}</div>
            </div>
            {teamName && (
              <div>
                <div className="text-[10.5px] uppercase text-[var(--ds-text-3)] font-semibold tracking-[0.06em]">Team</div>
                <div className="text-[13.5px] font-medium mt-0.5 truncate">{teamName}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Day check-in strip — only for multi-day events */}
      {dayCards && dayCards.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-2">
            Day check-ins
          </div>
          <div className="flex gap-2">
            {dayCards.map((d) => (
              <div
                key={d.dayNumber}
                className={cn(
                  'flex-1 p-3 rounded-[10px] border text-center',
                  d.isAttended
                    ? 'border-[var(--success-border)] bg-[var(--success-bg)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-soft)]',
                )}
              >
                <div className="text-[10px] uppercase font-semibold text-[var(--ds-text-3)] tracking-[0.06em]">
                  Day {d.dayNumber}
                </div>
                <div className="text-[12.5px] font-medium mt-0.5 truncate">{d.label}</div>
                <div
                  className={cn(
                    'mt-1.5 inline-flex items-center justify-center size-5 rounded-full',
                    d.isAttended
                      ? 'bg-[var(--success)] text-white'
                      : 'bg-[var(--border)] text-[var(--ds-text-3)]',
                  )}
                >
                  {d.isAttended ? (
                    <Check size={10} />
                  ) : (
                    <span className="text-[10px] font-mono tabular-nums">{d.dayNumber}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {ticketState === 'qr_visible' && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Add to wallet
          </Button>
          <Button size="sm" variant="ghost" onClick={handleShare}>
            <Share2 className="h-3.5 w-3.5 mr-1.5" />
            Share
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet wrapper — self-scoped data-dashboard, usable from anywhere

interface QRTicketSheetProps extends QRTicketProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Custom node above the ticket card, e.g. a context banner. */
  intro?: ReactNode;
}

export function QRTicketSheet({ open, onOpenChange, intro, ...ticketProps }: QRTicketSheetProps) {
  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[80] bg-[var(--bg-overlay,rgba(15,15,15,0.55))] backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          // Position spec — exact match for screen-events.jsx TicketSheet:
          //   - mobile: bottom sheet, full-width, top-only rounded, max-h-[92vh]
          //   - desktop: right drawer, 440px wide, full-height (top + bottom
          //     anchored), left-only rounded, NO max-height cap.
          // Earlier bug: `sm:bottom-auto` cancelled `sm:inset-y-0` so the
          // drawer didn't extend to the bottom edge; removed.
          className={cn(
            'fixed z-[81] flex flex-col focus:outline-none',
            'bg-[var(--bg-raised)] shadow-[var(--shadow-xl,0_20px_50px_-15px_rgba(0,0,0,0.35))]',
            // Mobile (default): bottom sheet
            'inset-x-0 bottom-0 rounded-t-[16px] max-h-[92vh]',
            'border-t border-[var(--border-subtle)]',
            // Desktop (sm+): right drawer, full height
            'sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[440px] sm:max-h-none',
            'sm:rounded-l-[16px] sm:rounded-t-none',
            'sm:border-t-0 sm:border-l sm:border-[var(--border-subtle)]',
            // Slide animations: from bottom on mobile, from right on desktop
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0',
            'sm:data-[state=closed]:slide-out-to-right sm:data-[state=open]:slide-in-from-right',
          )}
          data-dashboard="true"
          data-accent={accent}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between h-[48px] px-4 border-b border-[var(--border-subtle)] shrink-0">
            <DialogPrimitive.Title className="text-[13.5px] font-semibold text-[var(--ds-text-1)]">
              Your ticket
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="size-7 rounded-[6px] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          {/* Body */}
          <div className="p-5 flex-1 overflow-y-auto bg-[var(--bg-raised)]">
            {intro}
            <DialogPrimitive.Description className="sr-only">
              Show this QR code at the venue to mark your attendance.
            </DialogPrimitive.Description>
            <QRTicket {...ticketProps} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
