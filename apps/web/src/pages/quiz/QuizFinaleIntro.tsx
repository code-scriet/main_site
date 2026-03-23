/**
 * QuizFinaleIntro — Full-screen 2-second splash shown before final leaderboard.
 * Features CSS confetti burst, scale animation, and quiz title.
 */

import { memo, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const CONFETTI_COLORS = ['#FFD700', '#f59e0b', '#fb923c', '#a855f7', '#3b82f6', '#ef4444', '#10b981', '#ec4899'];

interface QuizFinaleIntroProps {
  title: string;
  totalQuestions: number;
  onDismiss?: () => void;
}

export const QuizFinaleIntro = memo(function QuizFinaleIntro({ title, totalQuestions, onDismiss }: QuizFinaleIntroProps) {
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!onDismiss) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-amber-900 via-orange-900 to-amber-950"
      role="status"
      aria-live="polite"
      onClick={onDismiss}
    >
      {/* Confetti layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes finale-confetti {
            0% { transform: translateY(-20vh) rotate(0deg) scale(1); opacity: 1; }
            100% { transform: translateY(110vh) rotate(1080deg) scale(0.5); opacity: 0; }
          }
        ` }} />
        {!shouldReduceMotion && Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-sm"
            style={{
              width: `${8 + (i % 5) * 3}px`,
              height: `${8 + (i % 4) * 3}px`,
              left: `${(i * 3.3) % 100}%`,
              top: '-5vh',
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animation: `finale-confetti ${2 + (i % 6) * 0.5}s ease-in ${(i % 10) * 0.12}s forwards`,
              opacity: 0.85,
            }}
          />
        ))}
      </div>

      {/* Center content */}
      <div className="relative z-10 px-6 text-center" onClick={(event) => event.stopPropagation()}>
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={shouldReduceMotion ? { duration: 0.2 } : { duration: 0.6, type: 'spring', stiffness: 150, damping: 12 }}
        >
          <p className="text-6xl sm:text-7xl mb-4">🏆</p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight font-display mb-3">
            Quiz Complete!
          </h1>
          <motion.p
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0.2 } : { delay: 0.4, duration: 0.4 }}
            className="text-lg sm:text-xl text-amber-200 font-medium max-w-md mx-auto"
          >
            {title}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={shouldReduceMotion ? { duration: 0.2 } : { delay: 0.7 }}
            className="text-sm text-amber-300/60 mt-2 tabular-nums"
          >
            {totalQuestions} questions completed
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
});
