import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface RejectProfileDialogProps {
  target: { fullName: string } | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export function RejectProfileDialog({
  target,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  loading,
}: RejectProfileDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={() => onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-600">Reject Profile</DialogTitle>
          <DialogDescription>
            Provide a reason for rejecting {target?.fullName}'s profile. They will
            be notified via email.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="Reason for rejection (required for email notification)..."
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reject Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
