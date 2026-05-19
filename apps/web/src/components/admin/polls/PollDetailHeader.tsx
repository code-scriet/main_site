import { Link } from 'react-router-dom';
import { Copy, Download, Loader2, Pencil, Trash2 } from 'lucide-react';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AdminPollDetail } from '@/lib/api';

interface PollDetailHeaderProps {
  poll: AdminPollDetail;
  onCopyLink: () => void;
  onExport: () => void;
  onEdit: () => void;
  onDelete: () => void;
  exporting: boolean;
  saving: boolean;
}

export function PollDetailHeader({
  poll,
  onCopyLink,
  onExport,
  onEdit,
  onDelete,
  exporting,
  saving,
}: PollDetailHeaderProps) {
  return (
    <CardHeader className="border-b border-[var(--border-subtle)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={poll.isClosed ? 'secondary' : 'success'}>
              {poll.isClosed ? 'Closed' : 'Open'}
            </Badge>
            {!poll.isPublished && <Badge variant="outline">Draft</Badge>}
            <Badge variant="outline">{poll.options.length === 0 ? 'Question' : 'Normal'}</Badge>
            <Badge variant="outline">
              {poll.allowMultipleChoices ? 'Multiple choice' : 'Single choice'}
            </Badge>
            <Badge variant="outline">{poll.isAnonymous ? 'Anonymous' : 'Named'}</Badge>
          </div>
          <div>
            <CardTitle className="text-2xl text-gray-950">{poll.question}</CardTitle>
            <CardDescription className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ds-text-2)]">
              {poll.description || 'No description added.'}
            </CardDescription>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onCopyLink}>
            <Copy className="h-4 w-4" />
            Copy link
          </Button>
          <Link to={`/polls/${poll.slug}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">Open public page</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    </CardHeader>
  );
}
