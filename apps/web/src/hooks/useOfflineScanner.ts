import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalScanEntry {
  localId: string;
  token: string;
  scannedAtLocal: string;
  synced: boolean;
  result?: 'ok' | 'duplicate' | 'error';
  userName?: string;
  errorMessage?: string;
}

interface UseOfflineScannerOptions {
  eventId: string;
  authToken: string;
  bypassWindow?: boolean;
}

interface ScanStats {
  total: number;
  synced: number;
  pending: number;
  ok: number;
  duplicate: number;
  error: number;
}

interface UseOfflineScannerReturn {
  addScan: (qrToken: string) => LocalScanEntry | null;
  scans: LocalScanEntry[];
  stats: ScanStats;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncPending: () => Promise<void>;
  clearScans: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYNC_INTERVAL_MS = 3_000;

function storageKey(eventId: string): string {
  return `attendance_scans:${eventId}`;
}

function generateLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Validates if a string looks like a valid attendance JWT token.
 * Attendance tokens are JWTs with 3 base64url segments separated by dots.
 * This is a lightweight frontend check — full validation happens on the backend.
 */
function isValidAttendanceToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  
  // JWT format: header.payload.signature (3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  // Each part should be non-empty and look like base64url
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  for (const part of parts) {
    if (!part || !base64urlPattern.test(part)) return false;
  }
  
  // Minimum reasonable length for a JWT (header + payload + signature)
  if (token.length < 50) return false;
  
  return true;
}

function readScans(eventId: string): LocalScanEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    if (!raw) return [];
    return JSON.parse(raw) as LocalScanEntry[];
  } catch {
    return [];
  }
}

function writeScans(eventId: string, scans: LocalScanEntry[]): void {
  try {
    localStorage.setItem(storageKey(eventId), JSON.stringify(scans));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function computeStats(scans: LocalScanEntry[]): ScanStats {
  let synced = 0;
  let pending = 0;
  let ok = 0;
  let duplicate = 0;
  let error = 0;

  for (const s of scans) {
    if (s.synced) {
      synced++;
      if (s.result === 'ok') ok++;
      else if (s.result === 'duplicate') duplicate++;
      else if (s.result === 'error') error++;
    } else {
      pending++;
    }
  }

  return { total: scans.length, synced, pending, ok, duplicate, error };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOfflineScanner(
  options: UseOfflineScannerOptions,
): UseOfflineScannerReturn {
  const { eventId, authToken, bypassWindow } = options;

  // Canonical state lives in a ref so callbacks never go stale.
  // React state is a mirror used purely to trigger re-renders.
  const scansRef = useRef<LocalScanEntry[]>(readScans(eventId));
  const [scans, setScans] = useState<LocalScanEntry[]>(scansRef.current);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  // Dedup set — tracks QR tokens already scanned in this session.
  const seenTokensRef = useRef<Set<string>>(new Set(scansRef.current.map((s) => s.token)));

  // Guard against concurrent syncs.
  const syncingRef = useRef(false);

  // Keep interval id so we can clear on unmount.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Flush helpers (ref -> localStorage + React state)
  // -----------------------------------------------------------------------

  const flush = useCallback(() => {
    writeScans(eventId, scansRef.current);
    setScans([...scansRef.current]);
  }, [eventId]);

  // -----------------------------------------------------------------------
  // syncPending — batch-sync all unsynced entries
  // -----------------------------------------------------------------------

  const syncPending = useCallback(async () => {
    const pending = scansRef.current.filter((s) => !s.synced);
    if (pending.length === 0 || syncingRef.current) return;

    syncingRef.current = true;
    setSyncStatus('syncing');

    try {
      const response = await api.scanAttendanceBatch(
        pending.map((s) => ({
          token: s.token,
          scannedAtLocal: s.scannedAtLocal,
          localId: s.localId,
        })),
        eventId,
        authToken,
        bypassWindow,
      );

      // Build a lookup for results by localId.
      const resultMap = new Map<string, (typeof response.results)[number]>();
      for (const r of response.results) {
        resultMap.set(r.localId, r);
      }

      // Merge results into scansRef.
      for (const scan of scansRef.current) {
        const r = resultMap.get(scan.localId);
        if (r) {
          scan.synced = true;
          scan.result = r.status;
          scan.userName = r.name;
          scan.errorMessage = r.message;
        }
      }

      flush();
      setSyncStatus('idle');
    } catch {
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
    }
  }, [eventId, authToken, bypassWindow, flush]);

  // -----------------------------------------------------------------------
  // addScan — called when a QR code is scanned
  // -----------------------------------------------------------------------

  const addScan = useCallback(
    (qrToken: string): LocalScanEntry | null => {
      // Validate: only accept tokens that look like valid JWT attendance tokens
      if (!isValidAttendanceToken(qrToken)) {
        // Return a synthetic rejected entry (not stored) so caller can show error toast
        return {
          localId: 'rejected',
          token: qrToken,
          scannedAtLocal: new Date().toISOString(),
          synced: true,
          result: 'error',
          errorMessage: 'Invalid QR code — not an attendance token',
        };
      }

      // Dedup: if this token was already scanned, return existing entry.
      if (seenTokensRef.current.has(qrToken)) {
        const existing = scansRef.current.find((s) => s.token === qrToken);
        if (existing) return existing;
      }

      const entry: LocalScanEntry = {
        localId: generateLocalId(),
        token: qrToken,
        scannedAtLocal: new Date().toISOString(),
        synced: false,
      };

      seenTokensRef.current.add(qrToken);
      scansRef.current = [...scansRef.current, entry];
      flush();

      // Trigger 1 — Immediate single-scan attempt.
      (async () => {
        try {
          const res = await api.scanAttendance(qrToken, authToken, bypassWindow);
          // Find entry in ref (it may have been batch-synced already).
          const target = scansRef.current.find((s) => s.localId === entry.localId);
          if (target && !target.synced) {
            target.synced = true;
            target.result = 'ok';
            target.userName = res.userName;
            flush();
          }
        } catch (err: unknown) {
          // Check if the error indicates a duplicate rather than a network failure.
          const message =
            err instanceof Error ? err.message : typeof err === 'string' ? err : '';
          const isDuplicate =
            message.toLowerCase().includes('duplicate') ||
            message.toLowerCase().includes('already marked');

          const lower = message.toLowerCase();
          const isDefinitiveError =
            lower.includes('forbidden') ||
            lower.includes('outside the allowed window') ||
            lower.includes('unauthorized') ||
            lower.includes('invalid') ||
            lower.includes('not found') ||
            lower.includes('required') ||
            lower.includes('conflict');

          if (isDuplicate) {
            const target = scansRef.current.find((s) => s.localId === entry.localId);
            if (target && !target.synced) {
              target.synced = true;
              target.result = 'duplicate';
              target.errorMessage = message;
              flush();
            }
          } else if (isDefinitiveError) {
            const target = scansRef.current.find((s) => s.localId === entry.localId);
            if (target && !target.synced) {
              target.synced = true;
              target.result = 'error';
              target.errorMessage = message || 'Scan failed';
              flush();
            }
          }
          // Network errors are silently ignored — the scan stays unsynced and
          // will be picked up by the 3-second batch interval or other triggers.
        }
      })();

      return entry;
    },
    [authToken, bypassWindow, flush],
  );

  // -----------------------------------------------------------------------
  // clearScans
  // -----------------------------------------------------------------------

  const clearScans = useCallback(() => {
    scansRef.current = [];
    seenTokensRef.current.clear();
    writeScans(eventId, []);
    setScans([]);
  }, [eventId]);

  // -----------------------------------------------------------------------
  // Trigger 2 — 3-second batch interval
  // -----------------------------------------------------------------------

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const hasPending = scansRef.current.some((s) => !s.synced);
      if (hasPending) {
        syncPending();
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [syncPending]);

  // -----------------------------------------------------------------------
  // Trigger 3 — Mount sync (runs once per mount)
  // -----------------------------------------------------------------------

  useEffect(() => {
    const hasPending = scansRef.current.some((s) => !s.synced);
    if (hasPending) {
      syncPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Trigger 4 — Visibility change
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const hasPending = scansRef.current.some((s) => !s.synced);
        if (hasPending) {
          syncPending();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncPending]);

  // -----------------------------------------------------------------------
  // Trigger 5 — Beacon on unload
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleBeforeUnload = () => {
      const pending = scansRef.current.filter((s) => !s.synced);
      if (pending.length === 0) return;

      const baseUrl =
        import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const beaconUrl = `${baseUrl}/attendance/scan-beacon`;

      const payload = JSON.stringify({
        eventId,
        authToken,
        bypassWindow: bypassWindow ?? false,
        scans: pending.map((s) => ({
          token: s.token,
          scannedAtLocal: s.scannedAtLocal,
          localId: s.localId,
        })),
      });

      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(beaconUrl, blob);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [eventId, authToken, bypassWindow]);

  // -----------------------------------------------------------------------
  // Return
  // -----------------------------------------------------------------------

  return {
    addScan,
    scans,
    stats: computeStats(scans),
    syncStatus,
    syncPending,
    clearScans,
  };
}
