import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarCheck,
  ChevronDown,
  FileCode2,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  User,
} from 'lucide-react';
import { useAuth, getLoginUrl } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { MobileSheet } from '@/components/ui/mobile-sheet';
import { cn } from '@/lib/utils';

const MAIN_SITE_URL =
  import.meta.env.VITE_MAIN_SITE_URL ||
  (import.meta.env.DEV ? 'http://localhost:5173' : 'https://codescriet.dev');

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openCommandPalette = () => {
    window.dispatchEvent(new Event('playground:command-palette'));
  };

  const navItem =
    'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-zinc-700 active:bg-zinc-100 dark:text-zinc-200 dark:active:bg-zinc-800';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-warmwhite px-2 sm:px-3 dark:border-zinc-800 dark:bg-inknight">
      <div className="flex min-w-0 items-center gap-3">
        <a
          href={MAIN_SITE_URL}
          className="hidden h-8 items-center gap-1.5 rounded px-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 sm:inline-flex dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Main site
        </a>
        <div className="hidden h-6 w-px bg-zinc-200 sm:block dark:bg-zinc-800" />
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-[inset_0_-2px_0_rgba(180,83,9,0.35)]">
            <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
              <path d="M11 22 L21 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              codescriet
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
              playground
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 pl-2 md:flex">
          <Link to="/snippets" className="rounded px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100">
            Snippets
          </Link>
          <Link to="/?qotd=today" className="rounded px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100">
            Today&apos;s QOTD
          </Link>
          <Link to="/?practice=1" className="rounded px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100">
            Problems
          </Link>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden h-8 items-center gap-2 rounded border border-zinc-200 px-2.5 text-xs text-zinc-500 hover:text-zinc-900 md:inline-flex dark:border-zinc-800 dark:hover:text-zinc-100"
        >
          <Search className="h-3.5 w-3.5" />
          Search
          <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-zinc-900">⌘K</kbd>
        </button>
        <Button onClick={toggleTheme} variant="ghost" size="icon" className="hidden h-10 w-10 text-zinc-500 hover:text-zinc-950 sm:inline-flex dark:hover:text-zinc-50" title="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {isAuthenticated && user ? (
          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-8 items-center gap-2 rounded border border-zinc-200 px-1.5 pr-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="h-5 w-5 rounded-full" />
              ) : (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950">
                  {user.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              )}
              <span className="max-w-[110px] truncate">{user.name}</span>
              <ChevronDown className={cn('h-3 w-3 transition', menuOpen && 'rotate-180')} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 w-52 rounded border border-zinc-200 bg-warmwhite p-1 shadow-xl dark:border-zinc-800 dark:bg-inknight">
                <div className="px-2 py-2">
                  <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">{user.name}</p>
                  <p className="truncate text-[11px] text-zinc-500">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Button asChild size="sm" className="h-9 bg-amber-400 text-xs text-amber-950 hover:bg-amber-300">
            <a href={getLoginUrl()}>
              <User className="mr-1.5 h-3.5 w-3.5" />
              Sign in
            </a>
          </Button>
        )}

        {/* Phone/tablet: everything the desktop bar spreads across the header
            lives behind one reachable menu button. */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Menu"
          className="grid h-10 w-10 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <MobileSheet open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title="Playground">
        <div className="p-2">
          {isAuthenticated && user && (
            <div className="mb-1 flex items-center gap-3 px-3 py-3">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="h-9 w-9 rounded-full" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-400 text-sm font-bold text-amber-950">
                  {user.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{user.name}</span>
                <span className="block truncate text-xs text-zinc-500">{user.email}</span>
              </span>
            </div>
          )}

          <Link to="/?qotd=today" onClick={() => setMobileNavOpen(false)} className={navItem}>
            <CalendarCheck className="h-4 w-4 text-zinc-500" />
            Today&apos;s QOTD
          </Link>
          <Link to="/?practice=1" onClick={() => setMobileNavOpen(false)} className={navItem}>
            <BookOpenCheck className="h-4 w-4 text-zinc-500" />
            Practice problems
          </Link>
          <Link to="/snippets" onClick={() => setMobileNavOpen(false)} className={navItem}>
            <FileCode2 className="h-4 w-4 text-zinc-500" />
            My snippets
          </Link>
          <button
            type="button"
            onClick={() => { setMobileNavOpen(false); openCommandPalette(); }}
            className={navItem}
          >
            <Search className="h-4 w-4 text-zinc-500" />
            Search commands
          </button>

          <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />

          <button type="button" onClick={toggleTheme} className={navItem}>
            {theme === 'dark' ? <Sun className="h-4 w-4 text-zinc-500" /> : <Moon className="h-4 w-4 text-zinc-500" />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <a href={MAIN_SITE_URL} className={navItem}>
            <ArrowLeft className="h-4 w-4 text-zinc-500" />
            Back to main site
          </a>
          {isAuthenticated && (
            <button type="button" onClick={() => { setMobileNavOpen(false); logout(); }} className={navItem}>
              <LogOut className="h-4 w-4 text-zinc-500" />
              Sign out
            </button>
          )}
        </div>
      </MobileSheet>
    </header>
  );
}
