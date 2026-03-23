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
import { Loader2, UserPlus } from 'lucide-react';
import { extractApiErrorMessage } from '@/lib/error';
import { toast } from 'sonner';

interface TeamJoinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  onSuccess?: (team: EventTeam) => void;
}

export function TeamJoinModal({ open, onOpenChange, event, onSuccess }: TeamJoinModalProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [inviteCode, setInviteCode] = useState('');
  const [customFieldResponses, setCustomFieldResponses] = useState<Record<string, string>>({});

  const joinMutation = useMutation({
    mutationFn: () => {
      const responses: Record<string, unknown> = {};
      Object.entries(customFieldResponses).forEach(([fieldId, value]) => {
        if (value.trim()) {
          responses[fieldId] = value;
        }
      });
      return api.joinTeam(
        {
          inviteCode: inviteCode.toUpperCase().trim(),
          customFieldResponses: Object.keys(responses).length > 0 ? responses : undefined,
        },
        token!
      );
    },
    onSuccess: (data) => {
      toast.success('Joined team successfully!');
      queryClient.invalidateQueries({ queryKey: ['myTeam', event.id] });
      queryClient.invalidateQueries({ queryKey: ['myRegistrations'] });
      queryClient.invalidateQueries({ queryKey: ['event', event.id] });
      queryClient.invalidateQueries({ queryKey: ['event', event.slug] });
      onSuccess?.(data.team);
      handleClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteCode.length !== 8) return;

    // Validate required custom fields
    const registrationFields = event.registrationFields || [];
    for (const field of registrationFields) {
      if (field.required && !customFieldResponses[field.id]?.trim()) {
        return;
      }
    }

    joinMutation.mutate();
  };

  const handleClose = () => {
    setInviteCode('');
    setCustomFieldResponses({});
    joinMutation.reset();
    onOpenChange(false);
  };

  const handleCodeChange = (value: string) => {
    // Only allow alphanumeric, max 8 chars. Visual uppercase is handled by CSS.
    const cleaned = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
    setInviteCode(cleaned);
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Join a Team
          </DialogTitle>
          <DialogDescription>
            Enter the 8-character invite code shared by your team leader to join their team for &quot;{event.title}&quot;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inviteCode">Invite Code *</Label>
            <Input
              id="inviteCode"
              value={inviteCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="ABCD1234"
              className="text-center text-lg font-mono tracking-widest uppercase"
              maxLength={8}
              required
              disabled={joinMutation.isPending}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground text-center">
              {inviteCode.length}/8 characters
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

          {joinMutation.isError && (
            <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">
              {extractApiErrorMessage(joinMutation.error, 'Failed to join team')}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={joinMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={joinMutation.isPending || inviteCode.length !== 8}>
              {joinMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
