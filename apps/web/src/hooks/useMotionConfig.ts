import { useState, useEffect } from 'react';

/**
 * Custom hook to detect mobile viewport and reduced motion preferences.
 * Use this to conditionally simplify animations for better mobile performance.
 */
export function useMotionConfig() {
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check for mobile viewport
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Check for reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(motionQuery.matches);

    // Initial check
    checkMobile();

    // Listen for viewport changes
    window.addEventListener('resize', checkMobile);
    
    // Listen for motion preference changes
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    motionQuery.addEventListener('change', handleMotionChange);

    return () => {
      window.removeEventListener('resize', checkMobile);
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

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
