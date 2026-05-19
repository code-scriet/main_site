// Dashboard v2 — My Profile. Cover gradient + avatar + role pill, stat tiles, then
// Personal + Socials in side-by-side cards, plus Account (email + password + OAuth + sessions)
// and Stats sections below. All data via existing api endpoints.
// Design source: screen-stubs.jsx:69 (ProfileScreen) + brief §6.8.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, Code, Zap, Award, Github, Linkedin, Globe, Send, Lock, KeyRound,
  Pencil, CheckCircle, XCircle, AlertCircle, Users, GraduationCap, Loader2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type TeamMember, type NetworkProfile } from '@/lib/api';
import { Avatar, DSCard, Field, Pill, StatTile, roleTone } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';

const COURSE_OPTIONS = ['BTech', 'MTech', 'BSC', 'MSC', 'BCA', 'MCA'] as const;
const BRANCH_OPTIONS: Record<string, string[]> = {
  BTech: ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AIML', 'DS', 'AG'],
  MTech: ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AIML', 'DS', 'AG'],
  BSC: ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'Statistics'],
  MSC: ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'Statistics'],
  BCA: ['General'],
  MCA: ['General'],
};
const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const;

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  course?: string;
  branch?: string;
  year?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
  createdAt: string;
  hasPassword?: boolean;
  oauthProvider?: string;
  _count: { registrations: number; qotdSubmissions: number };
}

const getPendingEventRedirectPath = (eventId: string, pendingType: 'solo' | 'team') =>
  pendingType === 'team' ? `/events/${eventId}` : `/events/${eventId}?register=1`;

export default function ProfilePage() {
  const { token, user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(redirectTimerRef.current), []);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [course, setCourse] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [isAddingPassword, setIsAddingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Dirty tracking — show sticky save bar only when something changed
  const [initial, setInitial] = useState<ProfileData | null>(null);
  const dirty = useMemo(() => {
    if (!initial) return false;
    return (
      name !== (initial.name || '') ||
      bio !== (initial.bio || '') ||
      avatarUrl !== (initial.avatar || '') ||
      phone !== (initial.phone || '') ||
      course !== (initial.course || '') ||
      branch !== (initial.branch || '') ||
      year !== (initial.year || '') ||
      githubUrl !== (initial.githubUrl || '') ||
      linkedinUrl !== (initial.linkedinUrl || '') ||
      twitterUrl !== (initial.twitterUrl || '') ||
      websiteUrl !== (initial.websiteUrl || '')
    );
  }, [initial, name, bio, avatarUrl, phone, course, branch, year, githubUrl, linkedinUrl, twitterUrl, websiteUrl]);

  useUnsavedChangesWarning(dirty && !saving);

  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [pendingEventType, setPendingEventType] = useState<'solo' | 'team'>('solo');
  const navigationPendingEventId = (location.state as { pendingEventId?: string } | null)?.pendingEventId ?? null;

  useEffect(() => {
    const storagePendingId = localStorage.getItem('pendingEventRegistration');
    const storagePendingType = localStorage.getItem('pendingEventRegistrationType');
    const pendingId = navigationPendingEventId || storagePendingId;
    if (pendingId) {
      if (!storagePendingId) localStorage.setItem('pendingEventRegistration', pendingId);
      setPendingEventId(pendingId);
      setPendingEventType(storagePendingType === 'team' ? 'team' : 'solo');
    }

    const fetchProfile = async () => {
      if (!token) return;
      try {
        const data = await api.getProfile(token);
        setProfile(data);
        setInitial(data);
        setName(data.name || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar || '');
        setPhone(data.phone || '');
        setCourse(data.course || '');
        setBranch(data.branch || '');
        setYear(data.year || '');
        setGithubUrl(data.githubUrl || '');
        setLinkedinUrl(data.linkedinUrl || '');
        setTwitterUrl(data.twitterUrl || '');
        setWebsiteUrl(data.websiteUrl || '');
      } catch {
        setMessage({ type: 'error', text: 'Failed to load profile' });
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [navigationPendingEventId, token]);

  // Stats — pull cert count, problem submissions
  const certsQ = useQuery({
    queryKey: ['my-certificates', 'profile'],
    queryFn: async () => {
      const r = await api.getMyCertificates(token!);
      return Array.isArray(r) ? r : (r as { certificates: unknown[] }).certificates ?? [];
    },
    enabled: Boolean(token),
  });
  const qotdStatsQ = useQuery({
    queryKey: ['qotd-stats', 'profile'],
    queryFn: () => api.getQOTDStats(token!),
    enabled: Boolean(token),
  });

  const availableBranches = course ? BRANCH_OPTIONS[course] ?? [] : [];

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    if (phone && !/^[0-9]{10}$/.test(phone)) {
      setMessage({ type: 'error', text: 'Phone number must be exactly 10 digits' });
      setSaving(false);
      return;
    }
    try {
      await api.updateProfile({
        name, bio, avatarUrl, phone, course, branch, year,
        githubUrl, linkedinUrl, twitterUrl, websiteUrl,
      }, token);
      await refreshUser();
      const fresh = await api.getProfile(token);
      setProfile(fresh);
      setInitial(fresh);
      if (pendingEventId) {
        localStorage.removeItem('pendingEventRegistration');
        localStorage.removeItem('pendingEventRegistrationType');
        setMessage({ type: 'success', text: 'Profile updated. Redirecting to event…' });
        redirectTimerRef.current = setTimeout(() => navigate(getPendingEventRedirectPath(pendingEventId, pendingEventType)), 800);
      } else {
        setMessage({ type: 'success', text: 'Profile saved.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    if (!initial) return;
    setName(initial.name || '');
    setBio(initial.bio || '');
    setAvatarUrl(initial.avatar || '');
    setPhone(initial.phone || '');
    setCourse(initial.course || '');
    setBranch(initial.branch || '');
    setYear(initial.year || '');
    setGithubUrl(initial.githubUrl || '');
    setLinkedinUrl(initial.linkedinUrl || '');
    setTwitterUrl(initial.twitterUrl || '');
    setWebsiteUrl(initial.websiteUrl || '');
  };

  const handlePasswordChange = async () => {
    if (!token) return;
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    setChangingPassword(true);
    try {
      if (isAddingPassword || !profile?.hasPassword) {
        await api.addPassword(newPassword, token);
        setMessage({ type: 'success', text: 'Password set. You can now sign in with email + password.' });
      } else {
        await api.changePassword(currentPassword, newPassword, token);
        setMessage({ type: 'success', text: 'Password changed.' });
      }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setShowPasswordForm(false); setIsAddingPassword(false);
      const fresh = await api.getProfile(token);
      setProfile(fresh);
      void refreshUser();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to update password' });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-5 animate-pulse">
        <div className="h-[120px] bg-[var(--surface-soft)] rounded-[12px]" />
        <div className="h-24 bg-[var(--surface-soft)] rounded-[12px]" />
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="h-64 bg-[var(--surface-soft)] rounded-[12px]" />
          <div className="h-64 bg-[var(--surface-soft)] rounded-[12px]" />
        </div>
      </div>
    );
  }

  if (!profile || !user) return null;

  const eventsCount = profile._count?.registrations ?? 0;
  const qotdsCount = qotdStatsQ.data?.totalSolved ?? profile._count?.qotdSubmissions ?? 0;
  const certCount = Array.isArray(certsQ.data) ? certsQ.data.length : 0;

  return (
    <div className="flex flex-col gap-5 pb-24">
      {/* Cover + avatar + name */}
      <div className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6">
        <div
          className="h-[120px] relative"
          style={{
            background:
              'linear-gradient(135deg, var(--accent) 0%, hsl(var(--accent-h), var(--accent-s), 35%) 100%)',
          }}
        />
        <div className="px-4 sm:px-6 -mt-12 relative">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="relative">
              <Avatar
                name={profile.name}
                src={avatarUrl || undefined}
                size={96}
                className="ring-4 ring-[var(--bg-canvas)]"
              />
              <button
                type="button"
                className="absolute bottom-1 right-1 size-7 rounded-full bg-[var(--bg-raised)] border border-[var(--border-default)] text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] flex items-center justify-center transition-colors"
                title="Change avatar (paste a URL in the form below)"
                onClick={() => document.getElementById('avatar-url-input')?.focus()}
              >
                <Pencil size={12} />
              </button>
            </div>
            <div className="flex-1 min-w-0 mb-2">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-[22px] font-semibold tracking-tight">{profile.name}</h1>
                <Pill tone={roleTone(profile.role)} size="md">{profile.role.replace(/_/g, ' ')}</Pill>
              </div>
              <div className="text-[12.5px] text-[var(--ds-text-3)]">
                {profile.email}
                {profile.branch && ` · ${profile.branch}`}
                {profile.year && ` · ${profile.year}`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={cn(
            'flex items-start gap-2 px-4 py-2.5 rounded-[10px] border text-[13px]',
            message.type === 'success' && 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]',
            message.type === 'error' && 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]',
          )}
        >
          {message.type === 'success' ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100">
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* Stats tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Events attended" value={eventsCount} icon={<Calendar size={15} />} />
        <StatTile label="Problems solved" value={qotdsCount} icon={<Code size={15} />} />
        <StatTile label="QOTD streak" value={qotdStatsQ.data?.currentStreak ?? 0} suffix={qotdStatsQ.data?.longestStreak ? `/ ${qotdStatsQ.data.longestStreak} max` : undefined} icon={<Zap size={15} />} />
        <StatTile label="Certificates" value={certCount} icon={<Award size={15} />} />
      </div>

      {/* Personal + Socials */}
      <div className="grid lg:grid-cols-2 gap-4">
        <DSCard padded>
          <div className="text-[13.5px] font-semibold mb-4">Personal</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" required className="col-span-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Avatar URL" hint="paste a public image URL" className="col-span-2">
              <Input id="avatar-url-input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Course">
              <select
                value={course}
                onChange={(e) => { setCourse(e.target.value); setBranch(''); }}
                className="h-9 w-full px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select…</option>
                {COURSE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Branch">
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={!course}
                className="h-9 w-full px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] disabled:opacity-60"
              >
                <option value="">Select…</option>
                {availableBranches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Year">
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="h-9 w-full px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select…</option>
                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Phone" hint="10 digits, India only">
              <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98XXXXXXXX" />
            </Field>
            <Field label="Bio" className="col-span-2">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                placeholder="3rd-year CS student. Likes graphs, dislikes off-by-ones."
                className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
              />
              <div className="text-[10.5px] text-[var(--ds-text-3)] mt-1 text-right tabular-nums">{bio.length}/500</div>
            </Field>
          </div>
        </DSCard>

        <DSCard padded>
          <div className="text-[13.5px] font-semibold mb-4">Socials</div>
          <div className="flex flex-col gap-3">
            <Field label="GitHub">
              <div className="relative">
                <Github size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                <Input className="pl-8" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/username" />
              </div>
            </Field>
            <Field label="LinkedIn">
              <div className="relative">
                <Linkedin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                <Input className="pl-8" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/username" />
              </div>
            </Field>
            <Field label="Twitter / X">
              <div className="relative">
                <Send size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                <Input className="pl-8" value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://twitter.com/username" />
              </div>
            </Field>
            <Field label="Website">
              <div className="relative">
                <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                <Input className="pl-8" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://yoursite.dev" />
              </div>
            </Field>
          </div>
        </DSCard>
      </div>

      {/* Account */}
      <DSCard padded>
        <div className="text-[13.5px] font-semibold mb-3 flex items-center gap-2">
          <Lock size={14} className="text-[var(--ds-text-3)]" />
          Account
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <Field label="Email">
            <Input value={profile.email} readOnly className="bg-[var(--surface-soft)] cursor-not-allowed" />
          </Field>
          <Field label="OAuth provider">
            <Input value={profile.oauthProvider || '—'} readOnly className="bg-[var(--surface-soft)] cursor-not-allowed" />
          </Field>
        </div>
        {!profile.hasPassword && !showPasswordForm && (
          <div className="mb-3 p-3 rounded-[10px] border border-[var(--info-border)] bg-[var(--info-bg)] text-[12.5px] text-[var(--info)]">
            You signed in with {profile.oauthProvider || 'an OAuth provider'} and don&apos;t have a password yet. Set one so you can sign in with email + password too.
          </div>
        )}
        {!showPasswordForm ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowPasswordForm(true);
              setIsAddingPassword(!profile.hasPassword);
            }}
          >
            <KeyRound size={13} className="mr-1.5" />
            {profile.hasPassword ? 'Change password' : 'Set a password'}
          </Button>
        ) : (
          <div className="flex flex-col gap-3 max-w-md">
            {profile.hasPassword && !isAddingPassword && (
              <Field label="Current password">
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
              </Field>
            )}
            <Field label="New password" hint="min 8 characters">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handlePasswordChange} disabled={changingPassword}>
                {changingPassword ? 'Saving…' : profile.hasPassword && !isAddingPassword ? 'Change password' : 'Set password'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DSCard>

      {/* Inline editors for any team-member / network-profile records linked to this user. */}
      <TeamProfileSection />
      <NetworkProfileSection />

      {/* Sticky save bar */}
      {dirty && (
        <div className="fixed bottom-0 left-0 lg:left-[244px] right-0 z-30 frost border-t border-[var(--border-subtle)] px-4 py-3 flex items-center gap-3 lg:pl-6">
          <Button size="sm" variant="ghost" onClick={discardChanges}>Discard</Button>
          <div className="flex-1 flex items-center gap-2">
            <Pill tone="warning" size="sm" dot>Unsaved changes</Pill>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Inline team-profile editor (only renders if the signed-in user is linked to a TeamMember)
function TeamProfileSection() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['my-team-profile'],
    queryFn: () => api.getMyTeamProfile(token!),
    enabled: Boolean(token),
  });
  const tm = q.data as TeamMember | null | undefined;
  const [bio, setBio] = useState('');
  const [vision, setVision] = useState('');
  const [story, setStory] = useState('');
  const [expertise, setExpertise] = useState('');
  const [achievements, setAchievements] = useState('');
  const [website, setWebsite] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tm) {
      setBio(tm.bio ?? '');
      setVision(tm.vision ?? '');
      setStory(tm.story ?? '');
      setExpertise(tm.expertise ?? '');
      setAchievements(tm.achievements ?? '');
      setWebsite(tm.website ?? '');
    }
  }, [tm]);

  if (!tm) return null;

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.updateTeamMemberProfile(tm.id, {
        bio: bio.trim() || undefined,
        vision: vision.trim() || undefined,
        story: story.trim() || undefined,
        expertise: expertise.trim() || undefined,
        achievements: achievements.trim() || undefined,
        website: website.trim() || undefined,
      }, token);
      toast.success('Team profile updated');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['my-team-profile'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DSCard padded>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-[var(--ds-text-3)]" />
          <span className="text-[13.5px] font-semibold">Team profile</span>
          <Pill tone="core" size="xs">{tm.team}</Pill>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={11} className="mr-1.5" />Edit</Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 size={11} className="mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        )}
      </div>
      <p className="text-[12px] text-[var(--ds-text-3)] mb-3">
        These fields appear on your public team profile at <span className="font-mono">/team/{tm.slug ?? tm.id}</span>.
      </p>
      {editing ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Bio" className="sm:col-span-2">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full h-[80px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Vision">
            <textarea value={vision} onChange={(e) => setVision(e.target.value)} className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Story">
            <textarea value={story} onChange={(e) => setStory(e.target.value)} className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Expertise" hint="comma-separated tags or short paragraph">
            <textarea value={expertise} onChange={(e) => setExpertise(e.target.value)} className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Notable achievements">
            <textarea value={achievements} onChange={(e) => setAchievements(e.target.value)} className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Website" className="sm:col-span-2"><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yoursite.dev" /></Field>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
          <ReadOnlyField label="Bio">{bio || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Vision">{vision || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Story">{story || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Expertise">{expertise || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Achievements">{achievements || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Website">{website || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
        </div>
      )}
    </DSCard>
  );
}

// ─── Inline network-profile editor (only renders if the signed-in user is in the alumni / network table)
function NetworkProfileSection() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['my-network-profile'],
    queryFn: () => api.getMyNetworkProfile(token!),
    enabled: Boolean(token),
  });
  const data = q.data as { data: NetworkProfile | null; hasProfile: boolean } | undefined;
  const np = data?.data ?? null;
  const [bio, setBio] = useState('');
  const [vision, setVision] = useState('');
  const [story, setStory] = useState('');
  const [expertise, setExpertise] = useState('');
  const [achievements, setAchievements] = useState('');
  const [website, setWebsite] = useState('');
  const [designation, setDesignation] = useState('');
  const [company, setCompany] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (np) {
      setBio(np.bio ?? '');
      setVision(np.vision ?? '');
      setStory(np.story ?? '');
      setExpertise(np.expertise ?? '');
      setAchievements(np.achievements ?? '');
      setWebsite(np.personalWebsite ?? '');
      setDesignation(np.designation ?? '');
      setCompany(np.company ?? '');
    }
  }, [np]);

  const saveMut = useMutation({
    mutationFn: () => api.updateNetworkProfile({
      bio: bio.trim() || undefined,
      vision: vision.trim() || undefined,
      story: story.trim() || undefined,
      expertise: expertise.trim() || undefined,
      achievements: achievements.trim() || undefined,
      personalWebsite: website.trim() || undefined,
      designation: designation.trim() || undefined,
      company: company.trim() || undefined,
    }, token!),
    onSuccess: () => {
      toast.success('Network profile updated');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['my-network-profile'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Save failed'),
  });

  if (!np) return null;

  return (
    <DSCard padded>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <GraduationCap size={14} className="text-[var(--ds-text-3)]" />
          <span className="text-[13.5px] font-semibold">Network / alumni profile</span>
          <Pill
            tone={np.status === 'VERIFIED' ? 'success' : np.status === 'PENDING' ? 'warning' : 'danger'}
            size="xs"
          >
            {np.status}
          </Pill>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={11} className="mr-1.5" />Edit</Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 size={11} className="mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        )}
      </div>
      <p className="text-[12px] text-[var(--ds-text-3)] mb-3">
        Public at <span className="font-mono">/network/{np.slug ?? np.id}</span>.
      </p>
      {editing ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Senior Engineer" /></Field>
          <Field label="Company"><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Razorpay" /></Field>
          <Field label="Personal website" className="sm:col-span-2"><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" /></Field>
          <Field label="Bio" className="sm:col-span-2">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full h-[80px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Vision">
            <textarea value={vision} onChange={(e) => setVision(e.target.value)} className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Story">
            <textarea value={story} onChange={(e) => setStory(e.target.value)} className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Expertise">
            <textarea value={expertise} onChange={(e) => setExpertise(e.target.value)} className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
          <Field label="Achievements">
            <textarea value={achievements} onChange={(e) => setAchievements(e.target.value)} className="w-full h-[68px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y" />
          </Field>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
          <ReadOnlyField label="Designation">{designation || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Company">{company || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Bio">{bio || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Vision">{vision || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Story">{story || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
          <ReadOnlyField label="Expertise">{expertise || <em className="text-[var(--ds-text-3)]">empty</em>}</ReadOnlyField>
        </div>
      )}
    </DSCard>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-1">{label}</div>
      <div className="text-[var(--ds-text-2)] whitespace-pre-wrap leading-snug">{children}</div>
    </div>
  );
}
