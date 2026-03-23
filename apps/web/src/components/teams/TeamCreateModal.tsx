import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api, type Event, type EventTeam, type EventRegistrationField } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Check, Loader2, Users } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/error';
import { copyTextToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';

interface TeamCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  onSuccess?: (team: EventTeam) => void;
}

export function TeamCreateModal({ open, onOpenChange, event, onSuccess }: TeamCreateModalProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [teamName, setTeamName] = useState('');
  const [customFieldResponses, setCustomFieldResponses] = useState<Record<string, string>>({});
  const [createdTeam, setCreatedTeam] = useState<EventTeam | null>(null);
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => {
      const responses: Record<string, unknown> = {};
      Object.entries(customFieldResponses).forEach(([fieldId, value]) => {
        if (value.trim()) {
          responses[fieldId] = value;
        }
      });
      return api.createTeam(
        {
          eventId: event.id,
          teamName: teamName.trim(),
          customFieldResponses: Object.keys(responses).length > 0 ? responses : undefined,
        },
        token!
      );
    },
    onSuccess: (data) => {
      setCreatedTeam(data.team);
      toast.success('Team created successfully!');
      queryClient.invalidateQueries({ queryKey: ['myTeam', event.id] });
      queryClient.invalidateQueries({ queryKey: ['myRegistrations'] });
      queryClient.invalidateQueries({ queryKey: ['event', event.id] });
      queryClient.invalidateQueries({ queryKey: ['event', event.slug] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      setValidationError('Team name is required.');
      return;
    }

    // Validate required custom fields
    const registrationFields = event.registrationFields || [];
    for (const field of registrationFields) {
      if (field.required && !customFieldResponses[field.id]?.trim()) {
        setValidationError(`Please fill in "${field.label}".`);
        return;
      }
    }

    setValidationError(null);
    createMutation.mutate();
  };

  const handleCopyCode = () => {
    if (createdTeam?.inviteCode) {
      copyTextToClipboard(createdTeam.inviteCode)
        .then((ok) => {
          if (!ok) {
            toast.error('Copy failed. Please select and copy manually.');
            return;
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
    }
  };

  const handleClose = () => {
    if (createdTeam) {
      onSuccess?.(createdTeam);
    }
    setTeamName('');
    setCustomFieldResponses({});
    setCreatedTeam(null);
    setValidationError(null);
    createMutation.reset();
    onOpenChange(false);
  };

  const renderCustomFieldInput = (field: EventRegistrationField) => {
    const value = customFieldResponses[field.id] || '';
    const onChange = (val: string) => {
      setCustomFieldResponses((prev) => ({ ...prev, [field.id]: val }));
    };

    if (field.type === 'TEXTAREA') {
      return (
        <Textarea
          id={field.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          minLength={field.minLength}
          maxLength={field.maxLength}
          className="min-h-[80px]"
        />
      );
    }

    return (
      <Input
        id={field.id}
        type={field.type === 'NUMBER' ? 'number' : field.type === 'EMAIL' ? 'email' : field.type === 'URL' ? 'url' : field.type === 'PHONE' ? 'tel' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        required={field.required}
        minLength={field.minLength}
        maxLength={field.maxLength}
        min={field.min}
        max={field.max}
        pattern={field.pattern}
      />
    );
  };

  // Success state - show invite code
  if (createdTeam) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              Team Created!
            </DialogTitle>
            <DialogDescription>
              Share this invite code with your teammates so they can join.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Team Name</p>
              <p className="text-lg font-semibold">{createdTeam.teamName}</p>
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Invite Code</p>
              <div className="flex items-center justify-center gap-2">
                <code className="bg-muted px-4 py-2 rounded-lg text-2xl font-mono tracking-widest">
                  {createdTeam.inviteCode}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopyCode}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
              <p>
                <strong>Team Size:</strong> {event.teamMinSize} - {event.teamMaxSize} members
              </p>
              <p className="mt-1">
                Your team needs at least {event.teamMinSize} member{event.teamMinSize !== 1 ? 's' : ''} to be complete.
              </p>
            </div>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Make sure you copy the invite code before closing this dialog.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Form state
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Create a Team
          </DialogTitle>
          <DialogDescription>
            Create a team for &quot;{event.title}&quot;. You&apos;ll be the team leader and can invite members.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamName">Team Name *</Label>
            <Input
              id="teamName"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Enter your team name"
              maxLength={100}
              required
              disabled={createMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Max 100 characters. Must be unique for this event.
            </p>
          </div>

          {/* Custom registration fields */}
          {event.registrationFields?.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>
                {field.label} {field.required && '*'}
              </Label>
              {renderCustomFieldInput(field)}
            </div>
          ))}

          {validationError && (
            <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">
              {validationError}
            </div>
          )}

          {createMutation.isError && (
            <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">
              {extractApiErrorMessage(createMutation.error, 'Failed to create team')}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !teamName.trim()}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
