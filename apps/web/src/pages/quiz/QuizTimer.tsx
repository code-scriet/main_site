/**
 * QuizTimer — animated countdown bar using site design tokens.
 * Color transitions: green → amber/yellow → red.
 * Subtle scale pulse when < 5s. Full-width 8px bar.
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface QuizTimerProps {
  progress: number; // 1.0 → 0.0
  secondsLeft: number;
  isUrgent: boolean;
  isExpired: boolean;
}

export const QuizTimer = memo(function QuizTimer({ progress, secondsLeft, isUrgent, isExpired }: QuizTimerProps) {
  const barColor = isExpired
    ? 'bg-red-500'
    : progress < 0.15
      ? 'bg-red-500'
      : progress < 0.4
        ? 'bg-amber-500'
        : 'bg-green-500';

  const textColor = isExpired
    ? 'text-red-500'
    : progress < 0.15
      ? 'text-red-500'
      : progress < 0.4
        ? 'text-amber-600'
        : 'text-gray-600';

  return (
    <div className="w-full space-y-1.5">
      <div className="flex justify-end">
        <span
          className={cn(
            'text-sm font-bold tabular-nums transition-colors duration-200',
            textColor,
            isUrgent && !isExpired && 'animate-pulse',
          )}
        >
          {isExpired ? "Time's up!" : `${secondsLeft}s`}
        </span>
      </div>
      <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-100 ease-linear',
            barColor,
            isUrgent && !isExpired && 'animate-pulse',
          )}
          style={{ width: `${Math.max(0, progress * 100)}%` }}
        />
      </div>
    </div>
  );
});
