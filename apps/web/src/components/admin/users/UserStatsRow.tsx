import { Crown, Shield, UserCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface UserStatsRowProps {
  totalUsers: number;
  totalCoreMembers: number;
  totalAdmins: number;
}

export function UserStatsRow({ totalUsers, totalCoreMembers, totalAdmins }: UserStatsRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="bg-blue-500 p-3 rounded-lg">
            <UserCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--ds-text-1)]">{totalUsers}</p>
            <p className="text-xs text-[var(--ds-text-3)]">Members</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="bg-orange-500 p-3 rounded-lg">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--ds-text-1)]">{totalCoreMembers}</p>
            <p className="text-xs text-[var(--ds-text-3)]">Core Members</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="bg-red-500 p-3 rounded-lg">
            <Crown className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--ds-text-1)]">{totalAdmins}</p>
            <p className="text-xs text-[var(--ds-text-3)]">Admins</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
