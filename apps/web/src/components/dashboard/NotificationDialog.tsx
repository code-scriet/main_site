// Dashboard notification detail dialog.
// When a user clicks a broadcast/message notification in the bell, we show the
// FULL message here (rendered as Markdown, with clickable links) instead of just
// forwarding to a page — so a pasted Google Meet link, formatting, etc. survive.
// Theme-aware: the dialog portals outside the [data-dashboard] scope, so we stamp
// data-dashboard/data-accent on DialogContent to make the --ds-*/--accent tokens
// resolve inside it.

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { relativeTime } from '@/lib/dateUtils';
import type { NotifItem } from '@/lib/api';

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** http(s)/mailto/tel + site-relative only; everything else is neutered. */
function safeHref(raw?: string): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith('/') || v.startsWith('#')) return v;
  try {
    const u = new URL(v, 'https://codescriet.dev');
    return SAFE_PROTOCOLS.has(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function isExternal(link: string): boolean {
  return /^https?:\/\//i.test(link) || link.startsWith('//');
}

function linkLabel(link: string): string {
  if (isExternal(link)) return 'Open link';
  if (link.startsWith('/events/')) return 'Open event page';
  if (link.startsWith('/polls/')) return 'Open poll';
  if (link.startsWith('/qotd')) return 'Open QOTD';
  if (link.startsWith('/dashboard/invitations')) return 'View invitation';
  if (link.startsWith('/verify/')) return 'View certificate';
  if (link.startsWith('/quiz')) return 'Join quiz';
  return 'Open';
}

const mdComponents: Components = {
  p: ({ children }) => <p className="mb-2.5 text-[13.5px] leading-relaxed text-[var(--ds-text-2)] last:mb-0">{children}</p>,
  a: ({ href, children }) => {
    const h = safeHref(href);
    if (!h) return <span>{children}</span>;
    const ext = isExternal(h);
    return (
      <a
        href={h}
        target={ext ? '_blank' : undefined}
        rel={ext ? 'noopener noreferrer' : undefined}
        className="break-words font-medium text-[var(--accent,#c2410c)] underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong className="font-semibold text-[var(--ds-text-1)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-[var(--ds-text-3)] line-through">{children}</del>,
  ul: ({ children }) => <ul className="mb-2.5 ml-5 list-disc space-y-1 text-[13.5px] text-[var(--ds-text-2)]">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2.5 ml-5 list-decimal space-y-1 text-[13.5px] text-[var(--ds-text-2)]">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="mb-1.5 mt-3 text-[15px] font-semibold text-[var(--ds-text-1)] first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1.5 mt-3 text-[14px] font-semibold text-[var(--ds-text-1)] first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-2.5 text-[13.5px] font-semibold text-[var(--ds-text-1)] first:mt-0">{children}</h4>,
  code: ({ children }) => <code className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--ds-text-1)]">{children}</code>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-[var(--accent,#c2410c)] pl-3 italic text-[var(--ds-text-3)]">{children}</blockquote>,
  hr: () => <hr className="my-3 border-[var(--border-subtle)]" />,
};

interface Props {
  item: NotifItem | null;
  accent?: string;
  onClose: () => void;
  onOpenLink: (link: string) => void;
}

export function NotificationDialog({ item, accent = 'rust', onClose, onOpenLink }: Props) {
  const body = item?.body ?? '';
  const link = item?.link;

  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-dashboard="true" data-accent={accent} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6 text-[15px] leading-snug text-[var(--ds-text-1)]">{item?.title}</DialogTitle>
          {item?.timestamp && (
            <div className="text-[11px] font-mono tabular-nums text-[var(--ds-text-3)]">{relativeTime(item.timestamp)}</div>
          )}
        </DialogHeader>

        <div className="-mx-1 max-h-[55vh] overflow-y-auto px-1">
          {body.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{body}</ReactMarkdown>
          ) : (
            <p className="text-[13.5px] text-[var(--ds-text-3)]">No additional details.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {link && (
            <Button size="sm" onClick={() => { onOpenLink(link); onClose(); }} className="gap-1.5">
              {linkLabel(link)}
              {isExternal(link) && <ExternalLink className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
