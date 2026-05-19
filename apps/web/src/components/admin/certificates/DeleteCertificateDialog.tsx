import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeleteCertificateDialogProps {
  target: { certId: string; recipientName: string } | null;
  onCancel: () => void;
  onConfirm: () => void;
  deleting: boolean;
}

export function DeleteCertificateDialog({
  target,
  onCancel,
  onConfirm,
  deleting,
}: DeleteCertificateDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Delete Certificate
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-[var(--ds-text-2)]">
            Are you sure you want to <strong>permanently delete</strong> certificate{' '}
            <strong className="font-mono">{target?.certId}</strong> for{' '}
            <strong>{target?.recipientName}</strong>?
          </p>
          <p className="text-sm text-red-600 font-medium bg-red-50 p-2 rounded border border-red-100">
            This will completely remove it from the database and invalidate the local PDF mapping.
            This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
