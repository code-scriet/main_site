import { useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Lock, Unlock, Loader2, Trash2 } from 'lucide-react';
import type { EventAdminRegistration, EventTeam } from '@/lib/api';

interface TeamRegistrationCardProps {
  team: EventTeam;
  eventId: string;
  teamMinSize?: number;
  teamMaxSize?: number;
  participantRegistrations: EventAdminRegistration[];
  deletingRegId: string | null;
  onToggleLock: (teamId: string, eventId: string) => void;
  onRequestDeleteTeam: (teamId: string, teamName: string, eventId: string) => void;
  onRequestDeleteRegistration: (registrationId: string, userName: string, eventId: string) => void;
}

// Per-team card extracted from AdminEventRegistrations so the per-team
// member-set derivation can be memoized (rules-of-hooks forbids useMemo
// inside the parent's render-time .map callback).
export function TeamRegistrationCard({
  team,
  eventId,
  teamMinSize,
  teamMaxSize,
  participantRegistrations,
  deletingRegId,
  onToggleLock,
  onRequestDeleteTeam,
  onRequestDeleteRegistration,
}: TeamRegistrationCardProps) {
  const teamRegs = useMemo(() => {
    const memberUserIds = new Set(team.members.map((member) => member.userId));
    return participantRegistrations.filter((registration) => memberUserIds.has(registration.user.id));
  }, [team.members, participantRegistrations]);

  const isComplete = team.members.length >= (teamMinSize || 1);
  const maxSize = teamMaxSize || 4;

  return (
    <Card className="border-purple-100">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{team.teamName}</span>
            <Badge variant="outline" className="text-xs">
              {team.members.length}/{maxSize}
            </Badge>
            {team.isLocked && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Lock className="h-2.5 w-2.5" /> Locked
              </Badge>
            )}
            {isComplete ? (
              <Badge className="bg-green-100 text-green-700 text-xs">Complete</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Incomplete</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onToggleLock(team.id, eventId)}>
              {team.isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onRequestDeleteTeam(team.id, team.teamName, eventId)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <div className="divide-y divide-gray-100">
          {teamRegs.map((registration) => {
            const isLeader = registration.user.id === team.leaderId;
            return (
              <div key={registration.id} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-semibold flex-shrink-0">
                    {registration.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{registration.user.name}</span>
                      {isLeader && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                    <span className="text-xs text-gray-500">{registration.user.email}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRequestDeleteRegistration(registration.id, registration.user.name, eventId)}
                  disabled={deletingRegId === registration.id}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7"
                >
                  {deletingRegId === registration.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
