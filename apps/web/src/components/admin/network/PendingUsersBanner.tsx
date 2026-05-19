import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/dateUtils';
import type { PendingNetworkUser } from '@/lib/api';

interface PendingUsersBannerProps {
  pendingUsers: PendingNetworkUser[];
  actionLoading: boolean;
  onRevert: (user: PendingNetworkUser) => void;
  onDelete: (user: PendingNetworkUser) => void;
}

export function PendingUsersBanner({
  pendingUsers,
  actionLoading,
  onRevert,
  onDelete,
}: PendingUsersBannerProps) {
  if (pendingUsers.length === 0) return null;

  return (
    <Card className="mb-6 border-[var(--warning-border)] bg-[var(--warning-bg)]/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-[var(--ds-text-1)]">
            Pending Onboarding Accounts
          </h3>
          <Badge variant="secondary" className="bg-[var(--warning-bg)] text-[var(--warning)]">
            {pendingUsers.length}
          </Badge>
        </div>
        <div className="space-y-2">
          {pendingUsers.map((pendingUser) => (
            <div
              key={pendingUser.id}
              className="flex flex-col gap-2 rounded-md border border-[var(--warning-border)] bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="font-medium text-[var(--ds-text-1)]">{pendingUser.name}</div>
                <div className="truncate text-[var(--ds-text-2)]">{pendingUser.email}</div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <div className="text-xs text-[var(--ds-text-3)]">
                  Joined {formatDate(pendingUser.createdAt, 'short')}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRevert(pendingUser)}
                  disabled={actionLoading}
                >
                  Move to Users
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onDelete(pendingUser)}
                  disabled={actionLoading}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
