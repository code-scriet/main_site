import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { UserDetailContent } from '@/components/admin/users/UserDetailContent';
import { SocketProvider } from '@/context/SocketContext';

function UserDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Missing user id.
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-6">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to all users
      </Link>
      <UserDetailContent userId={id} />
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
