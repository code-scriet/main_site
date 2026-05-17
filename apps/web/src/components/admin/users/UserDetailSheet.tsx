import { Link } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserDetailContent } from '@/components/admin/users/UserDetailContent';

interface Props {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Slide-over user-detail panel. Shared body (UserDetailContent) is rendered
 * inside a Sheet here, and inside a full-page wrapper at /admin/users/:id.
 * Two shells, one body.
 */
export function UserDetailSheet({ userId, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:w-[640px] sm:max-w-[640px] lg:w-[760px] lg:max-w-[760px]">
        <SheetHeader className="pr-12">
          <SheetTitle>User detail</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <span>Quick view + admin actions.</span>
            {userId && (
              <Link
                to={`/admin/users/${userId}`}
                className="inline-flex items-center gap-1 text-amber-600 hover:underline dark:text-amber-300"
                onClick={() => onOpenChange(false)}
              >
                Open full page <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 py-4">
          {userId ? <UserDetailContent userId={userId} /> : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// Re-export X here so the close icon can be themed by callers if needed (currently unused).
export { X };
