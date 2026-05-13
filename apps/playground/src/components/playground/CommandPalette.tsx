import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Search, Sun } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { getAllLanguages } from '@/utils/languageConfig';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { setLanguage } = usePlayground();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const languages = getAllLanguages();

  if (!open) return null;

  const run = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-zinc-950/55 p-4 backdrop-blur-sm" onMouseDown={() => onOpenChange(false)}>
      <Command
        className="mx-auto mt-[12vh] w-full max-w-xl overflow-hidden rounded border border-zinc-200 bg-warmwhite shadow-2xl dark:border-zinc-800 dark:bg-inknight"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
          <Search className="h-4 w-4 text-zinc-500" />
          <Command.Input
            autoFocus
            placeholder="Search commands..."
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
          />
          <kbd className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800">Esc</kbd>
        </div>
        <Command.List className="max-h-[420px] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-zinc-500">No command found.</Command.Empty>

          <Command.Group heading="Languages" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-zinc-500">
            {languages.map((language) => (
              <Command.Item
                key={language.id}
                value={`Switch language ${language.name}`}
                onSelect={() => run(() => setLanguage(language.id))}
                className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm text-zinc-700 aria-selected:bg-amber-400/10 aria-selected:text-zinc-950 dark:text-zinc-200 dark:aria-selected:text-zinc-50"
              >
                <span className="text-base">{language.icon}</span>
                <span>Switch to {language.name}</span>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Navigation" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-zinc-500">
            <Command.Item value="Open snippets" onSelect={() => run(() => navigate('/snippets'))} className="cursor-pointer rounded px-3 py-2 text-sm aria-selected:bg-amber-400/10">
              Open snippets
            </Command.Item>
            <Command.Item value="Open practice problems" onSelect={() => run(() => navigate('/?practice=1'))} className="cursor-pointer rounded px-3 py-2 text-sm aria-selected:bg-amber-400/10">
              Open practice problems
            </Command.Item>
            <Command.Item value="Jump to QOTD today" onSelect={() => run(() => navigate('/?qotd=today'))} className="cursor-pointer rounded px-3 py-2 text-sm aria-selected:bg-amber-400/10">
              Jump to QOTD today
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-zinc-500">
            <Command.Item value="Toggle theme" onSelect={() => run(toggleTheme)} className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm aria-selected:bg-amber-400/10">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              Toggle theme
            </Command.Item>
            <Command.Item value="Sign out logout" onSelect={() => run(logout)} className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm aria-selected:bg-amber-400/10">
              <LogOut className="h-4 w-4" />
              Sign out
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
