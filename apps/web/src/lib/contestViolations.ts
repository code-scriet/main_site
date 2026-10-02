// Human-readable proctor-violation labels for the admin live monitor. The raw enum
// (BLUR / HIDDEN / COPY_PASTE / OTHER…) is for the wire; invigilators read plain English
// ("Switched tab", "Pasted code"). `detail` narrows COPY_PASTE (copy/cut/paste) and the
// OTHER bucket (dev-tools / print / right-click / …). Mirror of the arena's toast labels.

import type { CompetitionViolationKind } from '@/lib/api';

export type ViolationTone = 'danger' | 'warning';

export interface ViolationLabel {
  label: string;
  tone: ViolationTone;
}

export function violationLabel(kind: CompetitionViolationKind | string, detail?: string | null): ViolationLabel {
  const d = (detail ?? '').toLowerCase();
  switch (kind) {
    case 'HIDDEN':
      return { label: 'Switched tab / minimised', tone: 'danger' };
    case 'BLUR':
      return { label: 'Left the contest window', tone: 'danger' };
    case 'FULLSCREEN_EXIT':
      return { label: 'Exited fullscreen', tone: 'danger' };
    case 'COPY_PASTE':
      if (d === 'copy') return { label: 'Copied code', tone: 'danger' };
      if (d === 'cut') return { label: 'Cut code', tone: 'danger' };
      if (d === 'paste') return { label: 'Pasted code', tone: 'danger' };
      return { label: 'Copy / paste', tone: 'danger' };
    case 'CLICK_OUT':
      return { label: 'Clicked outside', tone: 'warning' };
    case 'OTHER':
      if (d.includes('devtool') || d.includes('inspect') || d === 'f12') return { label: 'Opened dev tools', tone: 'warning' };
      if (d.includes('right-click') || d.includes('context')) return { label: 'Right-click menu', tone: 'warning' };
      if (d.includes('print')) return { label: 'Tried to print', tone: 'warning' };
      if (d.includes('view-source') || d.includes('source')) return { label: 'Viewed page source', tone: 'warning' };
      if (d.includes('save')) return { label: 'Tried to save page', tone: 'warning' };
      if (d.includes('new-tab') || d.includes('new-window')) return { label: 'Tried to open a new tab', tone: 'warning' };
      return { label: detail ? `Flagged: ${detail}` : 'Suspicious action', tone: 'warning' };
    default:
      return { label: String(kind), tone: 'warning' };
  }
}
