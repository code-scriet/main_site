import AdminUsers from '@/pages/admin/AdminUsers';
import { SocketProvider } from '@/context/SocketContext';

export default function AdminUsersRealtime() {
  return (
    <SocketProvider>
      <AdminUsers />
    </SocketProvider>
  );
}
