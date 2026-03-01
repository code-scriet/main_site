import { useMemo, useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type Listener = () => void;

const createMediaQueryStore = (query: string) => {
  let mediaQuery: MediaQueryList | null = null;
  const listeners = new Set<Listener>();

  const notifyAll = () => {
    listeners.forEach((listener) => listener());
  };

  const ensureMediaQuery = () => {
    if (typeof window === 'undefined' || mediaQuery) {
      return;
    }

    mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener('change', notifyAll);
  };

  return {
    subscribe(listener: Listener) {
      if (typeof window === 'undefined') {
        return () => undefined;
      }

      ensureMediaQuery();
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && mediaQuery) {
          mediaQuery.removeEventListener('change', notifyAll);
          mediaQuery = null;
        }
      };
    },
    getSnapshot() {
      if (typeof window === 'undefined') {
        return false;
      }

      ensureMediaQuery();
      return mediaQuery?.matches ?? false;
    },
  };
};

const mobileStore = createMediaQueryStore(MOBILE_QUERY);
const reducedMotionStore = createMediaQueryStore(REDUCED_MOTION_QUERY);

const getServerSnapshot = () => false;

/**
 * Custom hook to detect mobile viewport and reduced motion preferences.
 * Uses shared media-query subscriptions so many components don't create duplicate listeners.
 */
export function useMotionConfig() {
  const isMobile = useSyncExternalStore(
    mobileStore.subscribe,
    mobileStore.getSnapshot,
    getServerSnapshot
  );

  const prefersReducedMotion = useSyncExternalStore(
    reducedMotionStore.subscribe,
    reducedMotionStore.getSnapshot,
    getServerSnapshot
  );

  // Combine both conditions
  const shouldReduceMotion = isMobile || prefersReducedMotion;

  const variants = useMemo(() => ({
    // Fade in from below - simplified on mobile
    fadeInUp: {
      initial: { opacity: 0, y: shouldReduceMotion ? 10 : 30 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: shouldReduceMotion ? 0.3 : 0.6 },
    },
    // Scale in - simplified on mobile
    scaleIn: {
      initial: { opacity: 0, scale: shouldReduceMotion ? 0.95 : 0.8 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: shouldReduceMotion ? 0.3 : 0.5 },
    },
    // Stagger delay multiplier
    staggerDelay: shouldReduceMotion ? 0.05 : 0.15,
  }), [shouldReduceMotion]);

  return {
    isMobile,
    prefersReducedMotion,
    shouldReduceMotion,
    variants,
  };
}

/**
 * Get hover animation props - returns empty object on mobile
 */
export function getHoverAnimation(
  isMobile: boolean,
  animation: Record<string, unknown>
): Record<string, unknown> | undefined {
  return isMobile ? undefined : animation;
}
