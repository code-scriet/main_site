// Dashboard v2 — Admin · Team Management.
// Drag-orderable cards. Public team page sources from this list.
// Pixel-port of screen-admin2.jsx:22 (AdminTeamScreen).

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, Github, Linkedin, Globe, Send, Instagram, Pencil, Trash2, Loader2, Link2, UserMinus, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type TeamMember } from '@/lib/api';
import { Avatar, DSCard, EmptyState, Field, Pill, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EditState {
  id?: string;
  name: string;
  role: string;
  team: string;
  imageUrl: string;
  github: string;
  linkedin: string;
  twitter: string;
  instagram: string;
  website: string;
  bio: string;
  vision: string;
  story: string;
  expertise: string;
  achievements: string;
  slug: string;
  // Display order inside the team group (HEAD parity). Smaller = earlier.
  order: number;
}

interface LinkedUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  bio?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  websiteUrl?: string | null;
}

const TEAM_GROUPS = ['Leadership', 'Technical', 'DSA Champs', 'Designing', 'Social Media', 'Management'];

const EMPTY: EditState = {
  name: '', role: '', team: TEAM_GROUPS[0], imageUrl: '',
  github: '', linkedin: '', twitter: '', instagram: '',
  website: '', bio: '', vision: '', story: '', expertise: '', achievements: '',
  slug: '', order: 0,
};

export default function AdminTeam() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<EditState>(EMPTY);
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState<TeamMember | null>(null);
  // Link-to-user state — applies to both create AND edit flows.
  // For create: `linkUserId` is staged and submitted with `createTeamMember`.
  // For edit: `linkUserId` is reused; on save it's sent through `updateTeamMember`'s `userId` field
  // (the saveMut payload spread already accepts arbitrary `Partial<TeamMember>` keys, but we still
  //  prefer the dedicated `linkTeamMemberToUser` API on edits to keep the link transactional).
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<LinkedUser[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkUserId, setLinkUserId] = useState<string | null>(null);
  const [linkUser, setLinkUser] = useState<LinkedUser | null>(null);
  const [richOpen, setRichOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  // Server-decorated sync metadata for the currently-edited member.
  // Keys are TeamMember field names; values mark whether the value came from the linked User account.
  const [syncedFrom, setSyncedFrom] = useState<Record<string, 'user' | 'team'>>({});

  const q = useQuery({
    queryKey: ['admin-team'],
    queryFn: () => api.getTeam(),
  });

  const members = useMemo(() => (q.data ?? []).slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999)), [q.data]);
  const grouped = useMemo(() => {
    const m: Record<string, TeamMember[]> = {};
    for (const x of members) {
      const t = x.team || 'Other';
      m[t] = m[t] ?? [];
      m[t].push(x);
    }
    return m;
  }, [members]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Partial<TeamMember> & { userId?: string | null } = {
        ...edit,
        // Strip empty optional strings the API treats as "clear"
        slug: edit.slug.trim() || undefined,
        userId: linkUserId ?? undefined,
      };
      if (edit.id) {
        await api.updateTeamMember(edit.id, payload, token!);
        // If the staged link target changed vs the existing member's link, re-link explicitly
        // to use the dedicated endpoint (it handles user-side relation invariants).
        if ((editTarget?.userId || null) !== linkUserId) {
          await api.linkTeamMemberToUser(edit.id, linkUserId, token!);
        }
      } else {
        // For create, default to "append at the end" when the admin didn't bump the field.
        const orderValue = Number.isFinite(edit.order) ? edit.order : members.length;
        await api.createTeamMember({ ...payload, order: orderValue } as Partial<TeamMember>, token!);
      }
    },
    onSuccess: () => {
      toast.success(edit.id ? 'Team member updated successfully' : 'Team member added successfully');
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-team'] });
    },
    onError: () => toast.error('Save failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteTeamMember(id, token!),
    onSuccess: () => {
      toast.success('Team member removed');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['admin-team'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const openCreate = () => {
    setEdit({ ...EMPTY, order: members.length });
    setEditTarget(null);
    setRichOpen(false);
    setLinkUserId(null);
    setLinkUser(null);
    setLinkQuery('');
    setLinkResults([]);
    setSyncedFrom({});
    setEditOpen(true);
  };
  const openEdit = (m: TeamMember) => {
    // For inherited fields, the form starts blank so the placeholder shows the user's value
    // and a small "from account" chip clarifies the source. The user can type to override.
    const synced = m._syncedFrom ?? {};
    const initial = (field: keyof TeamMember, fallback: string) =>
      synced[field as string] === 'user' ? '' : ((m[field] as string | undefined) ?? fallback);
    setEdit({
      id: m.id,
      name: m.name,
      role: m.role,
      team: m.team,
      imageUrl: initial('imageUrl', ''),
      github: initial('github', ''),
      linkedin: initial('linkedin', ''),
      twitter: initial('twitter', ''),
      instagram: m.instagram || '',
      website: initial('website', ''),
      bio: initial('bio', ''),
      vision: m.vision || '',
      story: m.story || '',
      expertise: m.expertise || '',
      achievements: m.achievements || '',
      slug: m.slug || '',
      order: m.order ?? 0,
    });
    setEditTarget(m);
    setSyncedFrom(synced);
    setRichOpen(Boolean(m.bio || m.vision || m.story || m.expertise || m.achievements || m.website));
    setLinkUserId(m.userId || null);
    setLinkUser(
      m.userId && m.user
        ? {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            avatar: m.user.avatar ?? null,
            bio: m.user.bio ?? null,
            githubUrl: m.user.githubUrl ?? null,
            linkedinUrl: m.user.linkedinUrl ?? null,
            twitterUrl: m.user.twitterUrl ?? null,
            websiteUrl: m.user.websiteUrl ?? null,
          }
        : null,
    );
    setLinkQuery('');
    setLinkResults([]);
    setEditOpen(true);
  };

  // Debounced user search for the "Link to user" mini-section.
  // Active whenever the dialog is open, no member is currently linked, and the query is non-empty.
  // This means CREATE and EDIT both get search.
  useEffect(() => {
    if (!editOpen || linkUserId || !linkQuery.trim() || !token) {
      setLinkResults([]);
      return;
    }
    setLinkSearching(true);
    const handle = setTimeout(async () => {
      try {
        const results = await api.searchUsers(linkQuery.trim(), token);
        setLinkResults(results.users.slice(0, 8));
      } catch {
        setLinkResults([]);
      } finally {
        setLinkSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [editOpen, linkUserId, linkQuery, token]);

  // Live re-link is used when editing an existing member who already has a linked user
  // and the admin wants to swap accounts immediately (without first clicking Save).
  const linkMut = useMutation({
    mutationFn: ({ memberId, userId }: { memberId: string; userId: string | null }) =>
      api.linkTeamMemberToUser(memberId, userId, token!),
    onSuccess: (_data, vars) => {
      toast.success(vars.userId ? 'Team member linked to user account' : 'Team member unlinked from user account');
      setLinkQuery('');
      setLinkResults([]);
      qc.invalidateQueries({ queryKey: ['admin-team'] });
    },
    onError: () => toast.error('Link failed'),
  });

  const stageLink = async (u: LinkedUser) => {
    setLinkUserId(u.id);
    setLinkUser(u);
    setLinkQuery('');
    setLinkResults([]);
    // Search results only carry name/email/avatar; fetch full user profile so we can pre-fill
    // empty form fields (CAT 1). We do NOT overwrite values the admin has already typed.
    let full: LinkedUser = u;
    if (token) {
      try {
        const detail = await api.getUser(u.id, token);
        full = {
          id: detail.id,
          name: detail.name,
          email: detail.email,
          avatar: detail.avatar ?? null,
          bio: detail.bio ?? null,
          githubUrl: detail.githubUrl ?? null,
          linkedinUrl: detail.linkedinUrl ?? null,
          twitterUrl: detail.twitterUrl ?? null,
          websiteUrl: detail.websiteUrl ?? null,
        };
        setLinkUser(full);
      } catch {
        /* keep the search-result LinkedUser */
      }
    }
    setEdit((prev) => ({
      ...prev,
      name: prev.name.trim() || full.name,
      imageUrl: prev.imageUrl.trim() || (full.avatar ?? '') || '',
      bio: prev.bio.trim() || (full.bio ?? '') || '',
      github: prev.github.trim() || (full.githubUrl ?? '') || '',
      linkedin: prev.linkedin.trim() || (full.linkedinUrl ?? '') || '',
      twitter: prev.twitter.trim() || (full.twitterUrl ?? '') || '',
      website: prev.website.trim() || (full.websiteUrl ?? '') || '',
    }));
    // If we're editing an existing record and it doesn't have a link yet, persist live.
    if (editTarget && !editTarget.userId) {
      linkMut.mutate({ memberId: editTarget.id, userId: u.id });
    }
  };

  const requestUnlink = () => {
    if (editTarget?.userId) {
      setConfirmUnlink(true);
    } else {
      // Pre-save link (CREATE flow) — no destructive consequence, just clear.
      setLinkUserId(null);
      setLinkUser(null);
      setLinkQuery('');
      setLinkResults([]);
    }
  };

  const doUnlink = () => {
    setLinkUserId(null);
    setLinkUser(null);
    setLinkQuery('');
    setLinkResults([]);
    if (editTarget?.userId) {
      linkMut.mutate({ memberId: editTarget.id, userId: null });
    }
    setConfirmUnlink(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Team</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">The public Team page renders this list, grouped by team.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="/team" target="_blank" rel="noreferrer">
              <Eye size={13} className="mr-1.5" />
              Preview public
            </a>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus size={13} className="mr-1.5" />
            Add member
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <DSCard padded={false}>
          <div className="divide-y divide-[var(--border-subtle)]">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-3 py-2.5 flex items-center gap-3 animate-pulse">
                <div className="size-10 rounded-full bg-[var(--surface-soft)]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 bg-[var(--surface-soft)] rounded" />
                  <div className="h-2.5 w-20 bg-[var(--surface-soft)] rounded" />
                </div>
              </div>
            ))}
          </div>
        </DSCard>
      ) : members.length === 0 ? (
        <DSCard padded>
          <EmptyState title="No team members yet" body="Add the first member to populate the public Team page." action={<Button size="sm" onClick={openCreate}>Add member</Button>} />
        </DSCard>
      ) : (
        Object.entries(grouped).map(([team, list]) => (
          <Section key={team} eyebrow="Group" title={`${team} · ${list.length}`}>
            <DSCard padded={false}>
              <div className="divide-y divide-[var(--border-subtle)]">
                {list.map((m) => (
                  <div key={m.id} className="group px-3 py-2.5 flex items-center gap-3 hover:bg-[var(--surface-soft)]/40 transition-colors">
                    {/* Avatar — compact 40px circle, image-or-initials, with onError fallback */}
                    <div className="size-10 rounded-full overflow-hidden shrink-0 ring-1 ring-[var(--border-subtle)] bg-[var(--surface-soft)]">
                      {m.imageUrl ? (
                        <img
                          src={m.imageUrl}
                          alt={m.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(event) => { event.currentTarget.src = '/fallback-avatar.svg'; }}
                        />
                      ) : (
                        <Avatar name={m.name} size={40} />
                      )}
                    </div>

                    {/* Name + role + linked-user badge */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium text-[var(--ds-text-1)] truncate">{m.name}</span>
                        {m.userId && <Pill tone="success" size="xs">Linked</Pill>}
                        {typeof m.order === 'number' && (
                          <span className="font-mono tabular-nums text-[10.5px] text-[var(--ds-text-3)]">#{m.order}</span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">{m.role}</div>
                    </div>

                    {/* Inline socials (compact, only icons that are present) */}
                    <div className="hidden md:flex items-center gap-0.5 mr-1">
                      {m.github && <SocialChip icon={Github} href={`https://github.com/${m.github.replace(/^https?:\/\/(www\.)?github\.com\//, '')}`} />}
                      {m.linkedin && <SocialChip icon={Linkedin} href={m.linkedin.startsWith('http') ? m.linkedin : `https://linkedin.com/in/${m.linkedin}`} />}
                      {m.twitter && <SocialChip icon={Send} href={m.twitter.startsWith('http') ? m.twitter : `https://twitter.com/${m.twitter}`} />}
                      {m.instagram && <SocialChip icon={Instagram} href={m.instagram.startsWith('http') ? m.instagram : `https://instagram.com/${m.instagram}`} />}
                      {m.website && <SocialChip icon={Globe} href={m.website} />}
                    </div>

                    {/* Edit + Remove actions — always visible (touch users can't hover) */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => openEdit(m)}
                        className="size-7 rounded-[6px] hover:bg-[var(--bg-raised)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center border border-[var(--border-subtle)]"
                        title="Edit"
                        aria-label={`Edit ${m.name}`}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => setDeleting(m)}
                        className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center border border-[var(--border-subtle)]"
                        title="Remove"
                        aria-label={`Remove ${m.name}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </DSCard>
          </Section>
        ))
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit.id ? 'Edit member' : 'Add member'}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" required className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Role" required><Input value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} placeholder="e.g. Tech Lead" /></Field>
            <Field label="Team">
              <select
                value={edit.team}
                onChange={(e) => setEdit({ ...edit, team: e.target.value })}
                className="h-9 w-full px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
              >
                {TEAM_GROUPS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Image URL" className="sm:col-span-2" badge={syncBadge(edit.imageUrl, linkUserId, syncedFrom.imageUrl)}>
              <Input value={edit.imageUrl} onChange={(e) => setEdit({ ...edit, imageUrl: e.target.value })} placeholder={linkUser?.avatar || 'https://…'} />
            </Field>
            <Field label="GitHub" badge={syncBadge(edit.github, linkUserId, syncedFrom.github)}>
              <Input value={edit.github} onChange={(e) => setEdit({ ...edit, github: e.target.value })} placeholder={linkUser?.githubUrl || 'username or URL'} />
            </Field>
            <Field label="LinkedIn" badge={syncBadge(edit.linkedin, linkUserId, syncedFrom.linkedin)}>
              <Input value={edit.linkedin} onChange={(e) => setEdit({ ...edit, linkedin: e.target.value })} placeholder={linkUser?.linkedinUrl || 'username or URL'} />
            </Field>
            <Field label="Twitter / X" badge={syncBadge(edit.twitter, linkUserId, syncedFrom.twitter)}>
              <Input value={edit.twitter} onChange={(e) => setEdit({ ...edit, twitter: e.target.value })} placeholder={linkUser?.twitterUrl || ''} />
            </Field>
            <Field label="Instagram"><Input value={edit.instagram} onChange={(e) => setEdit({ ...edit, instagram: e.target.value })} /></Field>
            <Field
              label="Website"
              className="sm:col-span-2"
              hint="Optional personal site"
              badge={syncBadge(edit.website, linkUserId, syncedFrom.website)}
            >
              <Input value={edit.website} onChange={(e) => setEdit({ ...edit, website: e.target.value })} placeholder={linkUser?.websiteUrl || 'https://yourdomain.dev'} />
            </Field>
            <Field
              label="Profile slug"
              hint="URL-safe handle for /team/<slug>. Leave blank to auto-generate."
            >
              <Input
                value={edit.slug}
                onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80) })}
                placeholder="lakshya-aarya"
              />
            </Field>
            <Field
              label="Display order"
              hint="Smaller numbers render first within the team group."
            >
              <Input
                type="number"
                min={0}
                value={Number.isFinite(edit.order) ? edit.order : 0}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  setEdit({ ...edit, order: Number.isFinite(parsed) ? parsed : 0 });
                }}
              />
            </Field>
          </div>

          {/* Rich profile (bio, vision, story, expertise, achievements) — surfaces on /team/:slug */}
          <div className="rounded-[8px] border border-[var(--border-subtle)] mt-2">
            <button
              type="button"
              onClick={() => setRichOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-[12.5px] font-semibold text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)]/40 rounded-t-[8px]"
            >
              <span>Rich profile fields (shown on public profile)</span>
              {richOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {richOpen && (
              <div className="flex flex-col gap-3 p-3 border-t border-[var(--border-subtle)]">
                <Field
                  label="Bio"
                  hint="Short summary (Markdown supported)"
                  badge={syncBadge(edit.bio, linkUserId, syncedFrom.bio)}
                >
                  <textarea
                    value={edit.bio}
                    onChange={(e) => setEdit({ ...edit, bio: e.target.value })}
                    placeholder={linkUser?.bio || 'A few lines about this member…'}
                    rows={3}
                    className="w-full px-3 py-2 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                  />
                </Field>
                <Field label="Vision" hint="Personal mission / philosophy">
                  <textarea
                    value={edit.vision}
                    onChange={(e) => setEdit({ ...edit, vision: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                  />
                </Field>
                <Field label="Story" hint="Background, journey, what brought them here">
                  <textarea
                    value={edit.story}
                    onChange={(e) => setEdit({ ...edit, story: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                  />
                </Field>
                <Field label="Expertise" hint="Areas of focus or specialism">
                  <textarea
                    value={edit.expertise}
                    onChange={(e) => setEdit({ ...edit, expertise: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                  />
                </Field>
                <Field label="Achievements" hint="Notable wins, awards, milestones">
                  <textarea
                    value={edit.achievements}
                    onChange={(e) => setEdit({ ...edit, achievements: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Link to user account — available in both CREATE and EDIT.
              On create, the staged link is sent inside `createTeamMember`'s payload.
              On edit with an existing link, "Unlink" calls `linkTeamMemberToUser(memberId, null)` live;
              picking a different user re-stages and persists immediately as well. */}
          <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-soft)]/50 p-3 mt-2">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[12px] font-semibold text-[var(--ds-text-2)] flex items-center gap-1.5">
                <Link2 size={12} className="text-[var(--ds-text-3)]" />
                Link to user account
              </div>
              {linkUserId ? (
                <Pill tone="success" size="xs">Linked</Pill>
              ) : (
                <Pill tone="neutral" size="xs">Not linked</Pill>
              )}
            </div>
            {linkUserId && linkUser ? (
              <div className="flex items-center gap-2.5">
                <Avatar name={linkUser.name} src={linkUser.avatar ?? undefined} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{linkUser.name}</div>
                  {linkUser.email && (
                    <div className="text-[11px] text-[var(--ds-text-3)] truncate">{linkUser.email}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={requestUnlink}
                  disabled={linkMut.isPending}
                >
                  <UserMinus size={11} className="mr-1.5" />
                  Unlink
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-[11px] text-[var(--ds-text-3)] mb-1.5">
                  Optional. Linking lets the public profile inherit avatar / bio / socials from the user account.
                </p>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                  <Input
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    placeholder="Search users by name or email…"
                    className="pl-7 h-8 text-[12.5px]"
                  />
                </div>
                {linkSearching && (
                  <div className="text-[11px] text-[var(--ds-text-3)] mt-1.5">Searching…</div>
                )}
                {linkResults.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] divide-y divide-[var(--border-subtle)]">
                    {linkResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => stageLink(u)}
                        disabled={linkMut.isPending}
                        className="w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-[var(--surface-soft)]"
                      >
                        <Avatar name={u.name} src={u.avatar ?? undefined} size={22} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium truncate">{u.name}</div>
                          <div className="text-[11px] text-[var(--ds-text-3)] truncate">{u.email}</div>
                        </div>
                        <Link2 size={11} className="text-[var(--ds-text-3)]" />
                      </button>
                    ))}
                  </div>
                )}
                {linkQuery.trim() && !linkSearching && linkResults.length === 0 && (
                  <div className="text-[11px] text-[var(--ds-text-3)] mt-1.5">No matches.</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !edit.name.trim() || !edit.role.trim()}>
              {saveMut.isPending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>They will no longer appear on the public Team page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              disabled={deleteMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUnlink} onOpenChange={setConfirmUnlink}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {linkUser?.name ?? 'this user'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {(linkUser?.name ?? 'They')} will no longer stay synced with this team profile. Inherited fields will keep their last-known values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doUnlink}
              disabled={linkMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Per-field source chip: empty value with a linked user = inherited from account.
// Non-empty value with a linked user = explicit override. Matches HEAD's behaviour.
function syncBadge(value: string, linkUserId: string | null, syncedFrom: 'user' | 'team' | undefined): import('react').ReactNode {
  if (!linkUserId) return null;
  if (!value.trim()) {
    // We render an "inherited" chip whether or not server marked _syncedFrom (so CREATE shows it too).
    void syncedFrom;
    return <Pill tone="info" size="xs">from account</Pill>;
  }
  return <Pill tone="neutral" size="xs">override</Pill>;
}

// Compact social chip for the row list (no white background — sits on the row hover bg).
function SocialChip({ icon: Icon, href }: { icon: typeof Github; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="size-6 rounded-[5px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] hover:bg-[var(--bg-raised)] flex items-center justify-center transition-colors"
      title={Icon.displayName ?? 'Open'}
    >
      <Icon size={11} />
    </a>
  );
}

// silence unused imports
void cn;
