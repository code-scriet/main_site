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

interface DeleteSignatoryDialogProps {
  target: { id: string; name: string } | null;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}

export function DeleteSignatoryDialog({ target, onCancel, onConfirm }: DeleteSignatoryDialogProps) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete saved signature?</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `This will delete "${target.name}" unless it is referenced by existing certificates, in which case it will be deactivated.`
              : 'This signature will be removed from the certificate picker.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              if (target) {
                onConfirm(target.id);
              }
            }}
          >
            Delete Signature
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
