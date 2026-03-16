import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDate, formatTime } from "@/lib/dateUtils";
import {
  CheckCircle2,
  Clock,
  Download,
  QrCode,
  CalendarX2,
  AlertCircle,
} from "lucide-react";

interface QRTicketProps {
  attendanceToken: string | null;
  attended: boolean;
  scannedAt: string | null;
  event: {
    title: string;
    startDate: string;
    endDate: string | null;
    status?: string;
  };
}

const QR_VISIBLE_BEFORE_START_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_EVENT_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

function getTimeUntil(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "";

  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

type TicketState =
  | "attended"
  | "past_not_attended"
  | "upcoming_locked"
  | "qr_visible"
  | "no_token";

function resolveState(props: QRTicketProps): TicketState {
  if (props.attended) return "attended";
  if (!props.attendanceToken) return "no_token";

  const now = Date.now();
  const startMs = new Date(props.event.startDate).getTime();
  const endMs = props.event.endDate
    ? new Date(props.event.endDate).getTime()
    : startMs + DEFAULT_EVENT_DURATION_MS;

  const qrWindowStart = startMs - QR_VISIBLE_BEFORE_START_MS;

  if (props.event.status === "PAST" || now > endMs) {
    return "past_not_attended";
  }

  if (now < qrWindowStart) {
    return "upcoming_locked";
  }

  return "qr_visible";
}

export default function QRTicket({
  attendanceToken,
  attended,
  scannedAt,
  event,
}: QRTicketProps) {
  const [ticketState, setTicketState] = useState<TicketState>(() =>
    resolveState({ attendanceToken, attended, scannedAt, event })
  );
  const [countdown, setCountdown] = useState("");
  const qrRef = useRef<HTMLDivElement>(null);

  // Re-evaluate state and countdown every 15 seconds
  useEffect(() => {
    function tick() {
      const state = resolveState({
        attendanceToken,
        attended,
        scannedAt,
        event,
      });
      setTicketState(state);

      if (state === "upcoming_locked") {
        const startMs = new Date(event.startDate).getTime();
        const qrWindowStart = startMs - QR_VISIBLE_BEFORE_START_MS;
        setCountdown(getTimeUntil(qrWindowStart));
      } else {
        setCountdown("");
      }
    }

    tick();
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [attendanceToken, attended, scannedAt, event]);

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

      {ticketState === "upcoming_locked" && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Clock className="h-8 w-8 text-amber-400 animate-pulse" />
          <p className="text-sm font-medium text-amber-700">
            QR will be available in{" "}
            <span className="font-bold">{countdown || "..."}</span>
          </p>
          <p className="text-xs text-amber-500">
            Available 30 minutes before the event starts
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
          </p>
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
