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
import type { CompetitionRound } from '@/lib/api';

export type RoundActionType = 'start' | 'lock' | 'delete';

interface RoundActionDialogProps {
  action: { action: RoundActionType; round: CompetitionRound } | null;
  onCancel: () => void;
  onConfirm: (action: { action: RoundActionType; round: CompetitionRound }) => void;
}

export function RoundActionDialog({ action, onCancel, onConfirm }: RoundActionDialogProps) {
  return (
    <AlertDialog open={Boolean(action)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action?.action === 'start'
              ? 'Start round?'
              : action?.action === 'lock'
                ? 'Lock round now?'
                : 'Delete round?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action?.action === 'start' && 'Contestants will be able to see the editor and the countdown timer will begin.'}
            {action?.action === 'lock' && 'All unsaved work will be auto-submitted and contestants will no longer be able to edit.'}
            {action?.action === 'delete' && (
              action.round
                ? `This will permanently delete "${action.round.title}".`
                : 'This round will be permanently deleted.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={action?.action === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
            onClick={() => {
              if (action) onConfirm(action);
            }}
          >
            {action?.action === 'start'
              ? 'Start Round'
              : action?.action === 'lock'
                ? 'Lock Round'
                : 'Delete Round'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
