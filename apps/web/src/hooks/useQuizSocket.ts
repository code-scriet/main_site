/**
 * useQuizSocket — manages quiz socket connection lifecycle and event binding.
 * Bridges socket events to Zustand store. Nothing else should talk to socket.io directly.
 */

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQuizStore } from '@/lib/quizStore';

function getSocketUrl() {
  let url = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  url = url.replace(/\/api\/?$/, '');
  return url;
}

function getAuthToken(): string | null {
  return localStorage.getItem('token');
}

export function useQuizSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useQuizStore;

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    const socket = io(`${getSocketUrl()}/quiz`, {
      autoConnect: false,
      withCredentials: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    // Status tracking
    socket.on('connect', () => store.getState().setSocketStatus('connected'));
    socket.on('disconnect', () => store.getState().setSocketStatus('disconnected'));
    socket.on('connect_error', () => store.getState().setSocketStatus('disconnected'));

    // Reconnect handling
    socket.io.on('reconnect', () => {
      const { quizId, quizAccessToken } = store.getState();
      if (quizId && quizAccessToken) {
        socket.emit('join_quiz', { quizId, quizAccessToken });
      }
    });

    // Quiz events → Zustand
    socket.on('join_confirmed', (data) => store.getState().joinedQuiz(data));
    socket.on('quiz_started', (data) => store.getState().quizStarted(data));
    socket.on('player_joined', (data) => store.getState().playerJoined(data));
    socket.on('player_disconnected', (data) => store.getState().playerLeft(data));
    socket.on('player_left', (data) => store.getState().playerLeft(data));
    socket.on('show_question', (data) => store.getState().showQuestion(data));
    socket.on('answer_received', (data) => store.getState().answerReceived(data));
    socket.on('answer_count_update', (data) => store.getState().answerCountUpdate(data));
    socket.on('all_answered', () => store.getState().allAnsweredReceived());
    socket.on('poll_results_update', (data) => store.getState().pollResultsUpdate(data));
    socket.on('question_results', (data) => store.getState().questionResultsReceived(data));
    socket.on('quiz_finishing', () => { /* signal that final leaderboard is coming */ });
    socket.on('final_leaderboard', (data) => store.getState().finalLeaderboardReceived(data));
    socket.on('admin_disconnected', () => { /* Could show notice */ });

    // Admin control events
    socket.on('quiz_paused', () => store.getState().quizPaused());
    socket.on('quiz_resumed', (data) => store.getState().quizResumed(data));
    socket.on('timer_extended', (data) => store.getState().timerExtended(data));
    socket.on('player_kicked', () => store.getState().playerKicked());
    socket.on('control_action_blocked', (data) => {
      console.warn('[QuizControlBlocked]', data);
    });

    socket.on('quiz_error', (err) => {
      console.warn('[QuizSocket]', err);
      store.getState().setQuizError(err);
    });

    socket.connect();
    store.getState().setSocketStatus('connecting');

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [store]);

  // Stable action functions
  const joinQuiz = useCallback((quizId: string, quizAccessToken: string) => {
    store.getState().setQuizId(quizId);
    store.getState().setQuizAccessToken(quizAccessToken);
    store.getState().setJoining();
    socketRef.current?.emit('join_quiz', { quizId, quizAccessToken });
  }, []);

  // Join as host (observer only, doesn't participate in quiz)
  const joinAsHost = useCallback((quizId: string, quizAccessToken: string) => {
    store.getState().setQuizId(quizId);
    store.getState().setQuizAccessToken(quizAccessToken);
    store.getState().setJoining();
    socketRef.current?.emit('join_quiz', { quizId, quizAccessToken });
  }, []);

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
