import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useOfflineScanner } from '@/hooks/useOfflineScanner';
import { api, type AttendanceLiveData, type AttendanceSearchResult } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Wifi,
  WifiOff,
  UserPlus,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  QrCode,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminScannerProps {
  eventId: string;
  token: string;
  onEndSession?: () => void;
}

type ToastStatus = 'success' | 'duplicate' | 'error';

interface ScanToast {
  id: number;
  status: ToastStatus;
  message: string;
}

type AudioContextConstructor = typeof AudioContext;

// ---------------------------------------------------------------------------
// Audio helper
// ---------------------------------------------------------------------------

function playTone(frequency: number, duration: number) {
  try {
    const AudioContextCtor: AudioContextConstructor | undefined =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {
    // Silently ignore — audio not critical
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const READER_ID = 'attendance-qr-reader';
const DEDUP_MS = 3000;
const TOAST_MS = 1200;
const LIVE_POLL_MS = 10_000;
const SEARCH_DEBOUNCE_MS = 300;

function isLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isBenignCameraAbort(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return (
    message.includes('AbortError') ||
    message.includes('The play() request was interrupted by a new load request')
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminScanner({ eventId, token, onEndSession }: AdminScannerProps) {
  // ---- Feature toggles (must be declared before useOfflineScanner which reads bypassWindow) ----
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [bypassWindow, setBypassWindow] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);

  // ---- Offline scanner hook ----
  const {
    scans,
    stats: scanStats,
    addScan,
    syncPending,
    syncStatus,
  } = useOfflineScanner({ eventId, authToken: token, dayNumber: selectedDay, bypassWindow });

  // ---- Refs ----
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const recentScanMapRef = useRef<Map<string, number>>(new Map());
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startingRef = useRef(false); // concurrency guard for startCamera
  const mountedRef = useRef(true);
  const startRetryRef = useRef(0);

  // ---- Camera state ----
  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [startingCamera, setStartingCamera] = useState(false);
  const [stoppingCamera, setStoppingCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraOpRef = useRef(0);
  const stopRequestedRef = useRef(false);

  // ---- Live data ----
  const [liveData, setLiveData] = useState<AttendanceLiveData | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const eventDays = Math.max(1, liveData?.eventDays ?? 1);
  const dayLabels = liveData?.dayLabels ?? [];

  useEffect(() => {
    setSelectedDay((prev) => Math.min(Math.max(prev, 1), eventDays));
  }, [eventDays]);

  // ---- Toast overlay ----
  const [toast, setToast] = useState<ScanToast | null>(null);
  const toastIdRef = useRef(0);

  // ---- Manual check-in dialog ----
  const [manualOpen, setManualOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AttendanceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState<string | null>(null);

  // ---- End session ----
  const [ending, setEnding] = useState(false);
  const [endSummary, setEndSummary] = useState<{ total: number; synced: number; errors: number } | null>(null);

  // --------------------------------------------------------------------------
  // Online/offline detection
  // --------------------------------------------------------------------------

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // --------------------------------------------------------------------------
  // Live data polling
  // --------------------------------------------------------------------------

  const fetchLiveData = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const data = await api.getAttendanceLive(eventId, token);
      setLiveData(data);
    } catch {
      // Silently ignore — will retry on next interval
    }
  }, [eventId, token]);

  useEffect(() => {
    fetchLiveData();
    liveIntervalRef.current = setInterval(fetchLiveData, LIVE_POLL_MS);
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [fetchLiveData]);

  // --------------------------------------------------------------------------
  // Toast helper
  // --------------------------------------------------------------------------

  const showToast = useCallback((status: ToastStatus, message: string) => {
    const id = ++toastIdRef.current;
    setToast({ id, status, message });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, TOAST_MS);
  }, []);

  // --------------------------------------------------------------------------
  // QR scan handler
  // --------------------------------------------------------------------------

  const handleScan = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      const recentScans = recentScanMapRef.current;
      const dedupeKey = `${decodedText}::${selectedDay}`;

      for (const [token, timestamp] of recentScans.entries()) {
        if (now - timestamp > DEDUP_MS) {
          recentScans.delete(token);
        }
      }

      // Dedup: skip if same code scanned within DEDUP_MS
      const lastSeenAt = recentScans.get(dedupeKey);
      if (typeof lastSeenAt === 'number' && now - lastSeenAt < DEDUP_MS) {
        if (audioEnabled) playTone(400, 150);
        showToast('duplicate', `Already scanned for Day ${selectedDay}`);
        return;
      }

      recentScans.set(dedupeKey, now);

      // addScan returns LocalScanEntry or null for invalid tokens.
      const result = addScan(decodedText);

      // Invalid QR code (not a JWT attendance token) — rejected immediately
      if (result?.localId === 'rejected') {
        if (audioEnabled) playTone(200, 300);
        showToast('error', 'Invalid QR — not an attendance code');
        return;
      }

      if (result?.synced && result.result === 'duplicate') {
        if (audioEnabled) playTone(400, 150);
        showToast('duplicate', result.errorMessage || result.userName || `Already scanned for Day ${selectedDay}`);
        return;
      }

      if (result?.synced && result.result === 'error') {
        if (audioEnabled) playTone(200, 300);
        showToast('error', result.errorMessage || 'Scan failed');
        return;
      }

      if (audioEnabled) playTone(800, 150);
      showToast('success', `Scan captured for Day ${selectedDay}, syncing...`);
    },
    [addScan, audioEnabled, selectedDay, showToast],
  );

  // --------------------------------------------------------------------------
  // Camera lifecycle
  // --------------------------------------------------------------------------

  const forceReleaseCameraTracks = useCallback(() => {
    const root = document.getElementById(READER_ID);
    if (!root) return;

    const videos = Array.from(root.getElementsByTagName('video'));
    for (const video of videos) {
      const stream = video.srcObject;
      if (stream instanceof MediaStream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      video.srcObject = null;
    }
  }, []);

  const ensureCameraPermission = useCallback(async () => {
    if (!window.isSecureContext && !isLocalhostHost(window.location.hostname)) {
      throw new Error(
        'Camera access requires HTTPS on phones. Open this page over HTTPS (or localhost on the same device) and try again.',
      );
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API is not available in this browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (startingRef.current || cameraRunning) return;
    const opId = ++cameraOpRef.current;
    stopRequestedRef.current = false;
    startingRef.current = true;
    setStartingCamera(true);
    setCameraError(null);

    try {
      await ensureCameraPermission();

      // Recreate scanner instance per start to avoid stale internal media state.
      if (html5QrRef.current) {
        try {
          if (html5QrRef.current.isScanning) {
            await html5QrRef.current.stop();
          }
          html5QrRef.current.clear();
        } catch {
          // Ignore cleanup errors while reinitializing scanner.
        }
        html5QrRef.current = null;
      }
      html5QrRef.current = new Html5Qrcode(READER_ID);

      await html5QrRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 280 } },
        (decodedText) => handleScan(decodedText),
        () => {
          // QR code not detected — no-op
        },
      );

      if (opId !== cameraOpRef.current || stopRequestedRef.current) {
        try {
          if (html5QrRef.current?.isScanning) {
            await html5QrRef.current.stop();
          }
        } catch {
          // Ignore stop failure during cancellation flow.
        }
        forceReleaseCameraTracks();
        return;
      }

      startRetryRef.current = 0;
      setCameraRunning(true);
      setCameraReady(true);
    } catch (err: unknown) {
      // html5-qrcode can reject its start() promise even when the camera feed IS
      // running (e.g. OverconstrainedError fallback on some mobile browsers).
      // The library may set isScanning asynchronously after the fallback succeeds,
      // so we delay the check by 500ms to let it settle.
      await new Promise((r) => setTimeout(r, 500));
      if (opId !== cameraOpRef.current || stopRequestedRef.current) {
        forceReleaseCameraTracks();
        return;
      }

      if (isBenignCameraAbort(err) && startRetryRef.current < 1) {
        startRetryRef.current += 1;
        forceReleaseCameraTracks();
        setTimeout(() => {
          if (!stopRequestedRef.current && mountedRef.current) {
            void startCamera();
          }
        }, 150);
        return;
      }

      if (html5QrRef.current?.isScanning) {
        startRetryRef.current = 0;
        setCameraRunning(true);
        setCameraReady(true);
        setCameraError(null);
        return;
      }
      const errorMessage = err instanceof Error ? err.message : '';
      const msg =
        errorMessage.includes('NotAllowedError') || errorMessage.includes('Permission')
          ? 'Camera permission denied. Please allow camera access in your browser settings and reload.'
          : errorMessage || 'Failed to start camera';
      setCameraError(msg);
      setCameraReady(false);
      forceReleaseCameraTracks();
    } finally {
      if (mountedRef.current) {
        setStartingCamera(false);
      }
      startingRef.current = false;
    }
  }, [cameraRunning, ensureCameraPermission, handleScan, forceReleaseCameraTracks]);

  const stopCamera = useCallback(async () => {
    stopRequestedRef.current = true;
    cameraOpRef.current += 1;
    setStoppingCamera(true);
    try {
      if (html5QrRef.current) {
        if (html5QrRef.current.isScanning) {
          await html5QrRef.current.stop();
        }
        html5QrRef.current.clear();
        html5QrRef.current = null;
      }
    } catch {
      // Camera may already be stopped
    } finally {
      forceReleaseCameraTracks();
      setCameraRunning(false);
      setCameraError(null);
      setCameraReady(false);
      setStartingCamera(false);
      setStoppingCamera(false);
      startingRef.current = false;
      startRetryRef.current = 0;
    }
  }, [forceReleaseCameraTracks]);

  // Do not auto-start on mount. Mobile browsers reliably show permission prompts
  // only when camera access is initiated by a user gesture.
  useEffect(() => {
    mountedRef.current = true;
    const recentScanMap = recentScanMapRef.current;
    return () => {
      mountedRef.current = false;
      void stopCamera();
      recentScanMap.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------------------------------
  // Fullscreen
  // --------------------------------------------------------------------------

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not supported or denied
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // --------------------------------------------------------------------------
  // Manual check-in search (debounced)
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!manualOpen || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.searchAttendance(eventId, searchQuery.trim(), token);
        setSearchResults(data.results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery, manualOpen, eventId, token]);

  const handleManualCheckin = async (registrationId: string) => {
    setCheckinLoading(registrationId);
    try {
      await api.manualCheckin(registrationId, token, selectedDay);
      if (audioEnabled) playTone(800, 150);
      showToast('success', `Checked in for Day ${selectedDay}`);
      // Refresh search results to reflect the updated status
      if (searchQuery.trim().length >= 2) {
        const data = await api.searchAttendance(eventId, searchQuery.trim(), token);
        setSearchResults(data.results);
      }
      fetchLiveData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Manual check-in failed';
      if (audioEnabled) playTone(200, 300);
      showToast('error', message);
    } finally {
      setCheckinLoading(null);
    }
  };

  // --------------------------------------------------------------------------
  // End session
  // --------------------------------------------------------------------------

  const handleEndSession = async () => {
    setEnding(true);
    try {
      await syncPending();
      setEndSummary({
        total: scans.length,
        synced: scans.filter((s) => s.synced).length,
        errors: scans.filter((s) => s.result === 'error').length,
      });
    } catch {
      setEndSummary({
        total: scans.length,
        synced: 0,
        errors: scans.filter((s) => !s.synced).length,
      });
    } finally {
      setEnding(false);
    }
  };

  const confirmEndSession = async () => {
    await stopCamera();
    onEndSession?.();
  };

  // --------------------------------------------------------------------------
  // Derived values
  // --------------------------------------------------------------------------

  const recentScans = [...scans].reverse().slice(0, 15);
  const totalRegistered = liveData?.total ?? 0;
  const attendedCount = liveData?.attended ?? scans.filter((scan) => scan.synced && scan.result === 'ok').length;
  const attendanceRate = totalRegistered > 0 ? Math.round((attendedCount / totalRegistered) * 100) : 0;
  const dayStatsMap = new Map((liveData?.dayStats ?? []).map((dayStat) => [dayStat.dayNumber, dayStat.count]));

  const toastColors: Record<ToastStatus, string> = {
    success: 'bg-green-500/90',
    duplicate: 'bg-yellow-500/90',
    error: 'bg-red-500/90',
  };

  const toastIcons: Record<ToastStatus, typeof CheckCircle> = {
    success: CheckCircle,
    duplicate: AlertTriangle,
    error: XCircle,
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col lg:flex-row gap-4 w-full',
        isFullscreen && 'bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto',
      )}
    >
      {/* ================================================================= */}
      {/* LEFT: Camera Scanner                                              */}
      {/* ================================================================= */}
      <div className="w-full lg:w-1/2 space-y-3">
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Camera className="h-5 w-5" />
                QR Scanner
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setAudioEnabled((v) => !v)}
                  title={audioEnabled ? 'Mute audio' : 'Unmute audio'}
                >
                  {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {eventDays > 1 && (
              <div className="mt-3 flex items-center gap-2">
                <Label htmlFor="attendance-day-select" className="text-sm whitespace-nowrap">
                  Taking attendance for:
                </Label>
                <select
                  id="attendance-day-select"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(Number.parseInt(e.target.value, 10) || 1)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Array.from({ length: eventDays }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      {dayLabels[day - 1] || `Day ${day}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </CardHeader>

          <CardContent className="relative">
            {/* Camera viewport */}
            <div
              id={READER_ID}
              className="w-full rounded-lg overflow-hidden bg-black/5 min-h-[300px]"
            />

            {/* Toast overlay */}
            <AnimatePresence>
              {toast && (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                  className={`absolute inset-x-4 top-4 rounded-lg px-4 py-3 text-white font-medium flex items-center gap-2 shadow-lg ${toastColors[toast.status]}`}
                >
                  {(() => {
                    const Icon = toastIcons[toast.status];
                    return <Icon className="h-5 w-5 shrink-0" />;
                  })()}
                  <span className="truncate">{toast.message}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Camera error */}
            {cameraError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Camera controls */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                variant={cameraRunning ? 'destructive' : 'default'}
                size="sm"
                disabled={startingCamera || stoppingCamera}
                onClick={cameraRunning ? stopCamera : startCamera}
              >
                {startingCamera || stoppingCamera ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-1.5" />
                )}
                {startingCamera ? 'Starting...' : stoppingCamera ? 'Stopping...' : cameraRunning ? 'Stop Camera' : 'Start Camera'}
              </Button>

              {!cameraRunning && !cameraReady && !cameraError && (
                <p className="text-xs text-muted-foreground">
                  Tap Start Camera to allow permission and begin scanning.
                </p>
              )
              }

              <div className="flex items-center gap-2">
                <Switch
                  id="bypass-window"
                  checked={bypassWindow}
                  onCheckedChange={setBypassWindow}
                />
                <Label htmlFor="bypass-window" className="text-sm cursor-pointer">
                  Bypass scan window
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manual check-in + End session */}
        <div className="flex gap-2">
          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1">
                <UserPlus className="h-4 w-4 mr-1.5" />
                Manual Check-in
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Manual Check-in
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>

                <div className="max-h-[320px] overflow-y-auto space-y-2">
                  {searching && (
                    <div className="flex items-center justify-center py-6 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Searching...
                    </div>
                  )}

                  {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                    <p className="text-center py-6 text-sm text-muted-foreground">
                      No registered attendees found.
                    </p>
                  )}

                  {!searching &&
                    searchResults.map((result) => (
                      <div
                        key={result.registrationId}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        {result.userAvatar ? (
                          <img
                            src={result.userAvatar}
                            alt={result.userName}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                            {result.userName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.userName}</p>
                          <p className="text-xs text-muted-foreground truncate">{result.userEmail}</p>
                        </div>
                        {result.attended ? (
                          <Badge variant="secondary" className="shrink-0 text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Attended
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            disabled={checkinLoading === result.registrationId}
                            onClick={() => handleManualCheckin(result.registrationId)}
                          >
                            {checkinLoading === result.registrationId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              'Check in'
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            onClick={handleEndSession}
            disabled={ending}
          >
            {ending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            End Session
          </Button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* RIGHT: Live Dashboard                                             */}
      {/* ================================================================= */}
      <div className="w-full lg:w-1/2 space-y-3">
        {/* Connection status */}
        <div className="flex items-center gap-2 text-sm">
          {isOnline ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <Wifi className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="text-green-700 dark:text-green-300">Online</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <WifiOff className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              <span className="text-red-700 dark:text-red-300">Offline — scans saved locally</span>
            </>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Registered</p>
            <p className="text-xl font-bold">{totalRegistered}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Attended</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{attendedCount}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="text-xl font-bold">{attendanceRate}%</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Pending Sync</p>
            <p className={`text-xl font-bold ${scanStats.pending > 0 ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>
              {scanStats.pending}
            </p>
          </Card>
        </div>

        {eventDays > 1 && (
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-2">Day-wise attendance</p>
            <div className="space-y-1.5">
              {Array.from({ length: eventDays }, (_, index) => index + 1).map((day) => {
                const count = dayStatsMap.get(day) ?? 0;
                const label = dayLabels[day - 1] || `Day ${day}`;
                return (
                  <p
                    key={day}
                    className={cn(
                      'text-sm',
                      day === selectedDay ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                    )}
                  >
                    {label}: {count}/{totalRegistered}
                  </p>
                );
              })}
            </div>
          </Card>
        )}

        {/* Sync button (visible when pending) */}
        {scanStats.pending > 0 && isOnline && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={syncStatus === 'syncing'}
            onClick={() => syncPending()}
          >
            {syncStatus === 'syncing' ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4 mr-1.5 text-yellow-600" />
            )}
            Sync {scanStats.pending} pending scan{scanStats.pending !== 1 ? 's' : ''}
          </Button>
        )}

        {/* Recent scans feed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4" />
              Recent Scans
              <Badge variant="secondary" className="ml-auto">
                {scans.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentScans.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <QrCode className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No scans yet. Point the camera at an attendance QR code.</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                <AnimatePresence initial={false}>
                  {recentScans.map((scan) => (
                    <motion.div
                      key={scan.localId}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {scan.userName ?? (scan.result === 'error' ? 'Scan failed' : 'Unknown attendee')}
                        </p>
                        <p className="text-xs text-muted-foreground truncate" title={scan.errorMessage || undefined}>
                          {formatTime(scan.scannedAtLocal)}
                          {scan.dayNumber ? ` · Day ${scan.dayNumber}` : ''}
                          {scan.result === 'error' && scan.errorMessage ? ` · ${scan.errorMessage}` : ''}
                        </p>
                      </div>
                      {scan.synced && scan.result !== 'error' && (
                        <Badge variant="secondary" className="text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Synced
                        </Badge>
                      )}
                      {!scan.synced && (
                        <Badge variant="secondary" className="text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/40 text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                      {scan.synced && scan.result === 'error' && (
                        <Badge variant="secondary" className="text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40 text-xs">
                          <XCircle className="h-3 w-3 mr-1" />
                          Error
                        </Badge>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================= */}
      {/* End Session Summary Dialog                                        */}
      {/* ================================================================= */}
      <Dialog open={!!endSummary} onOpenChange={(open) => !open && setEndSummary(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Session Summary</DialogTitle>
          </DialogHeader>
          {endSummary && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">{/* responsive: stack on mobile */}
                <div>
                  <p className="text-2xl font-bold">{endSummary.total}</p>
                  <p className="text-xs text-muted-foreground">Total Scanned</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {endSummary.synced}
                  </p>
                  <p className="text-xs text-muted-foreground">Synced</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${endSummary.errors > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                    {endSummary.errors}
                  </p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>
              {endSummary.errors > 0 && (
                <p className="text-sm text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 rounded-md p-2">
                  Some scans could not be synced. They remain saved locally and can be retried later.
                </p>
              )}
              <Button className="w-full" onClick={confirmEndSession}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
