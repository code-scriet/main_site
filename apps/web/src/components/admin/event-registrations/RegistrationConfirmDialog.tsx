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

export type ConfirmDialogTarget =
  | { type: 'event'; eventId: string; eventTitle: string }
  | { type: 'registration'; eventId: string; registrationId: string; userName: string }
  | { type: 'team'; eventId: string; teamId: string; teamName: string };

interface RegistrationConfirmDialogProps {
  target: ConfirmDialogTarget | null;
  onCancel: () => void;
  onConfirm: (target: ConfirmDialogTarget) => void;
}

export function RegistrationConfirmDialog({
  target,
  onCancel,
  onConfirm,
}: RegistrationConfirmDialogProps) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target?.type === 'event'
              ? 'Delete event?'
              : target?.type === 'team'
                ? 'Dissolve team?'
                : 'Remove registration?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target?.type === 'event' && (
              `This will permanently delete "${target.eventTitle}" and remove all registrations for this event.`
            )}
            {target?.type === 'team' && (
              `This will dissolve "${target.teamName}" and cancel all member registrations.`
            )}
            {target?.type === 'registration' && (
              `This will remove "${target.userName}" from this event.`
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              if (target) onConfirm(target);
            }}
          >
            {target?.type === 'event'
              ? 'Delete Event'
              : target?.type === 'team'
                ? 'Dissolve Team'
                : 'Remove Registration'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
