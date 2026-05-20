// Pure functions that compute what to emit from a QuizRoom state.
//
// The socket adapter (quizSocket.ts) still owns the actual .emit() calls,
// the 1000ms answer_count throttle, the auto-advance timer, and the auth
// gate on the /quiz namespace. This module owns the rules that have to
// hold every time we shape an emission:
//
//   - Hard Constraint #7: leaderboard broadcasts are sliced to top-10
//   - Hard Constraint #9: my_rank_update is unicast per ranked player,
//     never broadcast
//   - Questions sent to clients must never include the correctAnswer
//
// Pulling these out means each invariant is a few lines of pure code
// that can be exercised directly in a unit test, rather than a
// hand-written grep over a 900-line socket handler.

import { quizStore } from './quizStore.js';
import type { LeaderboardEntry, QuizQuestionData, QuizRoom } from './quizStore.js';

export const LEADERBOARD_BROADCAST_LIMIT = 10;

// ─── Per-message DTOs that the adapter forwards verbatim ────────────────

export interface SanitizedQuestionPayload {
  questionIndex: number;
  totalQuestions: number;
  questionText: string;
  questionType: QuizQuestionData['questionType'];
  options: QuizQuestionData['options'];
  timeLimitSeconds: number;
  points: number;
  mediaUrl: string | null;
  questionId: string;
}

export interface AnswerResultPayload {
  socketId: string;
  payload: {
    isCorrect: boolean | null;
    isPoll: boolean;
    pointsAwarded: number;
    timeMs: number;
    newScore: number;
    newStreak: number;
  };
}

export interface MyRankUpdatePayload {
  socketId: string;
  payload: {
    rank: number;
    totalPlayers: number;
    score: number;
  };
}

export interface QuestionResultsBroadcast {
  correctAnswer: unknown;
  leaderboard: LeaderboardEntry[];
  answerDistribution: Record<string, number>;
  questionIndex: number;
}

export interface QuestionResultsPlan {
  broadcast: QuestionResultsBroadcast;
  perPlayerResults: AnswerResultPayload[];
  myRankUpdates: MyRankUpdatePayload[];
}

// ─── Question sanitization ────────────────────────────────────────────────

// Strip correctAnswer so it never leaves the server during an active question.
export function sanitizeQuestionForClient(
  question: QuizQuestionData,
  questionIndex: number,
  totalQuestions: number,
): SanitizedQuestionPayload {
  return {
    questionIndex,
    totalQuestions,
    questionText: question.questionText,
    questionType: question.questionType,
    options: question.options,
    timeLimitSeconds: question.timeLimitSeconds,
    points: question.points,
    mediaUrl: question.mediaUrl,
    questionId: question.id,
  };
}

// ─── Question-results emission plan ───────────────────────────────────────

// Decide whether the current question type contributes to scoring. POLL,
// RATING, and OPEN_ENDED are surveyed but not graded — the per-player
// reveal still fires, but with isPoll=true so the client shows "Submitted"
// instead of correct/incorrect chrome.
export function isUnscoredQuestionType(type: QuizQuestionData['questionType']): boolean {
  return type === 'POLL' || type === 'RATING' || type === 'OPEN_ENDED';
}

// Compute the full plan for a question reveal:
//   - the room-broadcast payload (with the top-10 leaderboard slice)
//   - one per-player AnswerResult unicast for every player who actually answered
//   - one per-player MyRankUpdate unicast for every ranked player
//
// Returns null when there is no current question (no-op for the caller).
//
// Hard Constraints #7 and #9 are enforced here: the top-10 slice is the
// only leaderboard the broadcast ever sees, and my_rank_update entries
// each carry their own socketId so the adapter can unicast them.
export function planQuestionResults(quizId: string, room: QuizRoom): QuestionResultsPlan | null {
  const currentQ = room.questions[room.currentQuestionIndex];
  if (!currentQ || room.currentQuestionIndex < 0) return null;

  const fullLeaderboard = quizStore.getLeaderboard(quizId);
  const answerDistribution = quizStore.getAnswerDistribution(quizId);

  const broadcast: QuestionResultsBroadcast = {
    correctAnswer: currentQ.correctAnswer,
    leaderboard: fullLeaderboard.slice(0, LEADERBOARD_BROADCAST_LIMIT),
    answerDistribution,
    questionIndex: room.currentQuestionIndex,
  };

  const isUnscoredType = isUnscoredQuestionType(currentQ.questionType);

  const perPlayerResults: AnswerResultPayload[] = [];
  for (const [userId, answerRecord] of room.currentAnswers.entries()) {
    const player = room.players.get(userId);
    if (!player?.socketId || !player.connected) continue;
    perPlayerResults.push({
      socketId: player.socketId,
      payload: {
        isCorrect: answerRecord.isCorrect,
        isPoll: isUnscoredType,
        pointsAwarded: answerRecord.pointsAwarded,
        timeMs: answerRecord.timeMs,
        newScore: player.score,
        newStreak: player.streak,
      },
    });
  }

  const myRankUpdates: MyRankUpdatePayload[] = [];
  for (let i = 0; i < fullLeaderboard.length; i++) {
    const entry = fullLeaderboard[i];
    const player = room.players.get(entry.userId);
    if (!player?.socketId || !player.connected) continue;
    myRankUpdates.push({
      socketId: player.socketId,
      payload: {
        rank: i + 1,
        totalPlayers: fullLeaderboard.length,
        score: entry.score,
      },
    });
  }

  return { broadcast, perPlayerResults, myRankUpdates };
}

// Note: the final_leaderboard event at quiz end intentionally sends the
// full leaderboard (not the top-10 slice used for per-question reveals).
// Hard Constraint #7 caps the per-question leaderboard_update / question_results
// emission only — the finale podium consumes more entries client-side.
