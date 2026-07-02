// S6: crash-durable snapshots of live quiz rooms (flag-gated, default OFF).
//
// Problem: quizStore keeps the authoritative game state purely in memory; an
// OOM kill or Node crash mid-quiz silently zeroes every player's score (there
// was no recovery path — unlike competition's recoverActiveRounds). This module
// periodically writes each active room to a LOCAL better-sqlite3 file and, on
// boot, rebuilds recent rooms from it.
//
// Design constraints honored:
//  - ENGINE UNTOUCHED: the quiz engine (scoring, timers, throttles) is frozen
//    per CLAUDE.md. This module only OBSERVES rooms (quizStore.getRoom /
//    listRoomIds) and, on recovery, rebuilds a room through the PUBLIC store API
//    (initQuiz + direct field restore + scheduleEmptyRoomCleanup). No engine
//    method changes.
//  - PAUSED-RESTORE SEMANTICS (the trap-killer): a room that was `active` at
//    snapshot time is restored as `paused` with pausedTimeRemaining = what was
//    left on the question clock. Auto-advance setTimeout handles are not
//    serializable, and re-arming them outside the engine would duplicate timer
//    logic; restoring as paused means the HOST simply presses Resume — the
//    existing, tested resume_quiz path re-derives the clock anchor and re-arms
//    the timer. Crash recovery therefore adds ZERO new timer code.
//  - Players restore as connected=false with counters recomputed; clients'
//    infinite-reconnect + join_quiz re-emit re-attach them and join_confirmed
//    rebuilds their view (the same path a normal reconnect uses).
//  - The native dep is OPTIONAL: flag on but better-sqlite3 missing/unbuildable
//    ⇒ warn + disable, never crash (mirrors the eiows fallback).
//  - Render's free-tier disk survives an in-process crash/fast restart but NOT
//    a redeploy — this protects against crashes/OOM, not deploys (buildFilter
//    already scopes deploys away from live quizzes).
//
// Flags/env: ENABLE_QUIZ_SNAPSHOT=true turns the whole system on;
// QUIZ_SNAPSHOT_DB overrides the sqlite file path (default .data/quiz-snapshots.db).

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Server as SocketIOServer } from 'socket.io';
import { quizStore } from './quizStore.js';
import type { AnswerRecord, PlayerState, QuizQuestionData, QuizRoom } from './quizStore.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { getCachedSettings, peekCachedSettings } from '../utils/settingsCache.js';

const nodeRequire = createRequire(import.meta.url);

const SNAPSHOT_INTERVAL_MS = 10_000;
// Snapshots older than this are ignored at boot — a stale row must never
// resurrect a long-gone quiz.
const RECOVERY_MAX_AGE_MS = 30 * 60 * 1000;

// Primary switch = the admin Settings toggle (Settings.quizSnapshotEnabled),
// read via the SYNCHRONOUS in-process settings peek — the 10s tick never
// queries the DB for its own gate, and flipping the toggle takes effect on the
// next tick without a restart. ENABLE_QUIZ_SNAPSHOT stays as an emergency
// force-ON env override. Cold/unpopulated cache reads as OFF (safe default).
const SNAPSHOT_ENV = process.env.ENABLE_QUIZ_SNAPSHOT === 'true';
export const isQuizSnapshotEnabled = (): boolean =>
  SNAPSHOT_ENV || peekCachedSettings()?.quizSnapshotEnabled === true;

// ─── Pure conversion (unit-tested without sqlite) ────────────────────────────

interface QuestionAnalytics {
  totalAnswers: number;
  correctCount: number;
  totalTimeMs: number;
  distribution: Record<string, number>;
}

export interface QuizRoomSnapshot {
  quizId: string;
  meta: { title: string; totalQuestions: number; createdBy: string };
  joinCode: string | null;
  pin: string | null;
  status: 'waiting' | 'active' | 'revealing' | 'paused';
  currentQuestionIndex: number;
  currentQuestionStartTime: number;
  pausedTimeRemaining: number | null;
  questions: QuizQuestionData[];
  players: Array<[string, PlayerState]>;
  kickedUserIds: string[];
  currentAnswers: Array<[string, AnswerRecord]>;
  allAnswers: (AnswerRecord & { userId: string })[];
  questionAnalytics: Array<[string, QuestionAnalytics]>;
  adminUserId: string;
  savedAt: number;
}

/**
 * Serialize a live room. Returns null for rooms that must not be snapshotted:
 * finished rooms (their DB persistence is the source of truth) and rooms
 * mid-persist (a snapshot taken during the end-of-quiz flush could resurrect an
 * already-persisted quiz).
 */
export function roomToSnapshot(room: QuizRoom, savedAt: number): QuizRoomSnapshot | null {
  if (room.status === 'finished' || room.isPersisting || room.pendingFinalStatus) return null;
  return {
    quizId: room.quizId,
    meta: { ...room.meta },
    joinCode: room.joinCode,
    pin: room.pin,
    status: room.status,
    currentQuestionIndex: room.currentQuestionIndex,
    currentQuestionStartTime: room.currentQuestionStartTime,
    pausedTimeRemaining: room.pausedTimeRemaining,
    questions: room.questions,
    players: Array.from(room.players.entries()).map(([id, p]) => [id, { ...p }]),
    kickedUserIds: Array.from(room.kickedUserIds),
    currentAnswers: Array.from(room.currentAnswers.entries()).map(([id, a]) => [id, { ...a }]),
    allAnswers: room.allAnswers.map((a) => ({ ...a })),
    questionAnalytics: Array.from(room.questionAnalytics.entries()).map(([id, a]) => [
      id,
      { ...a, distribution: { ...a.distribution } },
    ]),
    adminUserId: room.adminUserId,
    savedAt,
  };
}

/**
 * Restore snapshot state onto a freshly-initQuiz'd room (mutates in place —
 * getRoom returns the live object, the same pattern quizSocket uses).
 *
 * Conversions applied:
 *  - `active` → `paused`, pausedTimeRemaining = clamp(remaining at snapshot):
 *    the host resumes via the existing resume_quiz path (which re-arms the
 *    auto-advance timer) — no timer state is reconstructed here.
 *  - every player: connected=false (all sockets died with the old process);
 *    socketId is left as-is — addPlayer rewrites it on rejoin, and nothing
 *    emits to disconnected players.
 *  - counters recomputed from restored player states (connected counts are 0).
 *  - answerSubmissionLocks: cleared (transient in-flight guards).
 */
export function applySnapshotToRoom(room: QuizRoom, snap: QuizRoomSnapshot): void {
  room.currentQuestionIndex = snap.currentQuestionIndex;
  room.currentQuestionStartTime = snap.currentQuestionStartTime;
  room.players = new Map(snap.players.map(([id, p]) => [id, { ...p, connected: false }]));
  room.kickedUserIds = new Set(snap.kickedUserIds);
  room.currentAnswers = new Map(snap.currentAnswers);
  room.allAnswers = snap.allAnswers.map((a) => ({ ...a }));
  room.questionAnalytics = new Map(snap.questionAnalytics);
  room.adminUserId = snap.adminUserId;
  room.adminSocketId = null;
  room.answerSubmissionLocks = new Set();

  room.connectedCount = 0;
  room.answeredConnectedCount = 0;
  let answered = 0;
  for (const p of room.players.values()) {
    if (p.answeredCurrentQuestion) answered += 1;
  }
  room.answeredCount = answered;

  if (snap.status === 'active') {
    const question = snap.questions[snap.currentQuestionIndex];
    const timeLimitMs = (question?.timeLimitSeconds ?? 0) * 1000;
    const elapsed = Math.max(0, snap.savedAt - snap.currentQuestionStartTime);
    room.status = 'paused';
    room.pausedTimeRemaining = Math.min(timeLimitMs, Math.max(0, timeLimitMs - elapsed));
  } else {
    room.status = snap.status;
    room.pausedTimeRemaining = snap.pausedTimeRemaining;
  }
}

// ─── SQLite persistence (lazy, optional) ─────────────────────────────────────

interface SnapshotDb {
  upsert: { run(quizId: string, payload: string, savedAt: number): unknown };
  deleteNotIn(activeIds: string[]): void;
  loadRecent(minSavedAt: number): Array<{ quiz_id: string; payload: string }>;
  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
}

let snapshotDb: SnapshotDb | null = null;
let snapshotDbFailed = false;

function getSnapshotDb(): SnapshotDb | null {
  if (snapshotDb || snapshotDbFailed) return snapshotDb;
  try {
    const Database = nodeRequire('better-sqlite3') as new (path: string) => {
      pragma(sql: string): unknown;
      exec(sql: string): unknown;
      prepare(sql: string): { run(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
      transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
    };
    const path = process.env.QUIZ_SNAPSHOT_DB || '.data/quiz-snapshots.db';
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.exec(
      'CREATE TABLE IF NOT EXISTS quiz_snapshots (quiz_id TEXT PRIMARY KEY, payload TEXT NOT NULL, saved_at INTEGER NOT NULL)',
    );
    const upsert = db.prepare(
      'INSERT INTO quiz_snapshots (quiz_id, payload, saved_at) VALUES (?, ?, ?) ON CONFLICT(quiz_id) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at',
    );
    const deleteAll = db.prepare('DELETE FROM quiz_snapshots');
    const loadRecentStmt = db.prepare('SELECT quiz_id, payload FROM quiz_snapshots WHERE saved_at >= ?');
    snapshotDb = {
      upsert,
      deleteNotIn(activeIds: string[]): void {
        if (activeIds.length === 0) {
          deleteAll.run();
          return;
        }
        const placeholders = activeIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM quiz_snapshots WHERE quiz_id NOT IN (${placeholders})`).run(...activeIds);
      },
      loadRecent(minSavedAt: number) {
        return loadRecentStmt.all(minSavedAt) as Array<{ quiz_id: string; payload: string }>;
      },
      transaction: (fn) => db.transaction(fn),
    };
    logger.info('Quiz snapshots: sqlite store ready', { path });
  } catch (err) {
    snapshotDbFailed = true;
    logger.warn('Quiz snapshots: better-sqlite3 unavailable — snapshots disabled', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return snapshotDb;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let snapshotTimer: ReturnType<typeof setInterval> | null = null;
const MAX_SNAPSHOT_BYTES = 2_000_000;
const oversizeWarned = new Set<string>();

function snapshotTick(): void {
  // Live gate: the interval always runs (cheap, unref'd); the DB toggle decides
  // per tick. sqlite is initialized lazily on the first ENABLED tick, so a
  // never-enabled instance never touches the filesystem.
  if (!isQuizSnapshotEnabled()) return;
  const db = getSnapshotDb();
  if (!db) return;
  try {
    const now = Date.now();
    const activeIds: string[] = [];
    const rows: Array<{ quizId: string; payload: string }> = [];
    for (const quizId of quizStore.listRoomIds()) {
      const room = quizStore.getRoom(quizId);
      if (!room) continue;
      const snap = roomToSnapshot(room, now);
      if (!snap) continue;
      const payload = JSON.stringify(snap);
      // Size guard: allAnswers grows as players×questions, and this stringify +
      // synchronous sqlite write runs on the serving event loop. A pathological
      // room (~900 players deep into a long quiz) is skipped with a warning
      // rather than allowed to stall reveals — crash durability is best-effort,
      // liveness of the running quiz is not negotiable.
      if (payload.length > MAX_SNAPSHOT_BYTES) {
        if (!oversizeWarned.has(quizId)) {
          oversizeWarned.add(quizId);
          logger.warn('Quiz snapshot skipped: room too large', { quizId, bytes: payload.length });
        }
        continue;
      }
      activeIds.push(quizId);
      rows.push({ quizId, payload });
    }
    const write = db.transaction(() => {
      for (const row of rows) db.upsert.run(row.quizId, row.payload, now);
      // Rows for rooms that no longer exist (cleanly finished/abandoned) are
      // pruned here, so cleanupQuiz never needs to know snapshots exist. The
      // ≤10s window where a finished quiz still has a row is covered by the
      // DB-status guard in recoverQuizzesFromSnapshots.
      db.deleteNotIn(activeIds);
    });
    write();
  } catch (err) {
    logger.warn('Quiz snapshot tick failed', { err: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Start the periodic snapshot writer. The interval always runs (a 10s no-op
 * costs nothing); each tick consults the Settings toggle / env override, so
 * an admin can enable or disable crash snapshots live without a restart.
 */
export function startQuizSnapshotScheduler(): void {
  if (snapshotTimer) return;
  snapshotTimer = setInterval(snapshotTick, SNAPSHOT_INTERVAL_MS);
  snapshotTimer.unref?.();
  logger.info('Quiz snapshot scheduler armed (gated per tick by Settings.quizSnapshotEnabled / ENABLE_QUIZ_SNAPSHOT)', {
    intervalMs: SNAPSHOT_INTERVAL_MS,
  });
}

export function stopQuizSnapshotScheduler(): void {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
}

// ─── Boot recovery ───────────────────────────────────────────────────────────

/**
 * Rebuild recent rooms from snapshots after a crash. Guards, in order:
 *  - flag + sqlite availability (silent no-op otherwise)
 *  - snapshot freshness (≤30 min — stale rows are ignored and pruned next tick)
 *  - the quiz row must still be WAITING/ACTIVE in Postgres (a cleanly-ended
 *    quiz is FINISHED/ABANDONED there, so the ≤10s prune window can't resurrect
 *    it; a deleted quiz is skipped too)
 *  - the room must not already exist in memory (normal DB re-hydration via
 *    join_quiz may have won the race — it is authoritative)
 * Each recovered room gets the store's own empty-room timer so an unclaimed
 * recovery self-persists as ABANDONED after 10 minutes instead of squatting on
 * a MAX_ACTIVE_ROOMS slot forever.
 */
export async function recoverQuizzesFromSnapshots(io: SocketIOServer): Promise<void> {
  // Boot-time: the sync peek is cold until the first settings read, so populate
  // the cache before consulting the toggle (best-effort — a failed read leaves
  // the peek null ⇒ env override still works, DB toggle reads as off).
  await getCachedSettings().catch(() => null);
  if (!isQuizSnapshotEnabled()) return;
  const db = getSnapshotDb();
  if (!db) return;
  try {
    const rows = db.loadRecent(Date.now() - RECOVERY_MAX_AGE_MS);
    if (rows.length === 0) return;

    const quizzes = await prisma.quiz.findMany({
      where: { id: { in: rows.map((r) => r.quiz_id) }, status: { in: ['WAITING', 'ACTIVE'] } },
      select: { id: true },
    });
    const recoverable = new Set(quizzes.map((q) => q.id));

    let recovered = 0;
    for (const row of rows) {
      if (!recoverable.has(row.quiz_id)) continue;
      if (quizStore.getRoom(row.quiz_id)) continue;
      try {
        const snap = JSON.parse(row.payload) as QuizRoomSnapshot;
        const room = quizStore.initQuiz(
          snap.quizId,
          snap.questions,
          snap.adminUserId,
          '',
          snap.meta.title,
          snap.joinCode,
          snap.pin,
        );
        applySnapshotToRoom(room, snap);
        quizStore.scheduleEmptyRoomCleanup(snap.quizId, io);
        recovered += 1;
        logger.info('Quiz recovered from crash snapshot', {
          quizId: snap.quizId,
          status: room.status,
          players: room.players.size,
          pausedTimeRemaining: room.pausedTimeRemaining,
        });
      } catch (err) {
        logger.warn('Quiz snapshot recovery failed for one room', {
          quizId: row.quiz_id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (recovered > 0) {
      logger.info(`Quiz snapshot recovery complete: ${recovered} room(s) restored (paused, awaiting host resume)`);
    }
  } catch (err) {
    logger.warn('Quiz snapshot recovery failed', { err: err instanceof Error ? err.message : String(err) });
  }
}
