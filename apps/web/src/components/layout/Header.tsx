import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { cn } from '@/lib/utils';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type NavigationItem = {
  name: string;
  href: string;
  external?: boolean;
};

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(location.pathname);

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

  const desktopNavBaseClass = 'border-b-2 pb-1 text-sm font-medium transition-colors duration-200';
  const desktopNavInactiveClass = 'border-transparent text-gray-700 hover:text-amber-600 dark:text-zinc-300 dark:hover:text-amber-300';
  const mobileNavBaseClass = 'block rounded-xl px-3 py-3 text-sm font-medium transition-colors duration-200';
  const mobileNavInactiveClass = 'text-gray-700 hover:bg-amber-50 hover:text-amber-600 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-amber-300';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-amber-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/90 dark:supports-[backdrop-filter]:bg-zinc-950/80">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="h-12 w-12 rounded-lg overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
              <img src="/logo.jpeg" alt="code.scriet" className="h-full w-full object-cover" />
            </div>
            <span className="text-xl font-bold text-amber-900 group-hover:text-amber-700 transition-colors dark:text-amber-100 dark:group-hover:text-amber-300">code.scriet</span>
          </Link>

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
                      : desktopNavInactiveClass
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          <div className="hidden xl:flex items-center space-x-3 2xl:space-x-4">
            <ThemeToggle />
            {user ? (
              <>
                <Link to="/dashboard">
                  <Button variant="outline" size="sm">
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={logout}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/signin">
                  <Button variant="outline" size="sm">
                    Sign In
                  </Button>
                </Link>
                {!settingsLoading && settings?.hiringEnabled === true && (
                  <Link to="/join-us">
                    <Button size="sm">
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
              className="p-2.5 rounded-lg hover:bg-amber-50 active:bg-amber-100 transition-colors touch-target dark:hover:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6 text-gray-700 dark:text-zinc-100" />
              ) : (
                <Menu className="h-6 w-6 text-gray-700 dark:text-zinc-100" />
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
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm xl:hidden dark:bg-black/60"
            onClick={closeMenu}
          >
            <div className="px-4 pt-[88px]">
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
                className="rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40"
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
                          className={cn(mobileNavBaseClass, mobileNavInactiveClass)}
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
                          active
                            ? 'bg-amber-50 text-amber-500 font-semibold dark:bg-zinc-900 dark:text-amber-300'
                            : mobileNavInactiveClass
                        )}
                        onClick={closeMenu}
                      >
                        {item.name}
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-amber-200 pt-4 dark:border-zinc-800">
                  {user ? (
                    <>
                      <Link to="/dashboard" onClick={closeMenu}>
                        <Button variant="outline" className="w-full">
                          Dashboard
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        className="w-full"
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
                        <Button variant="outline" className="w-full">
                          Sign In
                        </Button>
                      </Link>
                      {!settingsLoading && settings?.hiringEnabled === true && (
                        <Link to="/join-us" onClick={closeMenu}>
                          <Button className="w-full">
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
