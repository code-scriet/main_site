import { Fragment, useMemo, useRef, type CSSProperties, type ElementType } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { useAboutPageData } from '@/hooks/useAboutPageData';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import type { AboutPageStats } from '@/hooks/useAboutPageData';
import { monthsWord, type AboutStoryParagraph, type AboutTeamItem } from '@/lib/aboutContent';

// Animated <Link> for staggered team-row + CTA-card reveals. Defined at module
// scope so the wrapped component identity is stable across renders.
const MotionLink = motion(Link);

// Deterministic pseudo-random (matches HomeBackground) so the ambient particle
// positions are stable across renders + SSR/prerender without a dependency.
const seededUnit = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

// Render editorial copy that may contain a small set of inline HTML tags
// (<strong>, <em>, <br>, <span class="ab-em">). This content is NOT user- or
// admin-supplied at runtime — it is a build-time constant (DEFAULT_ABOUT_CONTENT
// in src/lib/aboutContent.ts), so dangerouslySetInnerHTML carries no untrusted
// input. Only the live stats/launch-date merged into the page are dynamic, and
// those are plain text/numbers, never HTML. Plain strings render too.
function InlineHtml({
  html,
  as,
  className,
}: {
  html: string;
  as?: ElementType;
  className?: string;
}) {
  const Tag = (as ?? 'span') as ElementType;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Render a paragraph from the story section. Strong/em tags come from the
 * build-time DEFAULT_ABOUT_CONTENT constant (not runtime input), so they are
 * preserved as-is — there is no untrusted HTML on this path.
 */
function StoryParagraph({ paragraph }: { paragraph: AboutStoryParagraph }) {
  if (paragraph.isPull) {
    return (
      <p className="ab-pull">
        <span dangerouslySetInnerHTML={{ __html: paragraph.html }} />
        {paragraph.cite ? <cite>{paragraph.cite}</cite> : null}
      </p>
    );
  }
  return <p dangerouslySetInnerHTML={{ __html: paragraph.html }} />;
}

/**
 * Format a numeric stat with thousands separators. Stats are always integers.
 */
function statValue(n: number): string {
  return n.toLocaleString('en-IN');
}

/**
 * Display the team's count from content if set, else fall back to the live
 * team-members total when there is exactly one team item without a count.
 * Keeps admin-overridden numbers respected.
 */
function teamCountLabel(item: AboutTeamItem, fallbackTeamMembers: number, isOnlyUnset: boolean): string {
  if (typeof item.count === 'number') return `${item.count} ${item.count === 1 ? 'member' : 'members'}`;
  if (isOnlyUnset && fallbackTeamMembers > 0) return `${fallbackTeamMembers} members`;
  return '—';
}

function HeroStats({ stats }: { stats: AboutPageStats }) {
  const cells: Array<{ k: string; v: React.ReactNode }> = [
    { k: 'Members', v: statValue(stats.members) },
    { k: 'Events', v: statValue(stats.events) },
    {
      k: 'Age',
      v: (
        <Fragment>
          {stats.monthsSinceInception}
          <small> {stats.monthsSinceInception === 1 ? 'month' : 'months'}</small>
        </Fragment>
      ),
    },
  ];
  return (
    <>
      {cells.map((c) => (
        <div className="ab-hero-meta-cell" key={c.k}>
          <div className="ab-k">{c.k}</div>
          <div className="ab-v">{c.v}</div>
        </div>
      ))}
    </>
  );
}

export default function AboutPage() {
  const { stats, content } = useAboutPageData();
  const { shouldReduceMotion, disableParallax, isMobile, prefersReducedMotion } = useMotionConfig();
  const { hero, thesis, manifesto, story, teams, closing } = content;

  // Sparse rising copper/amber particles drifting up through the dark atmosphere
  // (dark theme only — gated to display:none in light via CSS). Fewer than the
  // home page (calmer, editorial); disabled entirely for reduced motion.
  const particles = useMemo(() => {
    const count = prefersReducedMotion ? 0 : isMobile ? 12 : 24;
    return Array.from({ length: count }, (_, index) => {
      const seed = index + 1;
      return {
        id: index,
        left: seededUnit(seed) * 100,
        size: seededUnit(seed * 2.13) * 2.5 + 1.5,
        duration: seededUnit(seed * 3.07) * 16 + 16,
        delay: seededUnit(seed * 4.1) * 22,
        drift: (seededUnit(seed * 5.7) - 0.5) * 60,
      };
    });
  }, [isMobile, prefersReducedMotion]);

  // Parallax: the ambient grid drifts a touch slower than the page, and the hero
  // title lifts gently as the hero scrolls away. Amplitudes are deliberately tiny
  // ("almost unnoticeable"). Both fall back to a static value when the user (or a
  // mobile device) has reduced motion. useScroll relies on IntersectionObserver /
  // scroll listeners, so the page is fully styled even if no scroll value arrives.
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll();
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const gridParallax = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const heroTitleParallax = useTransform(heroProgress, [0, 1], [0, -26]);
  const gridY = disableParallax ? 0 : gridParallax;
  const heroTitleY = disableParallax ? 0 : heroTitleParallax;

  // Sections (and staggered children) fade up 22px over ~600ms as they enter the
  // viewport; reduced motion collapses to a short opacity-only fade.
  const sectionReveal = (i = 0) =>
    shouldReduceMotion
      ? {
          initial: { opacity: 0 },
          whileInView: { opacity: 1 },
          viewport: { once: true, amount: 0.15 } as const,
          transition: { duration: 0.4, delay: i * 0.05 },
        }
      : {
          initial: { opacity: 0, y: 22 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.15 } as const,
          transition: { duration: 0.6, delay: Math.min(i * 0.07, 0.5), ease: [0.22, 0.61, 0.36, 1] as const },
        };

  // Story paragraphs fade-up + stagger as they scroll into view. The aside itself
  // stays as a plain <aside> so position: sticky (left-column heading that hangs
  // while the right column scrolls past) works without interference.
  const paragraphMotion = (i: number) =>
    shouldReduceMotion
      ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, transition: { duration: 0.25, delay: i * 0.04 } }
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay: Math.min(i * 0.08, 0.5), ease: [0.22, 0.61, 0.36, 1] as const },
        };
  const viewportOnce = { once: true, amount: 0.2 } as const;

  // Render the thesis body with the (admin-defined) emphasis substring as
  // ember italic. Falls back to plain text if the substring isn't present.
  const thesisRendered = (() => {
    const body = thesis.body;
    const emphasis = thesis.emphasis;
    if (!emphasis || !body.includes(emphasis)) {
      return <>{body}</>;
    }
    const [before, ...rest] = body.split(emphasis);
    const after = rest.join(emphasis);
    return (
      <>
        {before}
        <span className="ab-em">{emphasis}</span>
        {after}
      </>
    );
  })();

  const unsetTeamCounts = teams.items.filter((t) => t.count === null);
  const singleUnsetCount = unsetTeamCounts.length === 1;

  return (
    <Layout>
      <SEO
        title="About code.scriet — SCRIET's Official Coding Club, CCS University Meerut"
        description="code.scriet is the official coding club of SCRIET, CCS University Meerut. A practice-first, ship-first coding community founded January 1, 2026."
        url="/about"
      />

      {/* Ambient atmosphere — fixed behind all content (dark theme only via CSS).
          Slow-drifting copper/orange light forms + an animated dot grid. Purely
          decorative, so aria-hidden and pointer-events:none. */}
      <div className="ab-page">
        <div className="ab-atmos" aria-hidden="true">
          <motion.div className="ab-atmos-grid" style={{ y: gridY }} />
          <span className="ab-orb ab-orb--1" />
          <span className="ab-orb ab-orb--2" />
          <span className="ab-orb ab-orb--3" />
          {particles.map((p) => (
            <span
              key={p.id}
              className="ab-particle"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size,
                '--drift': `${p.drift}px`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              } as CSSProperties}
            />
          ))}
        </div>

      {/* HERO */}
      <motion.section className="ab-hero" ref={heroRef} {...sectionReveal(0)}>
        <div className="pub-container">
          <div className="ab-hero-eyebrow-row">
            {hero.eyebrow.left ? <span className="ab-ember">{hero.eyebrow.left}</span> : null}
            <span className="ab-sep" aria-hidden="true" />
            {hero.eyebrow.middle ? <span>{hero.eyebrow.middle}</span> : null}
            <span className="ab-sep" aria-hidden="true" />
            {hero.eyebrow.right ? <span>{hero.eyebrow.right}</span> : null}
          </div>

          <motion.h1 style={{ y: heroTitleY }}>
            {hero.titlePre}
            <br />
            <span className="ab-em">{hero.titleEmphasis}</span>
            {hero.titlePost}
          </motion.h1>

          <div className="ab-hero-meta">
            <p className="ab-hero-meta-lede">{hero.lede}</p>
            <HeroStats stats={stats} />
          </div>

          {/* "This thing is alive" strip. Mono badges, ember live-dot — three
              facts that are always true and never need touching. Renders below
              the stats inside the hero container. */}
          <div className="ab-status-strip" aria-label="Club status">
            <span className="ab-status-pulse" aria-hidden="true">
              <span className="ab-status-pulse-dot" />
            </span>
            <span className="ab-status-label">ACTIVE</span>
            <span className="ab-status-sep" aria-hidden="true">·</span>
            <span>CCSU Meerut</span>
            <span className="ab-status-sep" aria-hidden="true">·</span>
            <span>since 01.01.2026</span>
            <span className="ab-status-sep" aria-hidden="true">·</span>
            <span>QOTD daily at 09:00 IST</span>
            <span className="ab-status-sep" aria-hidden="true">·</span>
            <span className="ab-status-ember">curiosity required</span>
          </div>
        </div>
      </motion.section>

      {/* THESIS */}
      <motion.section className="ab-thesis" {...sectionReveal(0)}>
        <div className="pub-container">
          {thesis.prelude ? <div className="ab-thesis-prelude">{thesis.prelude}</div> : null}
          <p className="ab-thesis-body">
            {thesisRendered}
            {thesis.small ? <span className="ab-small">{thesis.small}</span> : null}
          </p>
        </div>
      </motion.section>

      {/* MANIFESTO */}
      <motion.section className="ab-manifesto" {...sectionReveal(0)}>
        <div className="pub-container">
          <div className="ab-section-head">
            <div className="pub-eyebrow">
              <span className="pub-eyebrow-num">01</span>
              <span className="pub-eyebrow-dot" />
              {manifesto.eyebrowLabel}
            </div>
            <h2>{manifesto.headline}</h2>
            {manifesto.lede ? <p className="ab-lede">{manifesto.lede}</p> : null}
          </div>
          <div className="ab-tenets">
            {manifesto.tenets.map((t, i) => (
              <motion.div className="ab-tenet" key={`${t.num}-${t.title}`} {...sectionReveal(i)}>
                <div className="ab-tenet-num" aria-hidden="true">{t.num}</div>
                <div className="ab-tenet-body">
                  <h3>{t.title}</h3>
                  <InlineHtml as="p" html={t.body} />
                  {t.commentary ? <p className="ab-tenet-commentary">{t.commentary}</p> : null}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* STORY — aside is intentionally NOT wrapped in motion.aside; framer-motion
          leaves inline transforms that fight position: sticky in some browsers, and
          the sticky-scroll IS the animation here. */}
      <section className="ab-story">
        <div className="pub-container">
          <div className="ab-story-grid">
            <aside className="ab-story-aside">
              {story.asideEyebrow ? <div className="ab-story-aside-eyebrow">{story.asideEyebrow}</div> : null}
              <h2 className="ab-story-aside-title">
                {story.asideTitle.replace('{{months}}', monthsWord(stats.monthsSinceInception))}
              </h2>
            </aside>
            <div className="ab-story-body">
              {story.paragraphs.map((p, i) => (
                <motion.div key={i} viewport={viewportOnce} {...paragraphMotion(i)}>
                  <StoryParagraph paragraph={p} />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TEAMS — section 03 is gone (the old Timeline). Anything time-bound
          lives on /events + /achievements; About stays evergreen. */}
      <motion.section className="ab-teams" {...sectionReveal(0)}>
        <div className="pub-container">
          <div className="ab-section-head">
            <div className="pub-eyebrow">
              <span className="pub-eyebrow-num">03</span>
              <span className="pub-eyebrow-dot" />
              {teams.eyebrowLabel}
            </div>
            <h2>{teams.headline}</h2>
            {teams.lede ? <p className="ab-lede">{teams.lede}</p> : null}
          </div>
          <div className="ab-team-list">
            {teams.items.map((t, i) => (
              <MotionLink to="/team" className="ab-team-row" key={`${t.num}-${t.name}`} {...sectionReveal(i)}>
                <span className="ab-team-num">{t.num}</span>
                <div>
                  <h3>{t.name}</h3>
                  <p>{t.desc}</p>
                </div>
                <span className="ab-team-count">
                  {teamCountLabel(t, stats.teamMembers, singleUnsetCount)}
                </span>
              </MotionLink>
            ))}
          </div>
        </div>
      </motion.section>

      {/* CLOSING — role-aware CTA stack. Visitor self-selects (student /
          event-goer / external) instead of us guessing via auth state. */}
      <motion.section className="ab-close" {...sectionReveal(0)}>
        <div className="pub-container">
          {closing.eyebrow ? <div className="ab-close-eyebrow">{closing.eyebrow}</div> : null}
          <h2>
            {closing.titlePre}
            <span className="ab-em">{closing.titleEmphasis}</span>
            {closing.titlePost}
          </h2>
          {closing.body ? <p>{closing.body}</p> : null}
          <div className="ab-close-ctas">
            {closing.ctas.map((cta, i) => {
              const isPrimary = cta.primary === true;
              return (
                <MotionLink
                  key={`${cta.href}-${i}`}
                  to={cta.href}
                  className={isPrimary ? 'ab-close-cta-card ab-close-cta-card--primary' : 'ab-close-cta-card'}
                  {...sectionReveal(i)}
                  whileHover={
                    shouldReduceMotion
                      ? undefined
                      : { y: -5, transition: { duration: 0.25, ease: [0.22, 0.61, 0.36, 1] } }
                  }
                >
                  {cta.audience ? (
                    <span className="ab-close-cta-card-tag">
                      <span className="ab-close-cta-card-tag-dot" aria-hidden="true" />
                      {cta.audience}
                    </span>
                  ) : null}
                  <span className="ab-close-cta-card-label">{cta.text}</span>
                  {cta.hint ? <span className="ab-close-cta-card-hint">{cta.hint}</span> : null}
                  <span className="ab-close-cta-card-arrow" aria-hidden="true">
                    <ArrowRight size={18} />
                  </span>
                </MotionLink>
              );
            })}
          </div>
        </div>
      </motion.section>
      </div>
    </Layout>
  );
}
