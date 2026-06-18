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
const SHARE_ORIGIN = API_URL.replace(/\/api\/?$/, '');

async function captureBlob(node: HTMLElement): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(node, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
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
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState<null | 'download' | 'share'>(null);

  // Nothing worth bragging about yet — hide rather than share an empty post.
  if (!stats.currentStreak && !stats.totalSolved) return null;

  const name = user?.name ?? stats.name ?? 'code.scriet member';

  const onDownload = async () => {
    if (!cardRef.current) return;
    setBusy('download');
    try {
      const blob = await captureBlob(cardRef.current);
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
    // Open a blank tab synchronously (inside the click gesture) so the later
    // redirect survives the popup blocker after the async upload completes.
    const win = window.open('', '_blank', 'noopener,noreferrer,width=600,height=640');
    setBusy('share');
    let shareUrl = linkedInShareUrl();
    let cardAttached = false;
    // Capture → upload → persist as the user's og:image card → share that page.
    // This is a best-effort enhancement: if capture/upload/persist fails (Cloudinary
    // down, upload rejected), we fall back to the plain LinkedIn share rather than
    // aborting the whole action.
    try {
      if (cardRef.current && token && user?.id) {
        const blob = await captureBlob(cardRef.current);
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
    try {
      const copied = await copyTextToClipboard(buildStreakShareText({ ...stats, name }));
      if (win) win.location.href = shareUrl;
      else window.open(shareUrl, '_blank', 'noopener,noreferrer');
      setShared(true);
      setTimeout(() => setShared(false), 2500);
      const msg = cardAttached
        ? (copied ? 'Card added to the preview — paste the copied caption (Ctrl/Cmd+V).' : 'Card added to the preview — add your caption and post.')
        : (copied ? 'LinkedIn opened — caption copied, paste it (Ctrl/Cmd+V).' : 'LinkedIn opened — add your caption and post.');
      toast[copied ? 'success' : 'message'](msg);
    } catch {
      if (win) win.close();
      toast.error('Could not open the LinkedIn share.');
    } finally {
      setBusy(null);
    }
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
              <span style={{ fontSize: 84, fontWeight: 800, lineHeight: 1, color: '#fff' }}>{stats.currentStreak}</span>
              <span style={{ fontSize: 26, fontWeight: 600, color: '#e7633f' }}>day streak 🔥</span>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 28, fontSize: 15, color: '#d8c4b8' }}>
              {typeof stats.longestStreak === 'number' && (
                <span>Longest <b style={{ color: '#fff' }}>{stats.longestStreak}</b></span>
              )}
              {typeof stats.totalSolved === 'number' && (
                <span>Solved <b style={{ color: '#fff' }}>{stats.totalSolved}</b></span>
              )}
            </div>
          </div>

          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{name}</div>
        </div>
      </div>
    </div>
  );
}
