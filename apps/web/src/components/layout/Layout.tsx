import type { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div
      data-public=""
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
