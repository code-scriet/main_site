import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlayground } from '@/context/PlaygroundContext';
import { getAllLanguages } from '@/utils/languageConfig';
import { cn } from '@/lib/utils';
import { isPyodideReady } from '@/engines/pyodideEngine';
import { isTypeScriptReady } from '@/engines/tsEngine';
import { CLIENT_SUPPORTED_LANGUAGES } from '@/engines/types';

interface LanguageSidebarProps {
  onOpenPractice?: () => void;
  mobile?: boolean;
}

type LanguageGlyph = {
  bg: string;
  fg: string;
  label: string;
  fontSize: number;
};

const LANGUAGE_GLYPHS: Record<string, LanguageGlyph> = {
  python: { bg: '#3776AB', fg: '#FFD84D', label: 'Py', fontSize: 12 },
  javascript: { bg: '#F7DF1E', fg: '#111111', label: 'JS', fontSize: 12 },
  typescript: { bg: '#3178C6', fg: '#FFFFFF', label: 'TS', fontSize: 12 },
  cpp: { bg: '#00549D', fg: '#FFFFFF', label: 'C++', fontSize: 10.5 },
  c: { bg: '#283593', fg: '#FFFFFF', label: 'C', fontSize: 13 },
  java: { bg: '#B07219', fg: '#FFFFFF', label: 'Jv', fontSize: 11 },
  web: { bg: '#E44D26', fg: '#FFFFFF', label: 'H5', fontSize: 11 },
};

function LanguageMark({ id }: { id: string }) {
  const glyph = LANGUAGE_GLYPHS[id] ?? {
    bg: '#52525B',
    fg: '#FFFFFF',
    label: id.slice(0, 2).toUpperCase(),
    fontSize: 11,
  };
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill={glyph.bg} />
      <text
        x="14"
        y="14"
        fontFamily="Outfit, system-ui, sans-serif"
        fontWeight="700"
        fontSize={glyph.fontSize}
        textAnchor="middle"
        dominantBaseline="central"
        fill={glyph.fg}
      >
        {glyph.label}
      </text>
    </svg>
  );
}

export function LanguageSidebar({ onOpenPractice, mobile = false }: LanguageSidebarProps = {}) {
  const { language, setLanguage, pythonMode, pyodideProgress } = usePlayground();
  const languages = getAllLanguages();
  const [readyEngines, setReadyEngines] = useState<Set<string>>(new Set(['javascript', 'web']));

  useEffect(() => {
    const check = () => {
      const ready = new Set(['javascript', 'web']);
      if (isPyodideReady()) ready.add('python');
      if (isTypeScriptReady()) ready.add('typescript');
      setReadyEngines(ready);
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  const buttonClass = (active: boolean) => cn(
    'group relative grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-all duration-150',
    active
      ? 'bg-amber-400/15 ring-1 ring-amber-400/50'
      : 'opacity-80 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-900',
  );

  const sortedLanguages = useMemo(() => {
    const order = ['python', 'javascript', 'typescript', 'cpp', 'c', 'java', 'web'];
    return [...languages].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [languages]);

  return (
    <div
      className={cn(
        mobile
          ? 'flex h-14 items-center gap-3 overflow-x-auto border-b border-zinc-200 bg-warmwhite px-3 dark:border-zinc-800 dark:bg-inknight'
          : 'flex h-full w-16 flex-col items-center gap-3 border-r border-zinc-200 bg-warmwhite py-4 dark:border-zinc-800 dark:bg-inknight',
      )}
    >
      {!mobile && (
        <Link
          to="/"
          title="codescriet playground · home"
          className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-[inset_0_-2px_0_rgba(180,83,9,0.28)] transition hover:from-amber-300 hover:to-amber-400"
        >
          <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
            <path d="M11 22 L21 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </Link>
      )}

      {onOpenPractice && (
        <button
          type="button"
          onClick={onOpenPractice}
          title="Practice problems · past QOTDs and archive"
          className="group relative grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-600 transition hover:bg-amber-400/20 dark:text-amber-300"
        >
          <BookOpenCheck className="h-4 w-4" />
          <span className="pointer-events-none absolute left-14 z-50 hidden whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-[11px] font-medium text-foreground shadow-sm group-hover:block">
            Practice problems
          </span>
        </button>
      )}

      {!mobile && (
        <div className="my-1 h-px w-8 bg-zinc-200 dark:bg-zinc-800" aria-hidden="true" />
      )}

      <div className={cn(mobile ? 'flex items-center gap-3' : 'flex flex-1 flex-col items-center gap-3')}>
        {sortedLanguages.map((lang) => {
          const isActive = language.id === lang.id;
          const isClient = CLIENT_SUPPORTED_LANGUAGES.has(lang.id);
          const isReady = readyEngines.has(lang.id);
          const isPythonDownloading = lang.id === 'python' && pythonMode === 'downloading';
          const tierLabel = isClient ? 'runs locally' : 'runs in cloud';

          return (
            <button
              key={lang.id}
              type="button"
              onClick={() => setLanguage(lang.id)}
              title={`${lang.name} · ${tierLabel}`}
              className={buttonClass(isActive)}
            >
              <LanguageMark id={lang.id} />

              {/* Quiet ready-state dot: emerald = engine loaded locally, sky = cloud-only */}
              <span
                className={cn(
                  'pointer-events-none absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2',
                  'ring-warmwhite dark:ring-inknight',
                  isClient
                    ? isReady
                      ? 'bg-emerald-500'
                      : 'bg-zinc-300 dark:bg-zinc-600'
                    : 'bg-sky-500',
                )}
                aria-hidden="true"
              />

              {/* Pyodide download progress ring around the Python icon */}
              {isPythonDownloading && (
                <svg className="pointer-events-none absolute inset-0 h-11 w-11 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
                  <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="2" />
                  <circle
                    cx="22"
                    cy="22"
                    r="20"
                    fill="none"
                    stroke="rgb(251 191 36)"
                    strokeLinecap="round"
                    strokeWidth="2"
                    strokeDasharray={`${Math.max(2, pyodideProgress * 1.256)} 125.6`}
                  />
                </svg>
              )}

              {/* Tooltip floats to the right on hover */}
              <span className="pointer-events-none absolute left-14 z-50 hidden whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-[11px] font-medium text-foreground shadow-sm group-hover:block">
                {lang.name}
                <span className="ml-1 text-muted-foreground">· {tierLabel}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
