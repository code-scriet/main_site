import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDate, formatTime } from "@/lib/dateUtils";
import {
  CheckCircle2,
  Download,
  QrCode,
  CalendarX2,
  AlertCircle,
} from "lucide-react";

interface QRTicketProps {
  attendanceToken: string | null;
  attended: boolean;
  scannedAt: string | null;
  eventDays?: number;
  dayLabels?: string[];
  dayAttendances?: Array<{
    dayNumber: number;
    attended: boolean;
    scannedAt: string | null;
  }>;
  daysAttended?: number;
  allDaysAttended?: boolean;
  event: {
    title: string;
    startDate: string;
    endDate: string | null;
    status?: string;
  };
}

const DEFAULT_EVENT_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

type TicketState =
  | "attended"
  | "past_not_attended"
  | "qr_visible"
  | "no_token";

function getAttendedDayCount(props: QRTicketProps): number {
  if (typeof props.daysAttended === "number") {
    return Math.max(0, props.daysAttended);
  }

  if (Array.isArray(props.dayAttendances)) {
    return props.dayAttendances.filter((day) => day.attended).length;
  }

  return props.attended ? 1 : 0;
}

function isFullyAttended(props: QRTicketProps): boolean {
  if (typeof props.allDaysAttended === "boolean") {
    return props.allDaysAttended;
  }

  const totalDays = Number.isInteger(props.eventDays) && (props.eventDays || 0) > 1
    ? (props.eventDays as number)
    : 1;

  if (totalDays <= 1) {
    return props.attended;
  }

  if (Array.isArray(props.dayAttendances) && props.dayAttendances.length > 0) {
    return getAttendedDayCount(props) >= totalDays;
  }

  // For multi-day events with incomplete day-level data, keep QR visible.
  return false;
}

function resolveState(props: QRTicketProps): TicketState {
  if (isFullyAttended(props)) return "attended";
  if (!props.attendanceToken) return "no_token";

  const now = Date.now();
  const startMs = new Date(props.event.startDate).getTime();
  const endMs = props.event.endDate
    ? new Date(props.event.endDate).getTime()
    : startMs + DEFAULT_EVENT_DURATION_MS;

  if (props.event.status === "PAST" || now > endMs) {
    return "past_not_attended";
  }

  return "qr_visible";
}

export default function QRTicket({
  attendanceToken,
  attended,
  scannedAt,
  eventDays,
  dayLabels,
  dayAttendances,
  daysAttended,
  allDaysAttended,
  event,
}: QRTicketProps) {
  const normalizedEventDays = Number.isInteger(eventDays) && (eventDays || 0) > 1
    ? (eventDays as number)
    : 1;
  const attendedDayCount = getAttendedDayCount({
    attendanceToken,
    attended,
    scannedAt,
    eventDays,
    dayLabels,
    dayAttendances,
    daysAttended,
    allDaysAttended,
    event,
  });
  const nextPendingDayNumber = normalizedEventDays > 1
    ? Math.min(attendedDayCount + 1, normalizedEventDays)
    : null;
  const nextPendingDayLabel = nextPendingDayNumber
    ? dayLabels?.[nextPendingDayNumber - 1] || `Day ${nextPendingDayNumber}`
    : null;

  const [ticketState, setTicketState] = useState<TicketState>(() =>
    resolveState({
      attendanceToken,
      attended,
      scannedAt,
      eventDays,
      dayLabels,
      dayAttendances,
      daysAttended,
      allDaysAttended,
      event,
    })
  );
  const qrRef = useRef<HTMLDivElement>(null);

  // Re-evaluate state every 15 seconds
  useEffect(() => {
    function tick() {
      const state = resolveState({
        attendanceToken,
        attended,
        scannedAt,
        eventDays,
        dayLabels,
        dayAttendances,
        daysAttended,
        allDaysAttended,
        event,
      });
      setTicketState(state);
    }

    tick();
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [attendanceToken, attended, scannedAt, eventDays, dayLabels, dayAttendances, daysAttended, allDaysAttended, event]);

  const handleDownload = useCallback(() => {
    if (!qrRef.current) return;

    const svgElement = qrRef.current.querySelector("svg");
    if (!svgElement) return;

    const padding = 32;
    const qrSize = 200;
    const titleHeight = 48;
    const subtitleHeight = 36;
    const canvasWidth = qrSize + padding * 2;
    const canvasHeight =
      qrSize + padding * 2 + titleHeight + subtitleHeight;

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#fffbeb";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Border
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, canvasWidth - 3, canvasHeight - 3);

    // Title
    ctx.fillStyle = "#92400e";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    const titleText =
      event.title.length > 30
        ? event.title.substring(0, 28) + "..."
        : event.title;
    ctx.fillText(titleText, canvasWidth / 2, padding + 18);

    // Date line
    ctx.fillStyle = "#b45309";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(
      formatDate(event.startDate),
      canvasWidth / 2,
      padding + 36
    );

    // Draw QR from SVG
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const qrX = (canvasWidth - qrSize) / 2;
      const qrY = padding + titleHeight;
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
      URL.revokeObjectURL(url);

      // Subtitle below QR
      ctx.fillStyle = "#78716c";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Scan to mark attendance",
        canvasWidth / 2,
        qrY + qrSize + 22
      );

      // Trigger download
      const link = document.createElement("a");
      link.download = `qr-ticket-${event.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    img.src = url;
  }, [event.title, event.startDate]);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <QrCode className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">
          Attendance QR Ticket
        </h3>
      </div>

      {/* Event info */}
      <p className="mb-1 text-sm font-medium text-amber-800 truncate">
        {event.title}
      </p>
      <p className="mb-4 text-xs text-amber-600">
        {formatDate(event.startDate)}
        {event.endDate ? ` - ${formatDate(event.endDate)}` : ""}
        {" | "}
        {formatTime(event.startDate)}
      </p>

      {/* State-dependent content */}
      {ticketState === "attended" && (
        <div className="flex flex-col items-center gap-2 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-300 text-sm">
              Attended
            </Badge>
          </div>
          {normalizedEventDays > 1 && (
            <p className="text-xs text-green-700">
              Completed all {normalizedEventDays} attendance days.
            </p>
          )}
          {scannedAt && (
            <p className="text-xs text-green-700">
              Marked at {formatDateTime(scannedAt)}
            </p>
          )}
        </div>
      )}

      {ticketState === "past_not_attended" && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CalendarX2 className="h-8 w-8 text-stone-400" />
          <p className="text-sm text-stone-500">
            This event has ended. Attendance was not recorded.
          </p>
        </div>
      )}

      {ticketState === "qr_visible" && attendanceToken && (
        <div className="flex flex-col items-center gap-3">
          <div
            ref={qrRef}
            className="rounded-lg border-2 border-amber-300 bg-white p-3"
          >
            <QRCodeSVG
              value={attendanceToken}
              size={200}
              level="M"
              bgColor="#ffffff"
              fgColor="#1c1917"
            />
          </div>
          <p className="text-xs text-amber-600">
            Show this QR code to mark your attendance
            {nextPendingDayLabel ? ` (${nextPendingDayLabel})` : ''}
          </p>
          {normalizedEventDays > 1 && (
            <p className="text-[11px] text-amber-700">
              Progress: {Math.min(attendedDayCount, normalizedEventDays)} / {normalizedEventDays} days completed
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="border-amber-300 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download QR
          </Button>
        </div>
      )}

      {ticketState === "no_token" && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <AlertCircle className="h-8 w-8 text-stone-400" />
          <p className="text-sm text-stone-500">
            No QR ticket available for this event.
          </p>
        </div>
      )}
    </div>
  );
}
