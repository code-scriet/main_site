// Offline attendance scan-queue — the pure core extracted from
// useOfflineScanner. Everything here is framework-free: token validation /
// normalization, the localStorage seam, dedup keys, stat aggregation, batch
// reconciliation and scan-error classification. The hook is now a thin React
// wrapper (refs + effects + the 5 sync triggers) around these functions, and
// this file is the test surface for the logic that actually has bugs.

export type ScanResultStatus = 'ok' | 'duplicate' | 'error';

export interface LocalScanEntry {
  localId: string;
  token: string;
  dayNumber: number;
  scannedAtLocal: string;
  synced: boolean;
  result?: ScanResultStatus;
  userName?: string;
  errorMessage?: string;
}

export interface ScanStats {
  total: number;
  synced: number;
  pending: number;
  ok: number;
  duplicate: number;
  error: number;
}

export interface ScanBatchResult {
  localId: string;
  status: ScanResultStatus;
  name?: string;
  message?: string;
}

// How a failed single-scan attempt should be treated:
//   - duplicate   → the attendee was already marked (settle as 'duplicate')
//   - definitive  → a permanent failure (forbidden / invalid / …); settle as 'error'
//   - transient   → likely a network blip; leave unsynced for a later retry
export type ScanErrorClass = 'duplicate' | 'definitive' | 'transient';

export function attendanceScansStorageKey(eventId: string): string {
  return `attendance_scans:${eventId}`;
}

export function generateLocalScanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Normalize a requested day number to a positive integer (defaults to 1).
export function normalizeScanDayNumber(dayNumber: number | null | undefined): number {
  return Math.max(1, Math.floor(dayNumber || 1));
}

// Per-session dedup key for a (token, day) pair.
export function scanDedupeKey(token: string, dayNumber: number): string {
  return `${token}::${dayNumber}`;
}

/**
 * Validates if a value looks like a valid attendance JWT token.
 * Attendance tokens are JWTs with 3 base64url segments separated by dots.
 * This is a lightweight frontend check — full validation happens on the backend.
 *
 * Accepts `unknown` on purpose: scanned QR payloads arrive untyped, so the
 * runtime guard against non-string input is part of the intended API.
 */
export function isValidAttendanceToken(token: unknown): token is string {
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

export function normalizeScannedAttendanceToken(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  if (isValidAttendanceToken(trimmed)) {
    return trimmed;
  }

  // Some scanners return URLs (query/hash/path) instead of the raw JWT.
  try {
    const parsedUrl = new URL(trimmed);
    const candidates: string[] = [
      parsedUrl.searchParams.get('token') || '',
      parsedUrl.searchParams.get('attendanceToken') || '',
    ];

    if (parsedUrl.hash) {
      const hashValue = parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash;
      const hashParams = new URLSearchParams(hashValue);
      candidates.push(hashParams.get('token') || '');
      candidates.push(hashParams.get('attendanceToken') || '');
    }

    const pathLastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop() || '';
    candidates.push(pathLastSegment);

    for (const candidate of candidates) {
      const normalizedCandidate = candidate.trim();
      if (isValidAttendanceToken(normalizedCandidate)) {
        return normalizedCandidate;
      }
    }
  } catch {
    // Not a URL — keep using raw scanned text.
  }

  return trimmed;
}

export function readScans(eventId: string): LocalScanEntry[] {
  try {
    const raw = localStorage.getItem(attendanceScansStorageKey(eventId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<LocalScanEntry & { dayNumber?: number }>;
    return parsed.map((entry) => ({
      ...entry,
      dayNumber: Number.isInteger(entry.dayNumber) && (entry.dayNumber as number) > 0
        ? (entry.dayNumber as number)
        : 1,
    }));
  } catch {
    return [];
  }
}

export function writeScans(eventId: string, scans: LocalScanEntry[]): void {
  try {
    localStorage.setItem(attendanceScansStorageKey(eventId), JSON.stringify(scans));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function computeScanStats(scans: LocalScanEntry[]): ScanStats {
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

// Merge a batch-sync response back onto the queue: every scan whose localId
// appears in the results is settled (synced + result + name/message); the
// rest are returned untouched. Pure — returns a new array, never mutates the
// input, so it can be reasoned about and tested in isolation.
export function reconcileBatchResults(
  scans: LocalScanEntry[],
  results: ScanBatchResult[],
): LocalScanEntry[] {
  // Keep the first result for each localId and ignore later duplicates, so a
  // backend that ever returns conflicting entries for the same localId settles
  // deterministically (first-wins) rather than depending on iteration order.
  const resultMap = new Map<string, ScanBatchResult>();
  for (const r of results) {
    if (!resultMap.has(r.localId)) {
      resultMap.set(r.localId, r);
    }
  }

  return scans.map((scan) => {
    const r = resultMap.get(scan.localId);
    if (!r) return scan;
    return {
      ...scan,
      synced: true,
      result: r.status,
      userName: r.name,
      errorMessage: r.message,
    };
  });
}

// Classify a single-scan failure message. Duplicate wins over definitive when
// both keyword sets match, matching the original inline precedence.
export function classifyScanError(message: string): ScanErrorClass {
  const lower = message.toLowerCase();

  const isDuplicate =
    lower.includes('duplicate') ||
    lower.includes('already marked') ||
    lower.includes('already scanned');
  if (isDuplicate) return 'duplicate';

  const isDefinitive =
    lower.includes('forbidden') ||
    lower.includes('outside the allowed window') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid') ||
    lower.includes('not found') ||
    lower.includes('required') ||
    lower.includes('conflict');
  if (isDefinitive) return 'definitive';

  return 'transient';
}
