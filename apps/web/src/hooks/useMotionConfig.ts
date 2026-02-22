import { useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const subscribeToMediaQuery = (query: string, onStoreChange: () => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(query);
  const listener = () => onStoreChange();

  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
};

const getMediaQuerySnapshot = (query: string) => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia(query).matches;
};

const getServerSnapshot = () => false;

/**
 * Custom hook to detect mobile viewport and reduced motion preferences.
 * Use this to conditionally simplify animations for better mobile performance.
 */
export function useMotionConfig() {
  const isMobile = useSyncExternalStore(
    (onStoreChange) => subscribeToMediaQuery(MOBILE_QUERY, onStoreChange),
    () => getMediaQuerySnapshot(MOBILE_QUERY),
    getServerSnapshot
  );

  const prefersReducedMotion = useSyncExternalStore(
    (onStoreChange) => subscribeToMediaQuery(REDUCED_MOTION_QUERY, onStoreChange),
    () => getMediaQuerySnapshot(REDUCED_MOTION_QUERY),
    getServerSnapshot
  );

  // Combine both conditions
  const shouldReduceMotion = isMobile || prefersReducedMotion;

  return {
    isMobile,
    prefersReducedMotion,
    shouldReduceMotion,
    // Animation presets for common patterns
    variants: {
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
    },
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
