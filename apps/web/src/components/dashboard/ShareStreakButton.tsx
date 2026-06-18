// S-03 (streak share) — one-click "Share my streak on LinkedIn".
//
// LinkedIn's share composer only accepts a URL (it dropped text prefill years
// ago), so a fully-templated post via URL alone isn't possible. The proven
// pattern, used here: open the composer to our site (one click) AND copy a
// ready-made caption to the clipboard so the member just pastes it. Honest about
// the two-step, but effectively one click + one paste.

import { useState } from 'react';
import { Linkedin, Check } from 'lucide-react';
import { toast } from 'sonner';
import { buildStreakShareText, linkedInShareUrl, type StreakShareStats } from '@/lib/linkedin';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

export function ShareStreakButton({
  stats,
  className,
  label = 'Share on LinkedIn',
}: {
  stats: StreakShareStats;
  className?: string;
  label?: string;
}) {
  const [shared, setShared] = useState(false);

  // Nothing worth bragging about yet — hide rather than share an empty post.
  if (!stats.currentStreak && !stats.totalSolved) return null;

  const onShare = async () => {
    // Open the composer synchronously inside the click gesture FIRST — an awaited
    // clipboard write before window.open loses the user-gesture context and trips
    // popup blockers. The clipboard copy follows; the toast reports its result.
    window.open(linkedInShareUrl(), '_blank', 'noopener,noreferrer,width=600,height=640');
    const copied = await copyTextToClipboard(buildStreakShareText(stats));
    setShared(true);
    setTimeout(() => setShared(false), 2500);
    toast[copied ? 'success' : 'message'](
      copied
        ? 'Caption copied — paste it into your LinkedIn post (Ctrl/Cmd+V).'
        : 'LinkedIn opened — add your caption and post.',
    );
  };

  return (
    <button
      type="button"
      onClick={onShare}
      title="Open LinkedIn and copy a ready-made caption about your streak"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-subtle)] px-2.5 h-7 text-[11.5px] font-medium text-[var(--ds-text-2)] hover:text-[#0a66c2] hover:border-[#0a66c2] transition-colors',
        className,
      )}
    >
      {shared ? <Check size={12} /> : <Linkedin size={12} />}
      {shared ? 'Shared' : label}
    </button>
  );
}
