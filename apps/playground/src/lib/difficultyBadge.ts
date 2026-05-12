const difficultyBadgeClasses: Record<string, string> = {
  EASY: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  HARD: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
};

export function getDifficultyBadgeClasses(difficulty?: string | null) {
  return difficultyBadgeClasses[difficulty?.toUpperCase() ?? ''] ?? 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700';
}
