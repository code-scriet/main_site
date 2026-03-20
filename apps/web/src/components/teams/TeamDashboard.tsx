import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api, type EventTeam, type Event } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Copy,
  Check,
  Lock,
  Unlock,
  Users,
  Crown,
  MoreVertical,
  UserMinus,
  LogOut,
  ArrowRightLeft,
  Trash2,
  Loader2,
} from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/error';
import { cn } from '@/lib/utils';
import { copyTextToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';

interface TeamDashboardProps {
  team: EventTeam;
  event: Event;
  onTeamChange?: () => void;
}

export function TeamDashboard({ team, event, onTeamChange }: TeamDashboardProps) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const [copied, setCopied] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [memberToTransfer, setMemberToTransfer] = useState<string | null>(null);
  const [showDissolveDialog, setShowDissolveDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const isLeader = team.leaderId === user?.id;
  const memberCount = team.members.length;
  const teamMinSize = team.teamMinSize ?? event.teamMinSize ?? 1;
  const teamMaxSize = team.teamMaxSize ?? event.teamMaxSize ?? 4;
  const isComplete = memberCount >= teamMinSize;
  const isFull = memberCount >= teamMaxSize;

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['myTeam', event.id] });
    queryClient.invalidateQueries({ queryKey: ['myRegistrations'] });
    queryClient.invalidateQueries({ queryKey: ['event', event.id] });
    queryClient.invalidateQueries({ queryKey: ['event', event.slug] });
    onTeamChange?.();
  };

  const toggleLockMutation = useMutation({
    mutationFn: () => api.toggleTeamLock(team.id, token!),
    onSuccess: () => {
      toast.success(team.isLocked ? 'Team unlocked' : 'Team locked');
      invalidateQueries();
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Failed to toggle lock')),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.removeTeamMember(team.id, userId, token!),
    onSuccess: () => {
      setMemberToRemove(null);
      toast.success('Member removed from team');
      invalidateQueries();
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Failed to remove member')),
  });

  const transferLeadershipMutation = useMutation({
    mutationFn: (newLeaderId: string) => api.transferLeadership(team.id, newLeaderId, token!),
    onSuccess: () => {
      setMemberToTransfer(null);
      toast.success('Leadership transferred');
      invalidateQueries();
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Failed to transfer leadership')),
  });

  const leaveTeamMutation = useMutation({
    mutationFn: () => api.leaveTeam(team.id, token!),
    onSuccess: () => {
      setShowLeaveDialog(false);
      toast.success('You left the team');
      invalidateQueries();
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Failed to leave team')),
  });

  const dissolveTeamMutation = useMutation({
    mutationFn: () => api.dissolveTeam(team.id, token!),
    onSuccess: () => {
      setShowDissolveDialog(false);
      toast.success('Team dissolved');
      invalidateQueries();
    },
    onError: (error) => toast.error(extractApiErrorMessage(error, 'Failed to dissolve team')),
  });

  const handleCopyCode = () => {
    if (team.inviteCode) {
      copyTextToClipboard(team.inviteCode)
        .then((ok) => {
          if (!ok) {
            toast.error('Copy failed. Please copy the code manually.');
            return;
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
    }
  };

  const getMemberName = (userId: string) => {
    return team.members.find((m) => m.userId === userId)?.user.name || 'Unknown';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {team.teamName}
            </CardTitle>
            <CardDescription className="mt-1">
              {memberCount} / {teamMaxSize} members
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {team.isLocked && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </Badge>
            )}
            {isComplete ? (
              <Badge variant="default" className="bg-green-600">
                Complete
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                Need {teamMinSize - memberCount} more
              </Badge>
            )}
            {isFull && (
              <Badge variant="secondary">Full</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Invite Code Section (Leader Only) */}
        {isLeader && team.inviteCode && (
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Invite Code</p>
                <code className="text-xl font-mono tracking-widest">
                  {team.inviteCode}
                </code>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopyCode}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share this code with teammates to invite them.
            </p>
          </div>
        )}

        {/* Members List */}
        <div>
          <h4 className="text-sm font-medium mb-3">Team Members</h4>
          <div className="space-y-2">
            {team.members.map((member) => {
              const isMemberLeader = member.userId === team.leaderId;
              const isCurrentUser = member.userId === user?.id;

              return (
                <div
                  key={member.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    isCurrentUser && 'bg-primary/5 border-primary/20'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {member.user.avatar ? (
                        <img src={member.user.avatar} alt={member.user.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-primary">
                          {member.user.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{member.user.name}</span>
                        {isMemberLeader && (
                          <Crown className="h-4 w-4 text-amber-500" />
                        )}
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{member.user.email}</p>
                    </div>
                  </div>

                  {/* Member Actions (Leader Only) */}
                  {isLeader && !isCurrentUser && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem 
                          onClick={() => setMemberToTransfer(member.userId)}
                          className="cursor-pointer"
                        >
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                          <span>Make Leader</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setMemberToRemove(member.userId)}
                          className="text-destructive cursor-pointer focus:text-destructive"
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          <span>Remove from Team</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leader Controls */}
        {isLeader && (
          <div className="pt-4 border-t space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Leader Actions</h4>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleLockMutation.mutate()}
                disabled={toggleLockMutation.isPending}
                className="flex-1 min-w-[140px]"
              >
                {toggleLockMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : team.isLocked ? (
                  <Unlock className="mr-2 h-4 w-4" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                {team.isLocked ? 'Unlock Team' : 'Lock Team'}
              </Button>

              <AlertDialog open={showDissolveDialog} onOpenChange={setShowDissolveDialog}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 min-w-[140px] min-h-10 text-sm sm:text-xs"
                  >
                    <Trash2 className="mr-2 h-5 w-5 sm:h-4 sm:w-4 shrink-0" />
                    Dissolve Team
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Dissolve Team?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the team and cancel all member registrations for this event.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => dissolveTeamMutation.mutate()}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      {dissolveTeamMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Dissolve Team
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        {/* Member Controls (non-leader) */}
        {!isLeader && (
          <div className="pt-4 border-t">
            <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  <LogOut className="mr-2 h-4 w-4" />
                  Leave Team
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave Team?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove you from the team and cancel your registration for this event.
                    You can rejoin with a new invite code if the team isn&apos;t locked.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => leaveTeamMutation.mutate()}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {leaveTeamMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Leave Team
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Error Display */}
        {(toggleLockMutation.isError ||
          removeMemberMutation.isError ||
          transferLeadershipMutation.isError ||
          leaveTeamMutation.isError ||
          dissolveTeamMutation.isError) && (
          <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">
            {extractApiErrorMessage(
              toggleLockMutation.error ||
                removeMemberMutation.error ||
                transferLeadershipMutation.error ||
                leaveTeamMutation.error ||
                dissolveTeamMutation.error,
              'An error occurred'
            )}
          </div>
        )}

        {/* Remove Member Confirmation Dialog */}
        <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove {getMemberName(memberToRemove || '')} from the team?
                Their registration for this event will also be cancelled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove)}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {removeMemberMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Remove Member
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Transfer Leadership Confirmation Dialog */}
        <AlertDialog open={!!memberToTransfer} onOpenChange={(open) => !open && setMemberToTransfer(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Transfer Leadership?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to make {getMemberName(memberToTransfer || '')} the new team leader?
                You will become a regular team member.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => memberToTransfer && transferLeadershipMutation.mutate(memberToTransfer)}
              >
                {transferLeadershipMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Transfer Leadership
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
