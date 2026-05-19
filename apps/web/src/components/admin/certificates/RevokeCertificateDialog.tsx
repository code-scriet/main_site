import { Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface RevokeCertificateDialogProps {
  target: { certId: string; recipientName: string } | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  revoking: boolean;
}

export function RevokeCertificateDialog({
  target,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  revoking,
}: RevokeCertificateDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            Revoke Certificate
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-[var(--ds-text-2)]">
            Are you sure you want to revoke certificate{' '}
            <strong className="font-mono">{target?.certId}</strong> for{' '}
            <strong>{target?.recipientName}</strong>?
            This action cannot be undone.
          </p>
          <div>
            <label htmlFor="admin-certificates-revoke-reason" className="text-sm font-medium text-[var(--ds-text-2)]">
              Reason (optional)
            </label>
            <Input
              id="admin-certificates-revoke-reason"
              value={reason}
              onChange={e => onReasonChange(e.target.value)}
              placeholder="Reason for revocation"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={revoking}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {revoking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
            {revoking ? 'Revoking…' : 'Revoke'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
