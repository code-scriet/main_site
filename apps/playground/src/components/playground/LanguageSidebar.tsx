import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { getAllLanguages } from '@/utils/languageConfig';
import { cn } from '@/lib/utils';

export function LanguageSidebar() {
  const { language, setLanguage } = usePlayground();
  const { theme } = useTheme();
  const languages = getAllLanguages();
  const isDark = theme === 'dark';

  return (
    <div className={cn(
      'w-16 h-full border-r border-border flex flex-col items-center py-2 gap-1 overflow-y-auto transition-colors',
      isDark ? 'bg-card/30' : 'bg-white/50'
    )}>
      {languages.map((lang) => {
        const isActive = language.id === lang.id;
        return (
          <button
            key={lang.id}
            onClick={() => setLanguage(lang.id)}
            title={lang.name}
            className={cn(
              'w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-xs',
              'hover:bg-accent/80',
              isActive
                ? isDark
                  ? 'bg-gradient-to-br from-amber-500/15 to-orange-500/15 ring-1 ring-amber-500/40 text-amber-500'
                  : 'bg-gradient-to-br from-amber-500/10 to-orange-500/10 ring-1 ring-amber-500/30 text-amber-600 shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="text-base leading-none">{lang.icon}</span>
            <span className="text-[9px] font-medium leading-none truncate w-full text-center">
              {lang.id === 'javascript' ? 'JS' : lang.id === 'typescript' ? 'TS' : lang.id === 'cpp' ? 'C++' : lang.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
