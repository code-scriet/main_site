import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { UserDetailContent } from '@/components/admin/users/UserDetailContent';
import { SocketProvider } from '@/context/SocketContext';
import { DSCard } from '@/components/dash';

function UserDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1 text-[12px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Back to all users
        </Link>
        <DSCard padded>
          <div className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-[13px] text-[var(--danger)]">
            Missing user id.
          </div>
        </DSCard>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Back to all users
        </Link>
      </div>
      <DSCard padded={false} className="overflow-hidden">
        <UserDetailContent userId={id} />
      </DSCard>
    </div>
  );
}

export default function UserDetailPage() {
  return (
    <SocketProvider>
      <UserDetailPageInner />
    </SocketProvider>
  );
}
