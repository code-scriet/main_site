import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  classifyScanError,
  computeScanStats,
  generateLocalScanId,
  isValidAttendanceToken,
  normalizeScanDayNumber,
  normalizeScannedAttendanceToken,
  readScans,
  reconcileBatchResults,
  scanDedupeKey,
  writeScans,
  type LocalScanEntry,
  type ScanStats,
} from '@/lib/attendanceQueue';

// LocalScanEntry now lives in the pure queue module; re-export for consumers
// that import the type alongside the hook.
export type { LocalScanEntry } from '@/lib/attendanceQueue';

interface UseOfflineScannerOptions {
  eventId: string;
  authToken: string;
  dayNumber: number;
  bypassWindow?: boolean;
}

interface UseOfflineScannerReturn {
  addScan: (qrToken: string) => LocalScanEntry | null;
  scans: LocalScanEntry[];
  stats: ScanStats;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncPending: () => Promise<void>;
  clearScans: () => void;
}

const SYNC_INTERVAL_MS = 3_000;

// ---------------------------------------------------------------------------
// Hook — refs, React state and the 5 sync triggers. All queue logic (token
// validation, dedup, stats, batch reconciliation, error classification) lives
// in @/lib/attendanceQueue and is unit-tested there.
// ---------------------------------------------------------------------------

export function useOfflineScanner(
  options: UseOfflineScannerOptions,
): UseOfflineScannerReturn {
  const { eventId, authToken, dayNumber, bypassWindow } = options;

  // Canonical state lives in a ref so callbacks never go stale.
  // React state is a mirror used purely to trigger re-renders.
  const scansRef = useRef<LocalScanEntry[]>(readScans(eventId));
  const [scans, setScans] = useState<LocalScanEntry[]>(scansRef.current);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  // Dedup set — tracks QR tokens already scanned in this session.
  const seenTokensRef = useRef<Set<string>>(
    new Set(scansRef.current.map((s) => scanDedupeKey(s.token, s.dayNumber))),
  );

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
          dayNumber: s.dayNumber,
          scannedAtLocal: s.scannedAtLocal,
          localId: s.localId,
        })),
        eventId,
        authToken,
        bypassWindow,
      );

      scansRef.current = reconcileBatchResults(scansRef.current, response.results);

      flush();
      setSyncStatus('idle');
    } catch {
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
    }
  }, [eventId, authToken, bypassWindow, flush]);

  const syncSingleScan = useCallback(async (entry: LocalScanEntry) => {
    try {
      const res = await api.scanAttendance(entry.token, authToken, entry.dayNumber, bypassWindow);
      // Find entry in ref (it may have been batch-synced already).
      const target = scansRef.current.find((s) => s.localId === entry.localId);
      if (target && !target.synced) {
        target.synced = true;
        target.result = 'ok';
        target.userName = res.userName;
        target.errorMessage = undefined;
        flush();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const errorClass = classifyScanError(message);

      if (errorClass === 'duplicate' || errorClass === 'definitive') {
        const target = scansRef.current.find((s) => s.localId === entry.localId);
        if (target && !target.synced) {
          target.synced = true;
          target.result = errorClass === 'duplicate' ? 'duplicate' : 'error';
          target.errorMessage = message || (errorClass === 'duplicate' ? 'Already scanned' : 'Scan failed');
          flush();
        }
      }
      // Transient (network) errors are silently ignored — the scan stays
      // unsynced and will be picked up by the 3-second batch interval or
      // other triggers.
    }
  }, [authToken, bypassWindow, flush]);

  // -----------------------------------------------------------------------
  // addScan — called when a QR code is scanned
  // -----------------------------------------------------------------------

  const addScan = useCallback(
    (qrToken: string): LocalScanEntry | null => {
      const normalizedToken = normalizeScannedAttendanceToken(qrToken);
      const effectiveDayNumber = normalizeScanDayNumber(dayNumber);

      // Validate: only accept tokens that look like valid JWT attendance tokens
      if (!isValidAttendanceToken(normalizedToken)) {
        // Return a synthetic rejected entry (not stored) so caller can show error toast
        return {
          localId: 'rejected',
          token: normalizedToken,
          dayNumber: effectiveDayNumber,
          scannedAtLocal: new Date().toISOString(),
          synced: true,
          result: 'error',
          errorMessage: 'Invalid QR code — not an attendance token',
        };
      }

      // Dedup: if this token was already scanned, return existing entry.
      const dedupeKey = scanDedupeKey(normalizedToken, effectiveDayNumber);
      if (seenTokensRef.current.has(dedupeKey)) {
        const existing = scansRef.current.find((s) => s.token === normalizedToken && s.dayNumber === effectiveDayNumber);
        if (existing) {
          // Allow retrying previously failed scans in the same session.
          if (existing.result === 'error') {
            existing.scannedAtLocal = new Date().toISOString();
            existing.synced = false;
            existing.result = undefined;
            existing.userName = undefined;
            existing.errorMessage = undefined;
            flush();
            void syncSingleScan(existing);
          }

          return existing;
        }
      }

      const entry: LocalScanEntry = {
        localId: generateLocalScanId(),
        token: normalizedToken,
        dayNumber: effectiveDayNumber,
        scannedAtLocal: new Date().toISOString(),
        synced: false,
      };

      seenTokensRef.current.add(dedupeKey);
      scansRef.current = [...scansRef.current, entry];
      flush();

      // Trigger 1 — Immediate single-scan attempt.
      void syncSingleScan(entry);

      return entry;
    },
    [dayNumber, flush, syncSingleScan],
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
        bypassWindow: bypassWindow ?? false,
        scans: pending.map((s) => ({
          token: s.token,
          dayNumber: s.dayNumber,
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
  }, [eventId, bypassWindow]);

  // -----------------------------------------------------------------------
  // Return
  // -----------------------------------------------------------------------

  return {
    addScan,
    scans,
    stats: computeScanStats(scans),
    syncStatus,
    syncPending,
    clearScans,
  };
}
