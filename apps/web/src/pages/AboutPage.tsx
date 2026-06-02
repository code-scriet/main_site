import { Fragment, type ElementType } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { useAboutPageData } from '@/hooks/useAboutPageData';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import type { AboutPageStats } from '@/hooks/useAboutPageData';
import { monthsWord, type AboutStoryParagraph, type AboutTeamItem } from '@/lib/aboutContent';

// Render admin-authored text that may contain a small set of inline HTML tags
// (<strong>, <em>, <br>, <span class="ab-em">) — the same tags the admin's
// RichTextarea toolbar inserts. Settings is super-admin/PRESIDENT-only, so the
// trust model accepts dangerouslySetInnerHTML here. Plain strings render too.
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
 * Render a paragraph from the story section. Strong/em tags from the JSON
 * content are intentionally preserved (sanitised by the admin's structured
 * editor, not by the public render path).
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
  const { shouldReduceMotion } = useMotionConfig();
  const { hero, thesis, manifesto, story, teams, closing } = content;

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

      {/* HERO */}
      <section className="ab-hero">
        <div className="pub-container">
          <div className="ab-hero-eyebrow-row">
            {hero.eyebrow.left ? <span className="ab-ember">{hero.eyebrow.left}</span> : null}
            <span className="ab-sep" aria-hidden="true" />
            {hero.eyebrow.middle ? <span>{hero.eyebrow.middle}</span> : null}
            <span className="ab-sep" aria-hidden="true" />
            {hero.eyebrow.right ? <span>{hero.eyebrow.right}</span> : null}
          </div>

          <h1>
            {hero.titlePre}
            <br />
            <span className="ab-em">{hero.titleEmphasis}</span>
            {hero.titlePost}
          </h1>

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
      </section>

      {/* THESIS */}
      <section className="ab-thesis">
        <div className="pub-container">
          {thesis.prelude ? <div className="ab-thesis-prelude">{thesis.prelude}</div> : null}
          <p className="ab-thesis-body">
            {thesisRendered}
            {thesis.small ? <span className="ab-small">{thesis.small}</span> : null}
          </p>
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="ab-manifesto">
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
            {manifesto.tenets.map((t) => (
              <div className="ab-tenet" key={`${t.num}-${t.title}`}>
                <div className="ab-tenet-num" aria-hidden="true">{t.num}</div>
                <div className="ab-tenet-body">
                  <h3>{t.title}</h3>
                  <InlineHtml as="p" html={t.body} />
                  {t.commentary ? <p className="ab-tenet-commentary">{t.commentary}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
      <section className="ab-teams">
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
            {teams.items.map((t) => (
              <Link to="/team" className="ab-team-row" key={`${t.num}-${t.name}`}>
                <span className="ab-team-num">{t.num}</span>
                <div>
                  <h3>{t.name}</h3>
                  <p>{t.desc}</p>
                </div>
                <span className="ab-team-count">
                  {teamCountLabel(t, stats.teamMembers, singleUnsetCount)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING — role-aware CTA stack. Visitor self-selects (student /
          event-goer / external) instead of us guessing via auth state. */}
      <section className="ab-close">
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
                <Link
                  key={`${cta.href}-${i}`}
                  to={cta.href}
                  className={isPrimary ? 'ab-close-cta-card ab-close-cta-card--primary' : 'ab-close-cta-card'}
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
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </Layout>
  );
}
