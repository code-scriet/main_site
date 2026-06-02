// About-page content — code-managed source of truth.
//
// Hard rule: this page never names a specific event, achievement, or
// time-bound milestone. Those facts live on /events and /achievements and
// would rot here within weeks. About is about WHO we are — values, structure,
// the rhythm of work. The one exception is the founding-era Git/GitHub
// workshop, kept as a single proof-point for the "freedom to host" mechanic;
// the description focuses on the mechanic, not the event.

export interface AboutHero {
  /** Eyebrow strip above the headline. Empty strings are skipped. */
  eyebrow: { left: string; middle: string; right: string };
  /** Headline split into a plain part and an italic ember part. */
  titlePre: string;
  titleEmphasis: string;
  titlePost: string;
  /** Editorial lede next to the stat cells. */
  lede: string;
}

export interface AboutThesis {
  prelude: string;
  body: string;
  /** The italic ember-coloured fragment inside `body`, located by lookup. */
  emphasis: string;
  small: string;
}

export interface AboutTenet {
  num: string;
  title: string;
  body: string;
  /** Optional `// dev comment` style one-liner under the body. Adds personality without bloating the tenet. */
  commentary?: string;
}

export interface AboutManifesto {
  eyebrowLabel: string;
  headline: string;
  lede: string;
  tenets: AboutTenet[];
}

export interface AboutStoryParagraph {
  /** Plain text — light HTML allowed (<strong>, <em>). Sanitised at render. */
  html: string;
  /** When true, render as a pull-quote with a `cite`. */
  isPull?: boolean;
  cite?: string;
}

export interface AboutStory {
  asideEyebrow: string;
  asideTitle: string;
  paragraphs: AboutStoryParagraph[];
}

export interface AboutTeamItem {
  num: string;
  name: string;
  desc: string;
  /** Manual count. Set to null to omit. */
  count: number | null;
}

export interface AboutTeams {
  eyebrowLabel: string;
  headline: string;
  lede: string;
  items: AboutTeamItem[];
}

export interface AboutClosingCta {
  text: string;
  href: string;
  /** One-line hint shown under the CTA label. */
  hint?: string;
  /** Corner-tag identifying which audience this CTA is for ("FOR STUDENTS", "FOR PARTNERS", etc.). */
  audience?: string;
  /** When true, render as the prominent primary button. Exactly one CTA should be primary. */
  primary?: boolean;
}

export interface AboutClosing {
  eyebrow: string;
  titlePre: string;
  titleEmphasis: string;
  titlePost: string;
  body: string;
  /** Role-aware CTA stack (student / event-goer / external). One should be primary. */
  ctas: AboutClosingCta[];
}

export interface AboutPageContent {
  hero: AboutHero;
  thesis: AboutThesis;
  manifesto: AboutManifesto;
  story: AboutStory;
  teams: AboutTeams;
  closing: AboutClosing;
}

/**
 * Default content — direct & punchy voice; serves prospective members and
 * external visitors equally. All time-bound material (specific events,
 * achievement counts, named milestones) is deliberately absent.
 */
export const DEFAULT_ABOUT_CONTENT: AboutPageContent = {
  hero: {
    eyebrow: { left: '§ About', middle: 'Founded 1 January 2026', right: 'SCRIET, Meerut' },
    titlePre: 'Where curiosity meets ',
    titleEmphasis: 'code',
    titlePost: '.',
    lede:
      "Students at SCRIET who learn together, ship in public, and back each other's wild ideas. Built for real-world skills. Run by the people who use it.",
  },
  thesis: {
    prelude: '§ Why we exist',
    body:
      "SCRIET didn't have a coding club focused on real-world skills. So we built one — to bring the campus's most curious technologists into one room, learn in public, and ship things that actually run.",
    emphasis: 'real-world skills',
    small:
      "code.scriet isn't a placement-prep cell or a workshop schedule. It's where the line on the resume comes from — assuming you put in the work.",
  },
  manifesto: {
    eyebrowLabel: 'Manifesto',
    headline: 'Six things we believe.',
    lede:
      "None of these came from a workshop. They came from arguments, regrets, and the kind of small decisions that compound.",
    tenets: [
      {
        num: '01',
        title: 'Curiosity beats credentials. Every time.',
        body:
          "If you're not curious, the rest of this list won't fit. We pick people for it. We promote for it. Stay restless or stay home.",
        commentary: '// promotion criterion. literally.',
      },
      {
        num: '02',
        title: 'QOTD is the heartbeat.',
        body:
          "A new problem at 9 AM IST. Solved before you sleep. The streak isn't for points — it's the discipline of showing up to your own practice, daily.",
        commentary: '// open /qotd at 9 AM IST. do not skip.',
      },
      {
        num: '03',
        title: 'Build it before you talk about it.',
        body:
          "Talking about a project is fine. Talking about it more than a week before there's code in a repo is not. Ship the smallest version. Iterate.",
        commentary: '// see also: stop arguing about the framework.',
      },
      {
        num: '04',
        title: 'Code review without ego.',
        body:
          'Specific feedback or no feedback. No titles in the comment thread. The point is to ship better code — not to be right in front of the room.',
        commentary: '// "lgtm" without reading is a fireable offense.',
      },
      {
        num: '05',
        title: 'The newest member can argue with the oldest.',
        body:
          "And walk away with the room's respect. This is load-bearing, not aspirational. We hire and promote people who can be wrong out loud.",
        commentary: '// the room weighs the argument, not the badge.',
      },
      {
        num: '06',
        title: 'Take people with you.',
        body:
          "Help the next first-year before they ask. Run the session you wish someone had run for you. The dot in code.scriet is a stop — for breath, and for thanks.",
        commentary: '// the dot is intentional. so is this rule.',
      },
    ],
  },
  story: {
    asideEyebrow: '§ 02 · How we work',
    asideTitle: 'The rhythm.',
    paragraphs: [
      {
        html:
          '<strong>The daily heartbeat.</strong> A new problem drops at 9 AM IST. Members race to solve it before they sleep. The streak counter on each profile is the only leaderboard anyone actually checks — and the only one that matters.',
      },
      {
        html:
          "<strong>Code without ego.</strong> Every line gets read by at least one other member before it ships. Seniors don't wait to be asked to pair — they pair. Feedback is specific or it isn't given. Being right is the second-best outcome of a review; the first is shipping better code.",
      },
      {
        html: 'Curiosity beats credentials. Every time.',
        isPull: true,
        cite: '— the only line we agree on without arguing',
      },
      {
        html:
          "<strong>Freedom to ship anything.</strong> If a member wants to run a workshop, host a meetup, or start a side project under the club's name — they pitch it, we back it. We handle the college paperwork, book the lab, announce it through our channels. The member keeps complete creative control. That's how the Git &amp; GitHub workshop happened. It's how the next thing will happen too.",
      },
      {
        html:
          "<strong>What we are not.</strong> Not a placement-prep cell. Not a workshop schedule someone hands out. Not a Discord server with a logo. If you came looking for resume bullets, the door is the same one you used to come in.",
      },
      {
        html:
          'What we have actually shipped, won, and run lives on its own pages — <strong>/events</strong>, <strong>/achievements</strong>, <strong>/team</strong>. This one is about how the inside feels.',
      },
    ],
  },
  teams: {
    eyebrowLabel: 'Structure',
    headline: 'Six teams. One club.',
    lede:
      "Each team owns a slice. You apply to one. You can rotate after a semester if it doesn't fit.",
    items: [
      {
        num: '01',
        name: 'Core',
        desc:
          'The leadership team — president, vice-president, and the small group that carries the institutional memory. Sets direction, doesn\'t micromanage.',
        count: null,
      },
      {
        num: '02',
        name: 'Technical',
        desc:
          'Engineers who build the platform — the QOTD pipeline, the dashboard, the certificate system, the playground. Real production code on a real stack.',
        count: null,
      },
      {
        num: '03',
        name: 'DSA Champs',
        desc:
          'The competitive programmers. Mock contests, contest prep, and the bench for inter-college rounds. Practice loud, win quiet.',
        count: null,
      },
      {
        num: '04',
        name: 'Designing',
        desc: "Brand, posters, web. Anything the club has shipped — this team made it look right. Visual quality is non-negotiable.",
        count: null,
      },
      {
        num: '05',
        name: 'Social Media',
        desc:
          'Instagram, LinkedIn, the campus group chats. The voice of the club outside our four walls. We sound like ourselves, not like a brand.',
        count: null,
      },
      {
        num: '06',
        name: 'Management',
        desc: 'The reason events happen on time. Coordination, vendors, logistics, follow-through. Invisible when it works — which is most of the time.',
        count: null,
      },
    ],
  },
  closing: {
    eyebrow: '§ Still reading?',
    titlePre: 'So — which one are ',
    titleEmphasis: 'you',
    titlePost: '?',
    body:
      "Three doors. Pick whichever fits. The wrong one still gets you in the room.",
    ctas: [
      {
        audience: 'For students',
        text: 'Apply to join',
        href: '/join-us',
        hint: 'Twelve minutes. The next round is open.',
        primary: true,
      },
      {
        audience: 'For attendees',
        text: 'Coming to an event',
        href: '/events',
        hint: "See what's on. RSVP if you're in.",
      },
      {
        audience: 'For partners',
        text: 'Building or sponsoring with us',
        href: '/contact',
        hint: 'Reach the core team directly.',
      },
    ],
  },
};

/**
 * Date the club went live. Drives the "months since inception" stat on /about.
 * Change here if the founding date ever needs adjusting.
 */
export const LAUNCH_DATE = new Date('2026-01-01T00:00:00.000Z');

/** Inclusive months count from the launch date to today (min 0). */
export function monthsSinceLaunch(launchIsoDate: string | Date | null | undefined = LAUNCH_DATE): number {
  if (!launchIsoDate) return 0;
  const launch = typeof launchIsoDate === 'string' ? new Date(launchIsoDate) : launchIsoDate;
  if (Number.isNaN(launch.getTime())) return 0;
  const now = new Date();
  const months = (now.getFullYear() - launch.getFullYear()) * 12 + (now.getMonth() - launch.getMonth());
  return Math.max(0, months);
}

const NUMBER_WORDS = [
  '', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];

/**
 * Format a month count as English copy: "month" (0/1) | "two months" | … | "twelve months" | "13 months".
 * Kept for the hero "Age" stat label and any future copy that needs a derived months phrase.
 */
export function monthsWord(n: number): string {
  if (n <= 1) return 'month';
  const word = n <= 12 ? NUMBER_WORDS[n] : String(n);
  return `${word} months`;
}
