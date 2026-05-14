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

interface DeleteProfileDialogProps {
  target: { fullName: string } | null;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export function DeleteProfileDialog({
  target,
  onCancel,
  onConfirm,
  loading,
}: DeleteProfileDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={() => onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-600">Delete Profile</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete {target?.fullName}'s profile? This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
