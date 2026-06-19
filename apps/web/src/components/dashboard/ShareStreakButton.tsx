// S-03 (streak share) — "Share my streak on LinkedIn" + downloadable card.
//
// LinkedIn's composer only accepts a URL (no direct image attach), so to get the
// card INTO the post we share /share/streak/:userId — a tiny server-rendered page
// whose og:image is the card (LinkedIn's crawler renders it as the link preview).
// We also offer a plain PNG download for anyone who'd rather attach it manually.
// The card is captured off-screen with html2canvas (already a dep, used in quiz).

import { useRef, useState } from 'react';
import { Linkedin, Check, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/api/_internal';
import { buildStreakShareText, linkedInShareUrl, type StreakShareStats } from '@/lib/linkedin';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

// The share page lives at the API ROOT (not under /api), e.g. api.codescriet.dev.
// Use URL.origin so this is correct for any VITE_API_URL shape (with or without a
// path prefix, versioned paths, etc.) rather than a fragile regex strip.
const SHARE_ORIGIN = (() => { try { return new URL(API_URL).origin; } catch { return API_URL.replace(/\/api\/?$/, ''); } })();

async function captureBlob(node: HTMLElement): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default;
  // Normalise the html2canvas viewport to start at the element's exact position.
  // Without this, a `position: fixed; left: -10000px` wrapper produces a blank
  // canvas because html2canvas clips to the viewport bounds at capture time.
  const { left, top } = node.getBoundingClientRect();
  const canvas = await html2canvas(node, {
    backgroundColor: null,
    scale: 2,
    useCORS: true,
    logging: false,
    scrollX: -left,
    scrollY: -top,
  });
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture failed'))), 'image/png'),
  );
}

export function ShareStreakButton({
  stats,
  className,
  label = 'Share on LinkedIn',
}: {
  stats: StreakShareStats;
  className?: string;
  label?: string;
}) {
  const { user, token } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  // Cache the last captured PNG keyed by the card's content. Share and Download
  // both need the same image; without this, doing both (or retrying) re-runs a
  // full html2canvas pass each time. Invalidates automatically when the stats or
  // name that the card renders from change (the key embeds them).
  const blobCache = useRef<{ key: string; blob: Blob } | null>(null);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState<null | 'download' | 'share'>(null);

  // Nothing worth bragging about yet — hide rather than share an empty post.
  if (!stats.currentStreak && !stats.totalSolved) return null;

  const name = user?.name ?? stats.name ?? 'code.scriet member';

  // Hero metric: a live streak leads; with no current streak but solved problems
  // we lead with the solved count instead of a deflating "0 day streak".
  const hasStreak = (stats.currentStreak ?? 0) > 0;
  const heroValue = hasStreak ? stats.currentStreak : (stats.totalSolved ?? 0);
  const heroLabel = hasStreak ? 'day streak' : 'problems solved';

  const cardKey = `${stats.currentStreak ?? ''}|${stats.longestStreak ?? ''}|${stats.totalSolved ?? ''}|${name}`;
  const getCardBlob = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error('Card not ready');
    if (blobCache.current?.key === cardKey) return blobCache.current.blob;
    const blob = await captureBlob(cardRef.current);
    blobCache.current = { key: cardKey, blob };
    return blob;
  };

  const onDownload = async () => {
    if (busy) return; // `disabled` only paints next render — guard fast double-clicks
    if (!cardRef.current) return;
    setBusy('download');
    try {
      const blob = await getCardBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'codescriet-streak.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Streak card downloaded — attach it to your post.');
    } catch {
      toast.error('Could not generate the card image.');
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    if (busy) return; // `disabled` only paints next render — guard fast double-clicks
    setBusy('share');

    // Open a REAL blank tab synchronously, inside the click gesture, so navigating it
    // after the async upload survives the popup blocker. Note: passing `noopener` in the
    // features string makes window.open return null (per the HTML spec), which would
    // defeat this entirely — so we omit it and sever the opener manually instead.
    const win = window.open('about:blank', '_blank', 'width=600,height=640');
    if (win) win.opener = null;

    // Copy the caption inside the gesture, BEFORE the upload — a clipboard write issued
    // after a slow async chain is rejected on Safari. Best-effort; reported in the toast.
    const copied = await copyTextToClipboard(buildStreakShareText({ ...stats, name }));

    let shareUrl = linkedInShareUrl();
    let cardAttached = false;
    // Capture → upload → persist as the user's og:image card → share that page.
    // Best-effort: if capture/upload/persist fails (Cloudinary down, upload rejected),
    // fall back to the plain LinkedIn share rather than aborting the whole action.
    try {
      if (cardRef.current && token && user?.id) {
        const blob = await getCardBlob();
        const file = new File([blob], 'streak.png', { type: 'image/png' });
        const cardUrl = await api.uploadImage(file, token);
        if (cardUrl) {
          await api.setStreakCard(cardUrl, token);
          shareUrl = linkedInShareUrl(`${SHARE_ORIGIN}/share/streak/${user.id}`);
          cardAttached = true;
        }
      }
    } catch {
      /* keep the generic shareUrl — card just won't appear in the preview */
    }

    // Navigate the pre-opened tab; if it was blocked (null), try a direct open as a last
    // resort. Only claim success when a tab actually opened — never lie to the user.
    let opened: boolean;
    if (win) {
      win.location.href = shareUrl;
      opened = true;
    } else {
      const fallback = window.open(shareUrl, '_blank', 'width=600,height=640');
      if (fallback) fallback.opener = null;
      opened = Boolean(fallback);
    }

    setBusy(null);
    if (!opened) {
      toast.error(copied
        ? 'Pop-up blocked — allow pop-ups, then paste the copied caption into LinkedIn.'
        : 'Pop-up blocked — allow pop-ups to share your streak (or use Download).');
      return;
    }
    setShared(true);
    setTimeout(() => setShared(false), 2500);
    const msg = cardAttached
      ? (copied ? 'Card added to the preview — paste the copied caption (Ctrl/Cmd+V).' : 'Card added to the preview — add your caption and post.')
      : (copied ? 'LinkedIn opened — caption copied, paste it (Ctrl/Cmd+V).' : 'LinkedIn opened — add your caption and post.');
    toast[copied ? 'success' : 'message'](msg);
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        type="button"
        onClick={onShare}
        disabled={busy !== null}
        title="Open LinkedIn with your streak card in the preview + a ready-made caption copied"
        className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-subtle)] px-2.5 h-7 text-[11.5px] font-medium text-[var(--ds-text-2)] hover:text-[#0a66c2] hover:border-[#0a66c2] transition-colors disabled:opacity-60"
      >
        {busy === 'share' ? <Loader2 size={12} className="animate-spin" /> : shared ? <Check size={12} /> : <Linkedin size={12} />}
        {shared ? 'Shared' : label}
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={busy !== null}
        title="Download your streak card as an image"
        aria-label="Download streak card"
        className="inline-flex items-center justify-center rounded-[8px] border border-[var(--border-subtle)] size-7 text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] transition-colors disabled:opacity-60"
      >
        {busy === 'download' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      </button>

      {/* Off-screen branded card captured for the LinkedIn preview / download.
          Inline styles (not CSS vars) so html2canvas renders it identically. */}
      <div aria-hidden className="fixed -left-[10000px] top-0 pointer-events-none">
        <div
          ref={cardRef}
          style={{
            width: 600,
            height: 315,
            background: 'linear-gradient(135deg, #17120f 0%, #241813 60%, #3a2114 100%)',
            color: '#fff',
            padding: 36,
            boxSizing: 'border-box',
            fontFamily: 'Geist, Inter, system-ui, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
              code<span style={{ color: '#e7633f' }}>.scriet</span>
            </span>
            <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c9a896' }}>
              Question of the Day
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              {/* No emoji in the hero — html2canvas rasterizes emoji inconsistently
                  across platforms, which would degrade the OG/preview image. */}
              <span style={{ fontSize: 84, fontWeight: 800, lineHeight: 1, color: '#fff' }}>{heroValue}</span>
              <span style={{ fontSize: 26, fontWeight: 600, color: '#e7633f' }}>{heroLabel}</span>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 28, fontSize: 15, color: '#d8c4b8' }}>
              {typeof stats.longestStreak === 'number' && (
                <span>Longest <b style={{ color: '#fff' }}>{stats.longestStreak}</b></span>
              )}
              {/* Skip when the solved count is already the hero metric (no streak). */}
              {hasStreak && typeof stats.totalSolved === 'number' && (
                <span>Solved <b style={{ color: '#fff' }}>{stats.totalSolved}</b></span>
              )}
            </div>
          </div>

          {/* maxWidth = card width (600) − horizontal padding (36 × 2); truncate so a
              long display name can't overflow the fixed-width card. */}
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#fff',
              maxWidth: 528,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
        </div>
      </div>
    </div>
  );
}
