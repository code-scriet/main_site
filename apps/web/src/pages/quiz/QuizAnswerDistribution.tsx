/**
 * QuizAnswerDistribution — horizontal bar chart showing how people answered.
 * Bars animate from 0 → final width on mount (300ms ease-out).
 * Correct answer bar: green. Others: muted amber.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface QuizAnswerDistributionProps {
  distribution: Record<string, number>;
  correctAnswer: string | null;
  options: string[] | null;
  questionType: string;
}

export const QuizAnswerDistribution = memo(function QuizAnswerDistribution({
  distribution,
  correctAnswer,
  options,
  questionType,
}: QuizAnswerDistributionProps) {
  const entries = options
    ? options.map((opt) => ({ label: opt, count: distribution[opt] || 0 }))
    : Object.entries(distribution).map(([label, count]) => ({ label, count }));

  const total = entries.reduce((sum, e) => sum + e.count, 0) || 1;
  const maxCount = Math.max(...entries.map((e) => e.count), 1);
  const isPoll = questionType === 'POLL';
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  return (
    <div className="w-full space-y-2.5">
      <h4 className="text-xs font-semibold text-amber-700/50 uppercase tracking-widest">Answer Distribution</h4>
      {entries.map((entry, i) => {
        const pct = Math.round((entry.count / total) * 100);
        const isCorrect = !isPoll && entry.label === correctAnswer;
        const barWidth = `${(entry.count / maxCount) * 100}%`;

        return (
          <div key={entry.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className={cn(
                'font-medium',
                isCorrect ? 'text-green-700' : 'text-amber-800',
              )}>
                {options ? `${letters[i] || ''}) ${entry.label}` : entry.label}
                {isCorrect && ' ✓'}
              </span>
              <span className="text-amber-700/50 tabular-nums font-medium">{entry.count} ({pct}%)</span>
            </div>
            <div className="w-full h-6 bg-amber-50 rounded-lg overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: barWidth }}
                transition={{ duration: 0.3, ease: 'easeOut', delay: i * 0.05 }}
                className={cn(
                  'h-full rounded-lg',
                  isCorrect
                    ? 'bg-gradient-to-r from-green-400 to-green-500'
                    : isPoll
                      ? 'bg-gradient-to-r from-amber-300 to-amber-400'
                      : 'bg-amber-200',
                )}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});
