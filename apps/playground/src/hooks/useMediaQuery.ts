import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Reactive `matchMedia`. Built on `useSyncExternalStore` so the value is read
 * during render (never a mount-effect flash of the wrong layout) and stays in
 * sync across orientation changes / window resizes.
 *
 * Guards `window` so it degrades to `false` if this ever runs without a DOM.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      // Safari < 14 only has the deprecated addListener/removeListener pair.
      if (typeof list.addEventListener === 'function') {
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      }
      list.addListener(onChange);
      return () => list.removeListener(onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Phone-sized layout. Matches Tailwind's `md` breakpoint (768px) so a component
 * can pair `useIsMobile()` logic with `md:` classes and they always agree.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767.98px)');
}

/** Small tablets and phones — the `lg` breakpoint (1024px). */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1023.98px)');
}

/** Touch-primary device (phone/tablet), regardless of viewport width. */
export function useIsTouch(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/**
 * True when the editor should use the touch-tuned Monaco profile: a narrow
 * viewport OR a touch-primary device (covers a phone held in landscape, which
 * is wide enough to miss the width query but still has no physical keyboard).
 */
export function useTouchEditor(): boolean {
  const narrow = useIsMobile();
  const touch = useIsTouch();
  return useMemo(() => narrow || touch, [narrow, touch]);
}
