import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { PendingNetworkUser } from '@/lib/api';

export type PendingUserActionType = 'revert' | 'delete';

interface PendingUserActionDialogProps {
  action: { type: PendingUserActionType; pendingUser: PendingNetworkUser } | null;
  onCancel: () => void;
  onConfirm: (action: { type: PendingUserActionType; pendingUser: PendingNetworkUser }) => void;
}

export function PendingUserActionDialog({
  action,
  onCancel,
  onConfirm,
}: PendingUserActionDialogProps) {
  return (
    <AlertDialog open={Boolean(action)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action?.type === 'revert'
              ? 'Move user back to normal flow?'
              : 'Delete pending onboarding account?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action?.type === 'revert' && action?.pendingUser
              ? `${action.pendingUser.email} will no longer appear in pending onboarding.`
              : action?.pendingUser
                ? `This will permanently delete ${action.pendingUser.email}.`
                : 'Confirm this pending user action.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={action?.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
            onClick={() => {
              if (action) onConfirm(action);
            }}
          >
            {action?.type === 'revert' ? 'Move to Users' : 'Delete Account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
