/**
 * useQuizSocket — manages quiz socket connection lifecycle and event binding.
 * Bridges socket events to Zustand store. Nothing else should talk to socket.io directly.
 */

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQuizStore } from '@/lib/quizStore';
import { getApiBaseUrl } from '@/lib/utils';
import { shouldTreatQuizErrorAsFatal } from '@/lib/quizErrors';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

function getSocketUrl() {
  let url = getApiBaseUrl();
  url = url.replace(/\/api\/?$/, '');
  return url;
}

export function useQuizSocket() {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const joinPendingRef = useRef(false);

  const markJoinPending = useCallback((isPending: boolean) => {
    joinPendingRef.current = isPending;
  }, []);

  useEffect(() => {
    if (!token) {
      markJoinPending(false);
      useQuizStore.getState().setSocketStatus('disconnected');
      return;
    }

    const socket = io(`${getSocketUrl()}/quiz`, {
      autoConnect: false,
      withCredentials: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket'],
    });

    socketRef.current = socket;

    // Status tracking
    socket.on('connect', () => useQuizStore.getState().setSocketStatus('connected'));
    socket.on('disconnect', () => useQuizStore.getState().setSocketStatus('disconnected'));
    socket.on('connect_error', () => useQuizStore.getState().setSocketStatus('disconnected'));

    // Reconnect handling
    socket.io.on('reconnect', () => {
      const { quizId, quizAccessToken } = useQuizStore.getState();
      if (quizId && quizAccessToken) {
        markJoinPending(true);
        socket.emit('join_quiz', { quizId, quizAccessToken });
      }
    });

    // Quiz events → Zustand
    socket.on('join_confirmed', (data) => {
      markJoinPending(false);
      useQuizStore.getState().joinedQuiz(data);
    });
    socket.on('quiz_started', (data) => useQuizStore.getState().quizStarted(data));
    socket.on('player_joined', (data) => useQuizStore.getState().playerJoined(data));
    socket.on('player_disconnected', (data) => useQuizStore.getState().playerLeft(data));
    socket.on('player_left', (data) => useQuizStore.getState().playerLeft(data));
    socket.on('show_question', (data) => useQuizStore.getState().showQuestion(data));
    socket.on('answer_received', (data) => useQuizStore.getState().answerReceived(data));
    socket.on('answer_result', (data) => useQuizStore.getState().answerResultReceived(data));
    socket.on('answer_count_update', (data) => useQuizStore.getState().answerCountUpdate(data));
    socket.on('all_answered', () => useQuizStore.getState().allAnsweredReceived());
    socket.on('poll_results_update', (data) => useQuizStore.getState().pollResultsUpdate(data));
    socket.on('question_results', (data) => useQuizStore.getState().questionResultsReceived(data));
    socket.on('quiz_finishing', () => { /* signal that final leaderboard is coming */ });
    socket.on('final_leaderboard', (data) => useQuizStore.getState().finalLeaderboardReceived(data));
    socket.on('admin_disconnected', () => { /* Could show notice */ });

    // Admin control events
    socket.on('quiz_paused', (data) => useQuizStore.getState().quizPaused(data));
    socket.on('quiz_resumed', (data) => useQuizStore.getState().quizResumed(data));
    socket.on('timer_extended', (data) => useQuizStore.getState().timerExtended(data));
    socket.on('player_kicked', () => useQuizStore.getState().playerKicked());
    socket.on('my_rank_update', (data) => useQuizStore.getState().myRankUpdated(data));
    socket.on('control_action_blocked', (data: { code?: string; message?: string }) => {
      toast.warning(data.message ?? 'This quiz action is currently unavailable.');
    });
    socket.on('player_status_update', (statuses: Array<{ userId: string; answered: boolean; connected: boolean }>) => {
      useQuizStore.getState().playerStatusUpdated(statuses);
    });

    socket.on('quiz_error', (err: { code?: string; message?: string } | string) => {
      const message = typeof err === 'string' ? err : (err.message ?? 'A quiz error occurred.');
      const normalizedCode =
        typeof err === 'string'
          ? (/ended/i.test(err) ? 'QUIZ_ENDED' : 'QUIZ_ERROR')
          : (err.code ?? (/ended/i.test(message) ? 'QUIZ_ENDED' : 'QUIZ_ERROR'));
      const quizState = useQuizStore.getState();
      if (shouldTreatQuizErrorAsFatal(normalizedCode, quizState.quizStatus, {
        awaitingJoinConfirmation: joinPendingRef.current,
      })) {
        markJoinPending(false);
        quizState.setQuizError({
          code: normalizedCode,
          message,
        });
        return;
      }

      toast.error(message);
    });

    socket.connect();
    useQuizStore.getState().setSocketStatus('connecting');

    return () => {
      markJoinPending(false);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [markJoinPending, token]);

  // Stable action functions
  const joinQuiz = useCallback((quizId: string, quizAccessToken: string) => {
    useQuizStore.getState().setQuizId(quizId);
    useQuizStore.getState().setQuizAccessToken(quizAccessToken);
    useQuizStore.getState().setJoining();
    markJoinPending(true);
    socketRef.current?.emit('join_quiz', { quizId, quizAccessToken });
  }, [markJoinPending]);

  // Join as host (observer only, doesn't participate in quiz)
  const joinAsHost = useCallback((quizId: string, quizAccessToken: string) => {
    useQuizStore.getState().setQuizId(quizId);
    useQuizStore.getState().setQuizAccessToken(quizAccessToken);
    useQuizStore.getState().setJoining();
    markJoinPending(true);
    socketRef.current?.emit('join_quiz', { quizId, quizAccessToken });
  }, [markJoinPending]);

  const submitAnswer = useCallback((quizId: string, answer: string, questionId: string) => {
    socketRef.current?.emit('submit_answer', { quizId, answer, questionId });
  }, []);

  const nextQuestion = useCallback((quizId: string) => {
    socketRef.current?.emit('next_question', { quizId });
  }, []);

  const startQuiz = useCallback((quizId: string) => {
    socketRef.current?.emit('start_quiz', { quizId });
  }, []);

  const endQuiz = useCallback((quizId: string) => {
    socketRef.current?.emit('end_quiz', { quizId });
  }, []);

  // Admin controls
  const kickPlayer = useCallback((quizId: string, userId: string) => {
    socketRef.current?.emit('kick_player', { quizId, userId });
  }, []);

  const pauseQuiz = useCallback((quizId: string) => {
    socketRef.current?.emit('pause_quiz', { quizId });
  }, []);

  const resumeQuiz = useCallback((quizId: string) => {
    socketRef.current?.emit('resume_quiz', { quizId });
  }, []);

  const extendTime = useCallback((quizId: string, extraSeconds: number = 15) => {
    socketRef.current?.emit('extend_time', { quizId, extraSeconds });
  }, []);

  const skipQuestion = useCallback((quizId: string) => {
    socketRef.current?.emit('skip_question', { quizId });
  }, []);

  return {
    joinQuiz,
    joinAsHost,
    submitAnswer,
    nextQuestion,
    startQuiz,
    endQuiz,
    kickPlayer,
    pauseQuiz,
    resumeQuiz,
    extendTime,
    skipQuestion,
    socketRef,
  };
}
