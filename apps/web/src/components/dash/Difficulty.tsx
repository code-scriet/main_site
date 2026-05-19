import { cn } from '@/lib/utils';

const map: Record<string, { label: string; cls: string }> = {
  EASY:   { label: 'Easy',   cls: 'text-[#1f8a5b] bg-[rgba(31,138,91,0.10)] border-[rgba(31,138,91,0.22)]' },
  MEDIUM: { label: 'Medium', cls: 'text-[#b45309] bg-[rgba(217,119,6,0.10)] border-[rgba(217,119,6,0.24)]' },
  HARD:   { label: 'Hard',   cls: 'text-[#be123c] bg-[rgba(225,29,72,0.10)] border-[rgba(225,29,72,0.24)]' },
};

export function Difficulty({ level, className }: { level: string; className?: string }) {
  const m = map[level?.toUpperCase()] ?? map.EASY;
  return (
    <span
      className={cn(
        'inline-flex items-center h-[22px] px-2 text-[11.5px] font-medium rounded-[6px] border whitespace-nowrap',
        m.cls,
        className,
      )}
    >
      {m.label}
    </span>
  );
}
