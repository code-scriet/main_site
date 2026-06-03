import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyScanError,
  computeScanStats,
  isValidAttendanceToken,
  normalizeScanDayNumber,
  normalizeScannedAttendanceToken,
  reconcileBatchResults,
  scanDedupeKey,
  type LocalScanEntry,
} from '../src/lib/attendanceQueue.ts';

// A JWT-shaped string: three base64url segments, comfortably over the 50-char
// minimum the validator enforces.
const VALID_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhYmMiLCJldmVudElkIjoiZGVmIn0.c2lnbmF0dXJlX3NlZ21lbnRfaGVyZQ';

test('isValidAttendanceToken accepts a JWT-shaped token', () => {
  assert.equal(isValidAttendanceToken(VALID_TOKEN), true);
});

test('isValidAttendanceToken rejects wrong segment counts, short and non-string input', () => {
  assert.equal(isValidAttendanceToken('only.two'), false);
  assert.equal(isValidAttendanceToken('a.b.c'), false); // too short
  assert.equal(isValidAttendanceToken('has spaces.in.it-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
  assert.equal(isValidAttendanceToken(''), false);
  // @ts-expect-error — guard must tolerate non-string input at runtime
  assert.equal(isValidAttendanceToken(null), false);
});

test('normalizeScannedAttendanceToken returns a raw valid token unchanged', () => {
  assert.equal(normalizeScannedAttendanceToken(`  ${VALID_TOKEN}  `), VALID_TOKEN);
});

test('normalizeScannedAttendanceToken extracts the token from a ?token= URL', () => {
  assert.equal(
    normalizeScannedAttendanceToken(`https://codescriet.dev/scan?token=${VALID_TOKEN}`),
    VALID_TOKEN,
  );
});

test('normalizeScannedAttendanceToken extracts the token from a #hash fragment', () => {
  assert.equal(
    normalizeScannedAttendanceToken(`https://codescriet.dev/scan#attendanceToken=${VALID_TOKEN}`),
    VALID_TOKEN,
  );
});

test('normalizeScannedAttendanceToken extracts the token from the URL path tail', () => {
  assert.equal(
    normalizeScannedAttendanceToken(`https://codescriet.dev/verify/${VALID_TOKEN}`),
    VALID_TOKEN,
  );
});

test('normalizeScannedAttendanceToken returns trimmed garbage when nothing matches', () => {
  assert.equal(normalizeScannedAttendanceToken('  not-a-token  '), 'not-a-token');
});

test('normalizeScanDayNumber clamps to a positive integer, defaulting to 1', () => {
  assert.equal(normalizeScanDayNumber(0), 1);
  assert.equal(normalizeScanDayNumber(-5), 1);
  assert.equal(normalizeScanDayNumber(2.7), 2);
  assert.equal(normalizeScanDayNumber(undefined), 1);
  assert.equal(normalizeScanDayNumber(null), 1);
  assert.equal(normalizeScanDayNumber(3), 3);
});

test('scanDedupeKey pairs token and day', () => {
  assert.equal(scanDedupeKey('tok', 2), 'tok::2');
});

test('computeScanStats tallies synced/pending and per-result counts', () => {
  const scans: LocalScanEntry[] = [
    { localId: '1', token: 't1', dayNumber: 1, scannedAtLocal: '', synced: true, result: 'ok' },
    { localId: '2', token: 't2', dayNumber: 1, scannedAtLocal: '', synced: true, result: 'duplicate' },
    { localId: '3', token: 't3', dayNumber: 1, scannedAtLocal: '', synced: true, result: 'error' },
    { localId: '4', token: 't4', dayNumber: 1, scannedAtLocal: '', synced: false },
  ];
  assert.deepEqual(computeScanStats(scans), {
    total: 4,
    synced: 3,
    pending: 1,
    ok: 1,
    duplicate: 1,
    error: 1,
  });
});

test('reconcileBatchResults settles matched scans and leaves the rest, without mutating input', () => {
  const scans: LocalScanEntry[] = [
    { localId: 'a', token: 'ta', dayNumber: 1, scannedAtLocal: '', synced: false },
    { localId: 'b', token: 'tb', dayNumber: 1, scannedAtLocal: '', synced: false },
  ];
  const merged = reconcileBatchResults(scans, [
    { localId: 'a', status: 'ok', name: 'Asha' },
    // Conflicting duplicate for the same localId — must be ignored (first wins),
    // not allowed to overwrite the earlier 'ok' result.
    { localId: 'a', status: 'error', message: 'should be ignored' },
    // 'b' has no result — must remain pending
    { localId: 'ghost', status: 'error', message: 'no such scan' },
  ]);

  const a = merged.find((s) => s.localId === 'a');
  const b = merged.find((s) => s.localId === 'b');
  assert.equal(a?.synced, true);
  assert.equal(a?.result, 'ok', 'first result for a localId wins over later duplicates');
  assert.equal(a?.userName, 'Asha');
  assert.equal(a?.errorMessage, undefined, 'must not pick up the ignored duplicate message');
  assert.equal(b?.synced, false);

  // input untouched (pure)
  assert.equal(scans[0].synced, false);
  assert.equal(scans[0].userName, undefined);
});

test('classifyScanError treats duplicate keywords as duplicate (winning over definitive)', () => {
  assert.equal(classifyScanError('Already marked present for day 1'), 'duplicate');
  assert.equal(classifyScanError('Duplicate scan'), 'duplicate');
  // "invalid" would be definitive, but "already scanned" wins
  assert.equal(classifyScanError('Token already scanned (invalid retry)'), 'duplicate');
});

test('classifyScanError treats permanent failures as definitive', () => {
  assert.equal(classifyScanError('Forbidden: outside the allowed window'), 'definitive');
  assert.equal(classifyScanError('Unauthorized'), 'definitive');
  assert.equal(classifyScanError('Registration not found'), 'definitive');
});

test('classifyScanError treats network-ish messages as transient', () => {
  assert.equal(classifyScanError('Failed to fetch'), 'transient');
  assert.equal(classifyScanError(''), 'transient');
});
