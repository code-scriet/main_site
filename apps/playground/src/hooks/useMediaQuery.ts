import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Reactive `matchMedia`. Built on `useSyncExternalStore` so the value is read
 * during render (never a mount-effect flash of the wrong layout) and stays in
 * sync across orientation changes / window resizes.
 *
 * Guards `window` so it degrades to `false` if this ever runs without a DOM.
 */
// One MediaQueryList per query, reused for the lifetime of the page.
//
// getSnapshot is called by React on EVERY render and again after each render to check for
// tearing, so constructing a fresh MediaQueryList inside it meant parsing a media query
// several times a second on the exact devices this module exists for — ContestArenaPage
// re-renders once per second from its countdown and calls useIsCompact(), and QOTDSolverShell
// adds useIsCompact() + useTouchEditor() (itself two queries) on top.
const mediaQueryLists = new Map<string, MediaQueryList>();

function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  let list = mediaQueryLists.get(query);
  if (!list) {
    list = window.matchMedia(query);
    mediaQueryLists.set(query, list);
  }
  return list;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = getMediaQueryList(query);
      if (!list) return () => undefined;
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

  const getSnapshot = useCallback(() => getMediaQueryList(query)?.matches ?? false, [query]);

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
