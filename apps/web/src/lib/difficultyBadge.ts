export type DifficultyBadgeValue = 'EASY' | 'MEDIUM' | 'HARD' | 'Easy' | 'Medium' | 'Hard' | string;

const difficultyBadgeClasses: Record<string, string> = {
  EASY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  HARD: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function getDifficultyBadgeClasses(difficulty?: DifficultyBadgeValue | null) {
  const key = difficulty?.toString().toUpperCase() ?? '';
  return difficultyBadgeClasses[key] ?? 'bg-gray-50 text-gray-700 border-gray-200';
}
