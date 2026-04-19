import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type CertType, type EventInvitation } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/dateUtils';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MailCheck,
  MailOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_OPTIONS = ['Guest', 'Chief Guest', 'Speaker', 'Judge', 'Special Guest', 'Custom'] as const;
const CERTIFICATE_TYPE_OPTIONS: CertType[] = ['PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER'];
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

interface AdminEventInvitationsProps {
  eventId: string;
  eventTitle: string;
  token: string;
}

interface InviteeSearchResult {
  userId: string;
  name: string;
  designation: string;
  company: string;
  photo?: string | null;
}

interface StagedInvitee {
  id: string;
  userId?: string;
  email?: string;
  name: string;
  designation?: string;
  company?: string;
  photo?: string | null;
  roleChoice: string;
  customRole: string;
  certificateEnabled: boolean;
  certificateType: CertType;
}

interface InvitationEditDraft {
  roleChoice: string;
  customRole: string;
  customMessage: string;
  certificateEnabled: boolean;
  certificateType: CertType;
}

function getEffectiveRole(roleChoice: string, customRole: string) {
  return roleChoice === 'Custom' ? customRole.trim() || 'Guest' : roleChoice;
}

function deriveRoleChoice(role: string) {
  return ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number]) ? role : 'Custom';
}

function getInvitationDisplayName(invitation: EventInvitation) {
  return (
    invitation.inviteeUser?.networkProfile?.fullName
    || invitation.inviteeUser?.name
    || invitation.inviteeNameSnapshot
    || invitation.inviteeEmail
    || 'Guest'
  );
}

function getInvitationSubtitle(invitation: EventInvitation) {
  const designation = invitation.inviteeUser?.networkProfile?.designation || invitation.inviteeDesignationSnapshot;
  const company = invitation.inviteeUser?.networkProfile?.company || invitation.inviteeCompanySnapshot;

  if (designation && company) return `${designation} @ ${company}`;
  return designation || company || invitation.inviteeEmail || '';
}

function getCooldownRemainingMs(lastEmailResentAt?: string | null, nowMs = Date.now()): number {
  if (!lastEmailResentAt) {
    return 0;
  }

  const resentAt = new Date(lastEmailResentAt).getTime();
  if (Number.isNaN(resentAt)) {
    return 0;
  }

  return Math.max(resentAt + RESEND_COOLDOWN_MS - nowMs, 0);
}

function formatCooldown(remainingMs: number): string {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  return `${seconds}s`;
}

function StatusChip({ status }: { status: EventInvitation['status'] }) {
  const className: Record<EventInvitation['status'], string> = {
    PENDING: 'border-amber-200 bg-amber-100 text-amber-800',
    ACCEPTED: 'border-green-200 bg-green-100 text-green-800',
    DECLINED: 'border-slate-200 bg-slate-100 text-slate-700',
    REVOKED: 'border-red-200 bg-red-100 text-red-700',
    EXPIRED: 'border-slate-200 bg-slate-100 italic text-slate-600',
  };

  return (
    <Badge variant="outline" className={className[status]}>
      {status}
    </Badge>
  );
}

export default function AdminEventInvitations({
  eventId,
  eventTitle,
  token,
}: AdminEventInvitationsProps) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stagedInvitees, setStagedInvitees] = useState<StagedInvitee[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailDraft, setEmailDraft] = useState({ email: '', name: '', roleChoice: 'Guest', customRole: '' });
  const [editingInvitation, setEditingInvitation] = useState<EventInvitation | null>(null);
  const [editDraft, setEditDraft] = useState<InvitationEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCooldownNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const invitationsQuery = useQuery({
    queryKey: ['eventInvitations', eventId],
    queryFn: () => api.getEventInvitations(eventId, token),
    enabled: Boolean(token && eventId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const stagedUserIds = useMemo(
    () => new Set(stagedInvitees.map((invitee) => invitee.userId).filter((value): value is string => Boolean(value))),
    [stagedInvitees],
  );
  const stagedEmails = useMemo(
    () => new Set(stagedInvitees.map((invitee) => invitee.email?.trim().toLowerCase()).filter((value): value is string => Boolean(value))),
    [stagedInvitees],
  );

  const searchQuery = useQuery({
    queryKey: ['inviteeSearch', eventId, debouncedSearch],
    queryFn: () => api.searchInvitees(debouncedSearch, eventId, token),
    enabled: Boolean(token && eventId && debouncedSearch.length >= 2),
    staleTime: 30_000,
  });

  const visibleSearchResults = useMemo(
    () => (searchQuery.data ?? []).filter(
      (result) => !stagedUserIds.has(result.userId),
    ),
    [searchQuery.data, stagedUserIds],
  );

  const refreshInvitations = async () => {
    await queryClient.invalidateQueries({ queryKey: ['eventInvitations', eventId] });
  };

  const addUserInvitee = (result: InviteeSearchResult) => {
    setStagedInvitees((current) => [
      ...current,
      {
        id: `user-${result.userId}`,
        userId: result.userId,
        name: result.name,
        designation: result.designation,
        company: result.company,
        photo: result.photo,
        roleChoice: 'Guest',
        customRole: '',
        certificateEnabled: true,
        certificateType: 'SPEAKER',
      },
    ]);
    setSearchInput('');
    setDebouncedSearch('');
  };

  const addEmailInvitee = () => {
    const normalizedEmail = emailDraft.email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error('Enter an email address first.');
      return;
    }

    if (stagedEmails.has(normalizedEmail)) {
      toast.error('That email is already staged.');
      return;
    }

    setStagedInvitees((current) => [
      ...current,
      {
        id: `email-${normalizedEmail}`,
        email: normalizedEmail,
        name: emailDraft.name.trim() || normalizedEmail,
        roleChoice: emailDraft.roleChoice,
        customRole: emailDraft.customRole,
        certificateEnabled: true,
        certificateType: 'SPEAKER',
      },
    ]);
    setEmailDraft({ email: '', name: '', roleChoice: 'Guest', customRole: '' });
  };

  const updateStagedInvitee = (inviteeId: string, patch: Partial<StagedInvitee>) => {
    setStagedInvitees((current) => current.map((invitee) => (
      invitee.id === inviteeId ? { ...invitee, ...patch } : invitee
    )));
  };

  const removeStagedInvitee = (inviteeId: string) => {
    setStagedInvitees((current) => current.filter((invitee) => invitee.id !== inviteeId));
  };

  const submitInvitations = async () => {
    if (stagedInvitees.length === 0) {
      toast.error('Stage at least one invitee before sending.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.createInvitations({
        eventId,
        customMessage: customMessage.trim() || undefined,
        invitees: stagedInvitees.map((invitee) => ({
          ...(invitee.userId ? { userId: invitee.userId } : { email: invitee.email }),
          role: getEffectiveRole(invitee.roleChoice, invitee.customRole),
          certificateEnabled: invitee.certificateEnabled,
          certificateType: invitee.certificateType,
        })),
      }, token);

      await refreshInvitations();
      setStagedInvitees([]);
      setCustomMessage('');

      const createdCount = result.created.length;
      const skippedCount = result.skipped.length;

      if (createdCount > 0) {
        toast.success(`Sent ${createdCount} invitation${createdCount === 1 ? '' : 's'} for ${eventTitle}.`);
      }
      if (skippedCount > 0) {
        toast.warning(`${skippedCount} invitee${skippedCount === 1 ? '' : 's'} were skipped.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send invitations.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (invitation: EventInvitation) => {
    setEditingInvitation(invitation);
    setEditDraft({
      roleChoice: deriveRoleChoice(invitation.role),
      customRole: deriveRoleChoice(invitation.role) === 'Custom' ? invitation.role : '',
      customMessage: invitation.customMessage || '',
      certificateEnabled: invitation.certificateEnabled,
      certificateType: invitation.certificateType,
    });
  };

  const saveEditDialog = async () => {
    if (!editingInvitation || !editDraft) return;

    setSavingEdit(true);
    try {
      await api.updateInvitation(editingInvitation.id, {
        role: getEffectiveRole(editDraft.roleChoice, editDraft.customRole),
        customMessage: editDraft.customMessage.trim() || null,
        certificateEnabled: editDraft.certificateEnabled,
        certificateType: editDraft.certificateType,
      }, token);

      await refreshInvitations();
      setEditingInvitation(null);
      setEditDraft(null);
      toast.success('Invitation updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update invitation.');
    } finally {
      setSavingEdit(false);
    }
  };

  const updateCertificateToggle = async (invitation: EventInvitation, certificateEnabled: boolean) => {
    setRowLoadingId(invitation.id);
    try {
      await api.updateInvitation(invitation.id, {
        certificateEnabled,
      }, token);
      await refreshInvitations();
      toast.success('Certificate eligibility updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update certificate settings.');
    } finally {
      setRowLoadingId(null);
    }
  };

  const resendInvitation = async (invitationId: string) => {
    setRowLoadingId(invitationId);
    try {
      await api.resendInvitationEmail(invitationId, token);
      await refreshInvitations();
      toast.success('Invitation email resent.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resend invitation.');
    } finally {
      setRowLoadingId(null);
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    setRowLoadingId(invitationId);
    try {
      await api.revokeInvitation(invitationId, token);
      await refreshInvitations();
      toast.success('Invitation revoked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke invitation.');
    } finally {
      setRowLoadingId(null);
    }
  };

  const invitationRows = invitationsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Card className="border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-amber-900">
            <UserPlus className="h-5 w-5 text-amber-600" />
            Invite Guests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <Label htmlFor={`invitee-search-${eventId}`}>Search verified network members</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
              <Input
                id={`invitee-search-${eventId}`}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by name, designation, company, or email"
                className="pl-10"
              />
            </div>

            {debouncedSearch.length >= 2 && (
              <div className="rounded-xl border border-slate-200 bg-white">
                {searchQuery.isLoading ? (
                  <div className="flex items-center gap-2 px-4 py-4 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching invitees...
                  </div>
                ) : visibleSearchResults.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-500">No matching verified invitees found.</div>
                ) : (
                  visibleSearchResults.map((result) => (
                    <button
                      key={result.userId}
                      type="button"
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-amber-50 last:border-b-0"
                      onClick={() => addUserInvitee(result)}
                    >
                      {result.photo ? (
                        <img src={result.photo} alt={result.name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 font-semibold text-amber-800">
                          {result.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">{result.name}</p>
                        <p className="truncate text-sm text-gray-500">
                          {[result.designation, result.company].filter(Boolean).join(' @ ')}
                        </p>
                      </div>
                      <Plus className="h-4 w-4 text-amber-600" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label htmlFor={`invitee-email-${eventId}`}>Invite by email</Label>
                <Input
                  id={`invitee-email-${eventId}`}
                  value={emailDraft.email}
                  onChange={(event) => setEmailDraft((current) => ({ ...current, email: event.target.value }))}
                  placeholder="guest@example.com"
                />
              </div>
              <div>
                <Label htmlFor={`invitee-name-${eventId}`}>Display name</Label>
                <Input
                  id={`invitee-name-${eventId}`}
                  value={emailDraft.name}
                  onChange={(event) => setEmailDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label htmlFor={`invitee-role-${eventId}`}>Role</Label>
                <select
                  id={`invitee-role-${eventId}`}
                  value={emailDraft.roleChoice}
                  onChange={(event) => setEmailDraft((current) => ({ ...current, roleChoice: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
            </div>
            {emailDraft.roleChoice === 'Custom' && (
              <div className="mt-3">
                <Label htmlFor={`invitee-custom-role-${eventId}`}>Custom role label</Label>
                <Input
                  id={`invitee-custom-role-${eventId}`}
                  value={emailDraft.customRole}
                  onChange={(event) => setEmailDraft((current) => ({ ...current, customRole: event.target.value }))}
                  placeholder="e.g. Panelist"
                />
              </div>
            )}
            <div className="mt-4">
              <Button type="button" variant="outline" onClick={addEmailInvitee}>
                <Plus className="mr-2 h-4 w-4" />
                Add Email Invitee
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Staged invitees</h3>
              <Badge variant="outline">{stagedInvitees.length}</Badge>
            </div>

            {stagedInvitees.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-gray-500">
                Add verified profiles or email addresses above to prepare a batch.
              </div>
            ) : (
              <div className="space-y-3">
                {stagedInvitees.map((invitee) => (
                  <div key={invitee.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{invitee.name}</p>
                        <p className="text-sm text-gray-500">
                          {[invitee.designation, invitee.company].filter(Boolean).join(' @ ') || invitee.email}
                        </p>
                      </div>

                      <div className="grid flex-1 gap-3 md:grid-cols-4">
                        <div>
                          <Label className="text-xs">Role</Label>
                          <select
                            value={invitee.roleChoice}
                            onChange={(event) => updateStagedInvitee(invitee.id, { roleChoice: event.target.value })}
                            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Certificate Type</Label>
                          <select
                            value={invitee.certificateType}
                            onChange={(event) => updateStagedInvitee(invitee.id, { certificateType: event.target.value as CertType })}
                            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {CERTIFICATE_TYPE_OPTIONS.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end gap-3">
                          <div>
                            <Label className="text-xs">Certificate Eligible</Label>
                            <div className="mt-3">
                              <Switch
                                checked={invitee.certificateEnabled}
                                onCheckedChange={(checked) => updateStagedInvitee(invitee.id, { certificateEnabled: checked })}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-end justify-end">
                          <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => removeStagedInvitee(invitee.id)}>
                            <X className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>

                    {invitee.roleChoice === 'Custom' && (
                      <div className="mt-3">
                        <Label className="text-xs">Custom role label</Label>
                        <Input
                          value={invitee.customRole}
                          onChange={(event) => updateStagedInvitee(invitee.id, { customRole: event.target.value })}
                          placeholder="e.g. Industry Expert"
                          className="mt-2"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor={`invitation-custom-message-${eventId}`}>Custom message override</Label>
            <Textarea
              id={`invitation-custom-message-${eventId}`}
              value={customMessage}
              onChange={(event) => setCustomMessage(event.target.value)}
              placeholder="Optional note to appear inside the invitation email."
              className="mt-2 min-h-[110px]"
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={submitInvitations} disabled={submitting || stagedInvitees.length === 0}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Invitations
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MailOpen className="h-5 w-5 text-amber-600" />
            Current Invitations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invitationsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading invitations...
            </div>
          ) : invitationRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-gray-500">
              No invitations have been created for this event yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Invitee</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Certificate</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {invitationRows.map((invitation) => {
                      const needsResend = !invitation.emailSent;
                      const canResend = invitation.status === 'PENDING' || invitation.status === 'ACCEPTED';
                      const rowBusy = rowLoadingId === invitation.id;
                      const cooldownRemainingMs = getCooldownRemainingMs(invitation.lastEmailResentAt, cooldownNowMs);
                      const cooldownActive = cooldownRemainingMs > 0;
                      const resendDisabled = rowBusy || cooldownActive;

                      return (
                        <tr key={invitation.id}>
                          <td className="px-4 py-4 align-top">
                            <div>
                              <p className="font-medium text-gray-900">{getInvitationDisplayName(invitation)}</p>
                              <p className="mt-1 text-xs text-gray-500">{getInvitationSubtitle(invitation)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <Badge variant="outline">{invitation.role}</Badge>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <StatusChip status={invitation.status} />
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={invitation.certificateEnabled}
                                disabled={rowBusy}
                                onCheckedChange={(checked) => void updateCertificateToggle(invitation, checked)}
                              />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{invitation.certificateType}</p>
                                <p className="text-xs text-gray-500">
                                  {invitation.certificateEnabled ? 'Enabled' : 'Disabled'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex items-center gap-2">
                              {invitation.emailSent ? (
                                <MailCheck className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-amber-600" />
                              )}
                              <div>
                                <p className="text-sm text-gray-900">
                                  {invitation.emailSent ? 'Sent' : 'Needs resend'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {invitation.emailSentAt ? formatDateTime(invitation.emailSentAt) : 'Not delivered yet'}
                                </p>
                              </div>
                            </div>
                            {needsResend && (
                              <p className="mt-1 text-xs text-amber-700">Fire-and-forget send may have failed.</p>
                            )}
                            {cooldownActive && (
                              <p className="mt-1 text-xs text-slate-600">Resend available in {formatCooldown(cooldownRemainingMs)}.</p>
                            )}
                          </td>
                          <td className="px-4 py-4 align-top text-xs text-gray-500">
                            {formatDateTime(invitation.updatedAt || invitation.invitedAt)}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => openEditDialog(invitation)} disabled={rowBusy || invitation.status === 'REVOKED'}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              {canResend && (
                                <Button type="button" size="sm" variant="outline" onClick={() => void resendInvitation(invitation.id)} disabled={resendDisabled}>
                                  {rowBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
                                  {cooldownActive ? `Retry in ${formatCooldown(cooldownRemainingMs)}` : 'Resend'}
                                </Button>
                              )}
                              {invitation.status !== 'REVOKED' && (
                                <Button type="button" size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => void revokeInvitation(invitation.id)} disabled={rowBusy}>
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Revoke
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingInvitation && editDraft)} onOpenChange={(open) => {
        if (!open) {
          setEditingInvitation(null);
          setEditDraft(null);
        }
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Invitation</DialogTitle>
          </DialogHeader>

          {editDraft && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-invitation-role">Role</Label>
                  <select
                    id="edit-invitation-role"
                    value={editDraft.roleChoice}
                    onChange={(event) => setEditDraft((current) => current ? { ...current, roleChoice: event.target.value } : current)}
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="edit-invitation-cert-type">Certificate Type</Label>
                  <select
                    id="edit-invitation-cert-type"
                    value={editDraft.certificateType}
                    onChange={(event) => setEditDraft((current) => current ? { ...current, certificateType: event.target.value as CertType } : current)}
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {CERTIFICATE_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              {editDraft.roleChoice === 'Custom' && (
                <div>
                  <Label htmlFor="edit-invitation-custom-role">Custom role label</Label>
                  <Input
                    id="edit-invitation-custom-role"
                    value={editDraft.customRole}
                    onChange={(event) => setEditDraft((current) => current ? { ...current, customRole: event.target.value } : current)}
                    placeholder="e.g. Panelist"
                    className="mt-2"
                  />
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">Certificate eligibility</p>
                  <p className="text-sm text-gray-500">Control whether this invitee appears by default in the guest certificate workflow.</p>
                </div>
                <Switch
                  checked={editDraft.certificateEnabled}
                  onCheckedChange={(checked) => setEditDraft((current) => current ? { ...current, certificateEnabled: checked } : current)}
                />
              </div>

              <div>
                <Label htmlFor="edit-invitation-message">Custom message</Label>
                <Textarea
                  id="edit-invitation-message"
                  value={editDraft.customMessage}
                  onChange={(event) => setEditDraft((current) => current ? { ...current, customMessage: event.target.value } : current)}
                  className="mt-2 min-h-[120px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditingInvitation(null);
              setEditDraft(null);
            }}>
              Cancel
            </Button>
            <Button onClick={() => void saveEditDialog()} disabled={savingEdit || !editDraft}>
              {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
