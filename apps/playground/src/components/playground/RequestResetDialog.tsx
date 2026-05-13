import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { mainApi, type PlaygroundLimitResetRequest } from '@/lib/mainApi';

interface RequestResetDialogProps {
  open: boolean;
  pendingRequest?: PlaygroundLimitResetRequest | null;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

function relativeTime(value?: string | null): string {
  if (!value) return 'just now';
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} day ago`;
}

export function RequestResetDialog({ open, pendingRequest, onOpenChange, onSent }: RequestResetDialogProps) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSend = async () => {
    setSending(true);
    try {
      await mainApi.requestPlaygroundReset(note);
      toast.success('Reset request sent');
      setNote('');
      await onSent?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reset request');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-zinc-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded border border-zinc-200 bg-warmwhite shadow-2xl dark:border-zinc-800 dark:bg-inknight">
        <div className="flex items-start justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <h2 className="font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Ask an admin to reset your daily limit
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Admins can grant a same-day reset. A short note helps them say yes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {pendingRequest ? (
            <div className="rounded border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              Request sent {relativeTime(pendingRequest.createdAt)} · waiting for admin
            </div>
          ) : (
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Optional note, for example: practicing for today's contest and hit the cap."
              className="min-h-[120px] resize-none border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={Boolean(pendingRequest) || sending}
            className="bg-amber-400 text-amber-950 hover:bg-amber-300"
          >
            {pendingRequest ? 'Already requested' : sending ? 'Sending...' : 'Send request'}
          </Button>
        </div>
      </div>
    </div>
  );
}
