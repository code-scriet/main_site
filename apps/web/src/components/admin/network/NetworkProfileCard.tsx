import { CheckCircle2, Clock, Eye, Pencil, Trash2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { NetworkProfile, NetworkStatus } from '@/lib/api';

const statusColors: Record<NetworkStatus, string> = {
  PENDING: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
  VERIFIED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
};

const statusIcons: Record<NetworkStatus, typeof Clock> = {
  PENDING: Clock,
  VERIFIED: CheckCircle2,
  REJECTED: XCircle,
};

const connectionTypeLabels: Record<string, string> = {
  GUEST_SPEAKER: 'Guest Speaker',
  GMEET_SESSION: 'GMeet Session',
  EVENT_JUDGE: 'Event Judge',
  MENTOR: 'Mentor',
  INDUSTRY_PARTNER: 'Industry Partner',
  ALUMNI: 'Alumni',
  OTHER: 'Other',
};

interface NetworkProfileCardProps {
  profile: NetworkProfile;
  actionLoading: boolean;
  onView: () => void;
  onEdit: () => void;
  onVerify: () => void;
  onReject: () => void;
  onDelete: () => void;
}

export function NetworkProfileCard({
  profile,
  actionLoading,
  onView,
  onEdit,
  onVerify,
  onReject,
  onDelete,
}: NetworkProfileCardProps) {
  const StatusIcon = statusIcons[profile.status];
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-[var(--warning-bg)]">
            <img
              src={profile.profilePhoto || '/fallback-avatar.svg'}
              alt={profile.fullName}
              className="w-full h-full object-cover"
              onError={(event) => {
                event.currentTarget.src = '/fallback-avatar.svg';
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-[var(--ds-text-1)]">{profile.fullName}</h3>
              <Badge variant="outline" className={statusColors[profile.status]}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {profile.status}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {connectionTypeLabels[profile.connectionType]}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Order: {profile.displayOrder ?? 0}
              </Badge>
            </div>
            <p className="text-sm text-[var(--ds-text-2)]">
              {profile.designation} at {profile.company}
            </p>
            <p className="text-xs text-[var(--ds-text-3)] mt-1">
              {profile.user?.email} • {profile.industry}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={onView}>
              <Eye className="h-4 w-4 mr-1" /> View
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            {profile.status === 'PENDING' && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={onVerify}
                  disabled={actionLoading}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Verify
                </Button>
                <Button variant="destructive" size="sm" onClick={onReject}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
