import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const roleHierarchy: Record<string, number> = {
  PUBLIC: 0,
  USER: 1,
  NETWORK: 1,
  MEMBER: 2,
  CORE_MEMBER: 3,
  ADMIN: 4,
  PRESIDENT: 4,
};

interface ProtectedRouteProps {
  minRole?: string;
}

export function ProtectedRoute({ minRole = 'USER' }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  // NETWORK users should never access /dashboard routes — redirect to network status
  if (user.role === 'NETWORK') {
    return <Navigate to="/network/status" replace />;
  }

  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = roleHierarchy[minRole] || 0;

  if (userLevel < requiredLevel) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
