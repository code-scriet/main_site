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

interface LimitResetDialogProps {
  target: { userId: string; userName: string } | null;
  onCancel: () => void;
  onConfirm: (userId: string, userName: string) => void;
}

export function ResetPlaygroundLimitDialog({ target, onCancel, onConfirm }: LimitResetDialogProps) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset playground limit?</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `This will reset today's playground execution allowance for ${target.userName}.`
              : 'This will reset today’s playground execution allowance for the selected user.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (target) onConfirm(target.userId, target.userName);
            }}
          >
            Reset Limit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DeleteUserDialogProps {
  target: { userId: string; userName: string; userRole: string } | null;
  onCancel: () => void;
  onConfirm: (userId: string, userName: string, userRole: string) => void;
}

export function DeleteUserDialog({ target, onCancel, onConfirm }: DeleteUserDialogProps) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user account?</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `This will permanently delete ${target.userName}'s account and cannot be undone.`
              : 'This user account will be permanently deleted.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              if (target) onConfirm(target.userId, target.userName, target.userRole);
            }}
          >
            Delete User
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface RoleChangeDialogProps {
  target: { userId: string; userName: string; currentRole: string; newRole: string } | null;
  onCancel: () => void;
  onConfirm: (userId: string, newRole: string) => void;
}

export function RoleChangeDialog({ target, onCancel, onConfirm }: RoleChangeDialogProps) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change user role?</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `${target.userName}: ${target.currentRole} to ${target.newRole}. This changes their dashboard permissions immediately.`
              : 'This changes the selected user role immediately.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (target) onConfirm(target.userId, target.newRole);
            }}
          >
            Confirm Role Change
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
