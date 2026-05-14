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

interface DeleteProblemDialogProps {
  target: { id: string; title: string } | null;
  onCancel: () => void;
  onConfirm: (id: string) => void;
  pending: boolean;
}

export function DeleteProblemDialog({ target, onCancel, onConfirm, pending }: DeleteProblemDialogProps) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete problem?</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `This will delete "${target.title}". This will also break any active QOTD or competition using this problem.`
              : 'This will delete the selected problem.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            disabled={pending}
            onClick={() => {
              if (target) onConfirm(target.id);
            }}
          >
            {pending ? 'Deleting...' : 'Delete Problem'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
