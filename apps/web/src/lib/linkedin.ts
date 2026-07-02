// S-03 — "Add to LinkedIn profile" deep link.
// LinkedIn exposes a free, no-API endpoint that opens its "Add licenses &
// certifications" form pre-filled. One click puts a code.scriet credential on a
// member's profile, with the verification URL pointing recruiters back to us.
// Docs: https://addtoprofile.linkedin.com/

const CERT_TYPE_LABEL: Record<string, string> = {
  PARTICIPATION: 'Participation',
  COMPLETION: 'Completion',
  WINNER: 'Achievement',
  SPEAKER: 'Speaker',
  APPRECIATION: 'Appreciation',
};

export function linkedInAddCertUrl(opts: {
  certId: string;
  type: string;
  eventName?: string | null;
  issuedAt?: string;
}): string {
  const typeLabel = CERT_TYPE_LABEL[opts.type] ?? 'Certificate';
  // The credential title shown on the profile, e.g. "DSA Contest — Achievement".
  const name = [opts.eventName?.trim(), typeLabel].filter(Boolean).join(' — ') || 'code.scriet Certificate';
  const certUrl = `${window.location.origin}/verify/${opts.certId}`;

  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name,
    organizationName: 'code.scriet',
    certUrl,
    certId: opts.certId,
  });

  // Pre-fill the issue month/year when we know it (LinkedIn expects 1-based month).
  if (opts.issuedAt) {
    const d = new Date(opts.issuedAt);
    if (!Number.isNaN(d.getTime())) {
      params.set('issueYear', String(d.getFullYear()));
      params.set('issueMonth', String(d.getMonth() + 1));
    }
  }

  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

// ── Share a coding milestone (streak + problems solved) on LinkedIn ──────────
// LinkedIn's `share-offsite` composer only accepts a `url` (it pulls the link's
// OG card; it deliberately dropped text/summary prefill years ago). So a true
// "one-click templated post" isn't possible through the URL alone — the proven
// pattern is: open the composer to our site URL (one click) AND hand the user a
// ready-made caption to paste. buildStreakShareText is that caption.

export const CLUB_SHARE_URL = 'https://codescriet.dev';

export interface StreakShareStats {
  currentStreak: number;
  longestStreak?: number;
  totalSolved?: number;
  name?: string | null;
}

// The ready-to-paste caption. Kept first-person, specific, and honest about the
// numbers; ends with the club link + hashtags recruiters search.
export function buildStreakShareText(stats: StreakShareStats): string {
  const lines: string[] = [];
  if (stats.currentStreak > 0) {
    lines.push(`🔥 ${stats.currentStreak}-day problem-solving streak on code.scriet — showing up every single day.`);
  } else {
    lines.push('Sharpening my problem-solving with code.scriet, CCSU\'s coding club.');
  }
  const bits: string[] = [];
  if (typeof stats.totalSolved === 'number' && stats.totalSolved > 0) {
    bits.push(`${stats.totalSolved} problem${stats.totalSolved === 1 ? '' : 's'} solved`);
  }
  if (typeof stats.longestStreak === 'number' && stats.longestStreak > stats.currentStreak) {
    bits.push(`longest streak ${stats.longestStreak} days`);
  }
  if (bits.length > 0) lines.push(bits.join(' · '));
  lines.push('');
  lines.push('One problem a day, every day. Come build with us 👇');
  lines.push(CLUB_SHARE_URL);
  lines.push('');
  lines.push('#coding #dsa #competitiveprogramming #codescriet #CCSU');
  return lines.join('\n');
}

// The LinkedIn feed composer for a given URL (one click → composer opens with our
// OG card). `?utm_*` lets us see share-driven traffic without extra tooling.
export function linkedInShareUrl(url: string = `${CLUB_SHARE_URL}/?utm_source=linkedin&utm_medium=social&utm_campaign=streak_share`): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}
