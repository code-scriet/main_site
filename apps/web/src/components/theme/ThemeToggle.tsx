import { MoonStar, SunMedium } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      className={cn(
        'group border-amber-300 bg-white/80 text-amber-900 shadow-sm backdrop-blur-sm hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-amber-100 dark:hover:bg-zinc-800',
        className
      )}
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        <SunMedium
          className={cn(
            'absolute h-4 w-4 transition-all duration-300',
            isDark ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
          )}
        />
        <MoonStar
          className={cn(
            'absolute h-4 w-4 transition-all duration-300',
            isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0'
          )}
        />
      </span>
    </Button>
  );
}
