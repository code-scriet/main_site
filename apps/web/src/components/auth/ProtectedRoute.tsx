import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const roleHierarchy: Record<string, number> = {
  PUBLIC: 0,
  USER: 1,
  CORE_MEMBER: 2,
  ADMIN: 3,
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

  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = roleHierarchy[minRole] || 0;

  if (userLevel < requiredLevel) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
