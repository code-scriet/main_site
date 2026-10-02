import { motion, type Variants } from 'framer-motion';
import { useMotionConfig } from '@/hooks/useMotionConfig';

// Custom illustrated icon set for the homepage. Uniform 1.5px stroke on a 24px
// grid, rounded caps, duotone: white line work + a single amber accent element
// per icon. Strokes draw themselves in (pathLength) when scrolled into view and
// glow on hover (.home-illus). Reduced-motion shows the fully-drawn state.

// Line work follows the theme ink (white on dark, near-black on light); the
// amber accent stays constant for the duotone look.
const WHITE = 'var(--hx-ink)';
const AMBER = '#f97316';
const AMBER_HI = '#fbbf24';

const stroke: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: (i = 0) => ({
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { duration: 0.6, delay: 0.05 * i, ease: 'easeInOut' }, opacity: { duration: 0.15, delay: 0.05 * i } },
  }),
};
const pop: Variants = {
  hidden: { scale: 0, opacity: 0 },
  show: (i = 0) => ({
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 380, damping: 18, delay: 0.25 + 0.05 * i },
  }),
};

type IconProps = { className?: string; size?: number; accent?: string };

function useDrawProps() {
  const { prefersReducedMotion } = useMotionConfig();
  return prefersReducedMotion
    ? ({ animate: 'show' } as const)
    : ({ initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-40px' } } as const);
}

function Frame({ children, className, size = 24 }: IconProps & { children: React.ReactNode }) {
  const drawProps = useDrawProps();
  return (
    <motion.svg
      className={`home-illus ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={WHITE}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...drawProps}
    >
      {children}
    </motion.svg>
  );
}

// System Design — three connected nodes, one filled amber
export function SystemDesignIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <motion.line x1="6" y1="8" x2="10.5" y2="14" variants={stroke} custom={3} />
      <motion.line x1="18" y1="8" x2="13.5" y2="14" variants={stroke} custom={3} />
      <motion.rect x="2.5" y="3.5" width="7" height="5" rx="1.4" variants={stroke} custom={0} />
      <motion.rect x="14.5" y="3.5" width="7" height="5" rx="1.4" variants={stroke} custom={1} />
      <motion.rect x="8.5" y="14.5" width="7" height="5" rx="1.4" fill={props.accent ?? AMBER} stroke={props.accent ?? AMBER} variants={pop} custom={2} />
    </Frame>
  );
}

// Open Source — git branch with commit dots, amber dot at the merge
export function OpenSourceIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <motion.line x1="6" y1="6" x2="6" y2="18" variants={stroke} custom={0} />
      <motion.path d="M6 8 C 12 8 16 10 16 13" variants={stroke} custom={1} />
      <motion.path d="M16 13 C 16 16 11 17 6 17" variants={stroke} custom={2} />
      <motion.circle cx="6" cy="6" r="2" fill={WHITE} variants={pop} custom={1} />
      <motion.circle cx="16" cy="13" r="2" variants={pop} custom={2} />
      <motion.circle cx="6" cy="17" r="2.2" fill={props.accent ?? AMBER} stroke={props.accent ?? AMBER} variants={pop} custom={3} />
    </Frame>
  );
}

// Hackathons — trophy whose cup is a tiny terminal with a >_ prompt
export function HackathonsIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <motion.path d="M7 4 H17 V8 A5 5 0 0 1 7 8 Z" variants={stroke} custom={0} />
      <motion.path d="M7 5 H4.5 V6.5 A2 2 0 0 0 7 8" variants={stroke} custom={1} />
      <motion.path d="M17 5 H19.5 V6.5 A2 2 0 0 1 17 8" variants={stroke} custom={1} />
      <motion.path d="M12 13 V16" variants={stroke} custom={2} />
      <motion.path d="M8.5 20 H15.5" variants={stroke} custom={2} />
      <motion.path d="M10 16.5 H14 L13 20" variants={stroke} custom={2} />
      <motion.path d="M9.3 5.6 L11 6.9 L9.3 8.2" stroke={props.accent ?? AMBER_HI} variants={stroke} custom={3} />
      <motion.line x1="12" y1="8.2" x2="14.5" y2="8.2" stroke={props.accent ?? AMBER_HI} variants={stroke} custom={4} />
    </Frame>
  );
}

// Network — constellation of dots, the center node glowing amber
export function NetworkIcon(props: IconProps) {
  const outer = [
    [5, 6],
    [19, 6],
    [21, 13],
    [6, 18],
    [17, 19],
  ];
  return (
    <Frame {...props}>
      {outer.map(([x, y], i) => (
        <motion.line key={`l${i}`} x1="12" y1="12" x2={x} y2={y} variants={stroke} custom={i} />
      ))}
      {outer.map(([x, y], i) => (
        <motion.circle key={`c${i}`} cx={x} cy={y} r="1.5" fill={WHITE} variants={pop} custom={i} />
      ))}
      <motion.circle cx="12" cy="12" r="2.6" fill={props.accent ?? AMBER} stroke={props.accent ?? AMBER} variants={pop} custom={5} />
    </Frame>
  );
}

// Events — calendar with a code bracket inside
export function EventsIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <motion.rect x="3" y="5" width="18" height="16" rx="2.4" variants={stroke} custom={0} />
      <motion.line x1="3" y1="9.5" x2="21" y2="9.5" variants={stroke} custom={1} />
      <motion.line x1="8" y1="3" x2="8" y2="6" variants={stroke} custom={1} />
      <motion.line x1="16" y1="3" x2="16" y2="6" variants={stroke} custom={1} />
      <motion.path d="M9.5 13 L7.5 15.2 L9.5 17.4" stroke={props.accent ?? AMBER_HI} variants={stroke} custom={2} />
      <motion.path d="M14.5 13 L16.5 15.2 L14.5 17.4" stroke={props.accent ?? AMBER_HI} variants={stroke} custom={3} />
    </Frame>
  );
}

// DSA — a small binary tree, amber root
export function DsaIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <motion.line x1="12" y1="6" x2="7" y2="12" variants={stroke} custom={1} />
      <motion.line x1="12" y1="6" x2="17" y2="12" variants={stroke} custom={1} />
      <motion.line x1="7" y1="12" x2="4.5" y2="18" variants={stroke} custom={2} />
      <motion.line x1="7" y1="12" x2="9.5" y2="18" variants={stroke} custom={2} />
      <motion.circle cx="7" cy="12" r="1.8" fill={WHITE} variants={pop} custom={2} />
      <motion.circle cx="17" cy="12" r="1.8" fill={WHITE} variants={pop} custom={2} />
      <motion.circle cx="4.5" cy="18.5" r="1.6" fill={WHITE} variants={pop} custom={3} />
      <motion.circle cx="9.5" cy="18.5" r="1.6" fill={WHITE} variants={pop} custom={3} />
      <motion.circle cx="12" cy="5.5" r="2.4" fill={props.accent ?? AMBER} stroke={props.accent ?? AMBER} variants={pop} custom={0} />
    </Frame>
  );
}

// Achievements — medal with an amber star
export function AchievementsIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <motion.line x1="9" y1="3" x2="11" y2="11" variants={stroke} custom={0} />
      <motion.line x1="15" y1="3" x2="13" y2="11" variants={stroke} custom={0} />
      <motion.circle cx="12" cy="16" r="5" variants={stroke} custom={1} />
      <motion.path
        d="M12 13 L12.9 14.9 L15 15.2 L13.5 16.7 L13.8 18.8 L12 17.8 L10.2 18.8 L10.5 16.7 L9 15.2 L11.1 14.9 Z"
        fill={props.accent ?? AMBER}
        stroke={props.accent ?? AMBER}
        variants={pop}
        custom={2}
      />
    </Frame>
  );
}
