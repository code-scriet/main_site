import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  // The homepage is an always-dark glass experience; `data-home` lets the
  // shared public scope (footer + outer canvas + skip link) follow suit so the
  // page reads as one charcoal surface regardless of the theme toggle.
  const isHome = useLocation().pathname === '/';

  return (
    <div
      data-public=""
      data-home={isHome ? '' : undefined}
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--pub-canvas)', color: 'var(--pub-ink)' }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:px-4 focus:py-2 focus:shadow-lg"
        style={{ background: 'var(--pub-ink)', color: 'var(--pub-canvas)' }}
      >
        Skip to main content
      </a>
      <Header />
      <main id="main-content" className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
