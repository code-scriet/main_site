// Dashboard notification detail dialog.
// When a user clicks a broadcast/message notification in the bell, we show the
// FULL message here (rendered as Markdown, with clickable links) instead of just
// forwarding to a page — so a pasted Google Meet link, formatting, etc. survive.
// Theme-aware: the dialog portals outside the [data-dashboard] scope, so we stamp
// data-dashboard/data-accent on DialogContent to make the --ds-*/--accent tokens
// resolve inside it.

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { relativeTime } from '@/lib/dateUtils';
import type { NotifItem } from '@/lib/api';
import { MarkdownMessage, isExternal } from './MarkdownMessage';

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
            <MarkdownMessage>{body}</MarkdownMessage>
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
