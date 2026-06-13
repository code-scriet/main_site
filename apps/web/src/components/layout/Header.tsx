import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { Wordmark } from './Wordmark';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type NavigationItem = {
  name: string;
  href: string;
  external?: boolean;
};

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, logout } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const { theme } = useTheme();
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(location.pathname);

  // The homepage is an always-dark glass experience; the header overlays it as a
  // dark frosted bar with an animated active pill. Other routes keep the
  // existing theme-aware styling.
  const isHome = location.pathname === '/';
  // The home glass header follows the theme: light ink on the cream bar, white
  // on the charcoal bar. (Inner nav links/pills are themed in CSS via .navx-*.)
  const homeDark = isHome && theme === 'dark';
  const hWordmark = homeDark
    ? 'text-white group-hover:text-amber-300'
    : 'text-[#1b1714] group-hover:text-[#b4520f]';
  const hOutlineBtn = homeDark
    ? 'border-white/20 bg-white/5 text-white hover:bg-white/10'
    : 'border-[#1b1714]/15 bg-black/[0.04] text-[#1b1714] hover:bg-black/[0.07]';
  const hGhostBtn = homeDark
    ? 'text-white/80 hover:bg-white/10 hover:text-white'
    : 'text-[#1b1714]/80 hover:bg-black/[0.06] hover:text-[#1b1714]';
  const hMenuBtn = homeDark
    ? 'text-white hover:bg-white/10 active:bg-white/15'
    : 'text-[#1b1714] hover:bg-black/[0.06] active:bg-black/10';
  const hIcon = homeDark ? 'text-white' : 'text-[#1b1714]';
  const hPanel = homeDark
    ? 'border-white/10 bg-[#161413]/95 backdrop-blur-xl shadow-black/50'
    : 'border-[#1b1714]/10 bg-[#f7f3ec]/97 backdrop-blur-xl shadow-black/10';
  const hMobileLinkInactive = homeDark
    ? 'text-white/80 hover:bg-white/10 hover:text-white'
    : 'text-[#1b1714]/80 hover:bg-black/[0.06] hover:text-[#1b1714]';

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  useEffect(() => {
    if (previousPathnameRef.current === location.pathname) return;
    previousPathnameRef.current = location.pathname;

    if (!isMenuOpen) return;

    const closeTimer = window.setTimeout(() => {
      setIsMenuOpen(false);
    }, 0);

    return () => window.clearTimeout(closeTimer);
  }, [location.pathname, isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = 'hidden';

    const focusFirstItem = () => {
      const focusableItems = menuPanelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      focusableItems?.[0]?.focus();
    };

    const frame = window.requestAnimationFrame(focusFirstItem);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableItems = menuPanelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusableItems || focusableItems.length === 0) return;

      const firstItem = focusableItems[0];
      const lastItem = focusableItems[focusableItems.length - 1];

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      menuButton?.focus();
    };
  }, [isMenuOpen, closeMenu]);

  const isActiveLink = useCallback((href: string, external?: boolean) => {
    if (external) return false;
    if (href === '/') return location.pathname === '/';
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  }, [location.pathname]);

  const navigation: NavigationItem[] = [
    { name: 'Home', href: '/' },
    { name: 'About', href: '/about' },
    { name: 'Events', href: '/events' },
    { name: 'Announcements', href: '/announcements' },
    { name: 'Team', href: '/team' },
    { name: 'Achievements', href: '/achievements' },
    ...(settings?.playgroundEnabled !== false ? [{ name: 'Playground', href: getPlaygroundLaunchUrl('/'), external: true }] : []),
    ...(settings?.showNetwork !== false ? [{ name: 'Network', href: '/network' }] : []),
  ];

  // On the homepage, keep the glass bar uncrowded: a few primary links stay
  // inline, the rest tuck into a "More" dropdown.
  const PRIMARY = new Set(['Home', 'About', 'Events', 'Team']);
  const primaryNav = navigation.filter((i) => PRIMARY.has(i.name));
  const moreNav = navigation.filter((i) => !PRIMARY.has(i.name));
  const moreActive = moreNav.some((i) => isActiveLink(i.href, i.external));

  const desktopNavBaseClass = 'border-b-2 pb-1 text-sm font-medium transition-colors duration-200';
  const desktopNavInactiveClass = 'border-transparent text-gray-700 hover:text-amber-600 dark:text-zinc-300 dark:hover:text-amber-300';
  const mobileNavBaseClass = 'block rounded-xl px-3 py-3 text-sm font-medium transition-colors duration-200';
  const mobileNavInactiveClass = 'text-gray-700 hover:bg-amber-50 hover:text-amber-600 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-amber-300';

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full',
        isHome
          ? 'navx-home'
          : 'border-b border-amber-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/90 dark:supports-[backdrop-filter]:bg-zinc-950/80',
      )}
    >
      <nav className="container mx-auto px-4 py-3.5">
        <div className="flex h-12 items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className={cn('h-[38px] w-[38px] overflow-hidden rounded-lg shadow-md transition-shadow group-hover:shadow-lg', isHome && 'ring-1 ring-white/15')}>
              <img src="/logo.jpeg" alt="code.scriet" className="h-full w-full object-cover" />
            </div>
            <Wordmark
              size="md"
              className={cn(
                'transition-colors',
                isHome
                  ? hWordmark
                  : 'text-amber-900 group-hover:text-amber-700 dark:text-amber-100 dark:group-hover:text-amber-300',
              )}
            />
          </Link>

          {/* Desktop nav */}
          {isHome ? (
            <div className="hidden items-center gap-1 xl:flex">
              {primaryNav.map((item) => {
                const active = isActiveLink(item.href, item.external);
                return (
                  <Link key={item.name} to={item.href} data-active={active} aria-current={active ? 'page' : undefined} className="navx-link">
                    {active && <motion.span layoutId="navx-pill" className="navx-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                    <span className="relative z-10">{item.name}</span>
                  </Link>
                );
              })}

              {/* More — groups the secondary links into a glass dropdown */}
              <div className="relative" onMouseEnter={() => setMoreOpen(true)} onMouseLeave={() => setMoreOpen(false)}>
                <button
                  type="button"
                  className="navx-link"
                  data-active={moreActive || undefined}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((o) => !o)}
                >
                  {moreActive && <motion.span layoutId="navx-pill" className="navx-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  <span className="relative z-10 flex items-center gap-1">
                    More
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', moreOpen && 'rotate-180')} />
                  </span>
                </button>

                <AnimatePresence>
                  {moreOpen && (
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.16 }}
                      className="absolute right-0 top-full z-50 mt-2 min-w-[180px] rounded-2xl border border-white/10 bg-[#161413]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
                    >
                      {moreNav.map((item) => {
                        const active = isActiveLink(item.href, item.external);
                        const cls = cn(
                          'block rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                          active ? 'bg-[#f97316]/15 text-amber-300' : 'text-white/80 hover:bg-white/10 hover:text-white',
                        );
                        return item.external ? (
                          <a key={item.name} href={item.href} target="_blank" rel="noopener noreferrer" role="menuitem" className={cls} onClick={() => setMoreOpen(false)}>
                            {item.name}
                          </a>
                        ) : (
                          <Link key={item.name} to={item.href} role="menuitem" aria-current={active ? 'page' : undefined} className={cls} onClick={() => setMoreOpen(false)}>
                            {item.name}
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="hidden xl:flex items-center space-x-4 2xl:space-x-6">
              {navigation.map((item) => {
                const active = isActiveLink(item.href, item.external);
                if (item.external) {
                  return (
                    <a
                      key={item.name}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(desktopNavBaseClass, desktopNavInactiveClass)}
                    >
                      {item.name}
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      desktopNavBaseClass,
                      active
                        ? 'border-amber-500 text-amber-500 font-semibold dark:border-amber-400 dark:text-amber-300'
                        : desktopNavInactiveClass,
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="hidden xl:flex items-center space-x-3 2xl:space-x-4">
            <ThemeToggle />
            {user ? (
              <>
                <Link to="/dashboard">
                  <Button variant="outline" size="sm" className={isHome ? hOutlineBtn : undefined}>
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={logout} className={isHome ? hGhostBtn : undefined}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/signin">
                  <Button variant="outline" size="sm" className={isHome ? hOutlineBtn : undefined}>
                    Sign In
                  </Button>
                </Link>
                {!settingsLoading && settings?.hiringEnabled === true && (
                  <Link to="/join-us">
                    <Button
                      size="sm"
                      className={isHome ? 'bg-gradient-to-r from-[#f97316] to-[#fb923c] text-white shadow-[0_4px_20px_rgba(249,115,22,0.4)] hover:from-[#fb923c] hover:to-[#f97316]' : undefined}
                    >
                      Join Us
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 xl:hidden">
            <ThemeToggle />
            <button
              ref={menuButtonRef}
              type="button"
              className={cn(
                'touch-target rounded-lg p-2.5 transition-colors',
                isHome
                  ? hMenuBtn
                  : 'hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-zinc-900 dark:active:bg-zinc-800',
              )}
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMenuOpen ? (
                <X className={cn('h-6 w-6', isHome ? hIcon : 'text-gray-700 dark:text-zinc-100')} />
              ) : (
                <Menu className={cn('h-6 w-6', isHome ? hIcon : 'text-gray-700 dark:text-zinc-100')} />
              )}
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm xl:hidden"
            onClick={closeMenu}
          >
            <div className="px-4 pt-[84px]">
              <motion.div
                id="mobile-menu"
                ref={menuPanelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Site navigation"
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'rounded-2xl border p-4 shadow-2xl',
                  isHome
                    ? hPanel
                    : 'border-amber-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40',
                )}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="space-y-2">
                  {navigation.map((item) => {
                    const active = isActiveLink(item.href, item.external);

                    if (item.external) {
                      return (
                        <a
                          key={item.name}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            mobileNavBaseClass,
                            isHome ? hMobileLinkInactive : mobileNavInactiveClass,
                          )}
                          onClick={closeMenu}
                        >
                          {item.name}
                        </a>
                      );
                    }

                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          mobileNavBaseClass,
                          isHome
                            ? active
                              ? homeDark
                                ? 'bg-[#f97316]/15 text-amber-300 font-semibold'
                                : 'bg-[#f97316]/12 text-[#b4520f] font-semibold'
                              : hMobileLinkInactive
                            : active
                              ? 'bg-amber-50 text-amber-500 font-semibold dark:bg-zinc-900 dark:text-amber-300'
                              : mobileNavInactiveClass,
                        )}
                        onClick={closeMenu}
                      >
                        {item.name}
                      </Link>
                    );
                  })}
                </div>

                <div className={cn('mt-4 flex flex-col gap-2 border-t pt-4', isHome ? (homeDark ? 'border-white/10' : 'border-[#1b1714]/10') : 'border-amber-200 dark:border-zinc-800')}>
                  {user ? (
                    <>
                      <Link to="/dashboard" onClick={closeMenu}>
                        <Button variant="outline" className={cn('w-full', isHome && hOutlineBtn)}>
                          Dashboard
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        className={cn('w-full', isHome && hGhostBtn)}
                        onClick={() => {
                          logout();
                          closeMenu();
                        }}
                      >
                        Logout
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link to="/signin" onClick={closeMenu}>
                        <Button variant="outline" className={cn('w-full', isHome && hOutlineBtn)}>
                          Sign In
                        </Button>
                      </Link>
                      {!settingsLoading && settings?.hiringEnabled === true && (
                        <Link to="/join-us" onClick={closeMenu}>
                          <Button className={cn('w-full', isHome && 'bg-gradient-to-r from-[#f97316] to-[#fb923c] text-white')}>
                            Join Us
                          </Button>
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
