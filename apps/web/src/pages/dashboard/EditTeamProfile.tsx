import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { api, type TeamMember } from '@/lib/api';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { DSCard, Field, Pill, Avatar, EmptyState } from '@/components/dash';
import {
  ArrowLeft,
  Save,
  Loader2,
  Eye,
  Globe,
  Github,
  Linkedin,
  Twitter,
  Instagram,
  Shield,
  User as UserIcon,
} from 'lucide-react';

type SyncMap = Record<string, 'user' | 'team' | undefined>;

const SOCIAL_LINK_FIELDS: Array<keyof FormState> = ['github', 'linkedin', 'twitter', 'website'];

interface FormState {
  bio: string;
  vision: string;
  story: string;
  expertise: string;
  achievements: string;
  website: string;
  github: string;
  linkedin: string;
  twitter: string;
  instagram: string;
}

function syncBadge(value: string, hasLinkedUser: boolean, syncedFrom: 'user' | 'team' | undefined) {
  if (!hasLinkedUser) return null;
  if (!value.trim()) {
    void syncedFrom;
    return <Pill tone="info" size="xs">from account</Pill>;
  }
  return <Pill tone="neutral" size="xs">override</Pill>;
}

export default function EditTeamProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [member, setMember] = useState<TeamMember | null>(null);
  const [syncedFrom, setSyncedFrom] = useState<SyncMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [isDirty, setIsDirty] = useState(false);
  const skipDirtyRef = useRef(true);
  useUnsavedChangesWarning(isDirty && !saving);

  useEffect(() => () => { clearTimeout(successTimerRef.current); }, []);

  const [form, setForm] = useState<FormState>({
    bio: '',
    vision: '',
    story: '',
    expertise: '',
    achievements: '',
    website: '',
    github: '',
    linkedin: '',
    twitter: '',
    instagram: '',
  });

  useEffect(() => {
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setIsDirty(true);
  }, [form]);

  const isAdmin = user && ['ADMIN', 'PRESIDENT'].includes(user.role);
  const hasLinkedUser = Boolean(member?.userId);

  useEffect(() => {
    if (!id || !token) return;

    const fetchMember = async () => {
      try {
        setLoading(true);
        const result = await api.getTeamMember(id);
        setMember(result);

        const isOwner = user && result.userId === user.id;
        const isAdminUser = user && ['ADMIN', 'PRESIDENT'].includes(user.role);
        if (!isOwner && !isAdminUser) {
          navigate('/dashboard');
          return;
        }

        const synced: SyncMap = result._syncedFrom ?? {};
        setSyncedFrom(synced);

        const initial = (field: keyof TeamMember, fallback: string) =>
          synced[field as string] === 'user' ? '' : ((result[field] as string | undefined) ?? fallback);

        skipDirtyRef.current = true;
        setForm({
          bio: initial('bio', ''),
          vision: result.vision || '',
          story: result.story || '',
          expertise: result.expertise || '',
          achievements: result.achievements || '',
          website: initial('website', ''),
          github: initial('github', ''),
          linkedin: initial('linkedin', ''),
          twitter: initial('twitter', ''),
          instagram: result.instagram || '',
        });
      } catch {
        setError('Failed to load team member profile');
      } finally {
        setLoading(false);
      }
    };

    fetchMember();
  }, [id, token, user, navigate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !token || !member) return;

    try {
      setSaving(true);
      setError(null);
      const payload: Partial<FormState> = {};
      (Object.keys(form) as Array<keyof FormState>).forEach((key) => {
        const trimmed = form[key].trim();
        const isInherited = SOCIAL_LINK_FIELDS.includes(key) || key === 'bio';
        if (isInherited && !trimmed && hasLinkedUser) {
          return;
        }
        payload[key] = form[key];
      });
      await api.updateTeamMemberProfile(id, payload, token);
      setSuccess('Profile updated successfully.');
      setIsDirty(false);
      successTimerRef.current = setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (error && !member) {
    return (
      <DSCard padded>
        <EmptyState
          icon={<UserIcon size={18} />}
          title="Profile unavailable"
          body={error}
          action={
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          }
        />
      </DSCard>
    );
  }

  if (!member) return null;

  const linkedUser = member.user;

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">My team profile</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Edit profile</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Update the content visible on your public team page.</p>
        </div>
        <div className="flex items-center gap-2">
          {member.slug && (
            <Link to={`/team/${member.slug}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                View public page
              </Button>
            </Link>
          )}
        </div>
      </div>

      <DSCard padded>
        <div className="flex items-center gap-3">
          <Avatar name={member.name} src={member.imageUrl || linkedUser?.avatar} size={40} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[var(--ds-text-1)] flex items-center gap-2">
              {member.name}
              {hasLinkedUser ? (
                <Pill tone="success" size="xs">Linked</Pill>
              ) : (
                <Pill tone="neutral" size="xs">Standalone</Pill>
              )}
              {isAdmin ? (
                <Pill tone="warning" size="xs"><Shield className="h-2.5 w-2.5 mr-0.5 inline" />admin</Pill>
              ) : null}
            </div>
            <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5">
              {member.role} · {member.team}
              {linkedUser?.email ? <> · {linkedUser.email}</> : null}
            </div>
          </div>
        </div>
        {hasLinkedUser && (
          <p className="text-[11.5px] text-[var(--ds-text-3)] mt-3">
            Empty fields inherit from this user's account; type to override.
          </p>
        )}
      </DSCard>

      {success && (
        <div role="status" className="rounded-[8px] border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2 text-[12.5px] text-[var(--success)]">
          {success}
        </div>
      )}
      {error && member && (
        <div role="alert" className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-[12.5px] text-[var(--danger)]">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <DSCard padded>
          <div className="text-[13px] font-semibold tracking-tight mb-3">About</div>
          <div className="grid gap-4">
            <Field label="Bio" badge={syncBadge(form.bio, hasLinkedUser, syncedFrom.bio)} hint="Supports Markdown">
              <Textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder={linkedUser?.bio || 'A short bio about yourself...'}
                rows={3}
                className="resize-y"
              />
            </Field>
            <Field label="Vision">
              <Textarea
                value={form.vision}
                onChange={(e) => setForm({ ...form, vision: e.target.value })}
                placeholder="Your personal or professional vision statement..."
                rows={3}
                className="resize-y"
              />
            </Field>
            <Field label="Story">
              <Textarea
                value={form.story}
                onChange={(e) => setForm({ ...form, story: e.target.value })}
                placeholder="Your background, journey, and what brought you here..."
                rows={4}
                className="resize-y"
              />
            </Field>
            <Field label="Expertise">
              <Textarea
                value={form.expertise}
                onChange={(e) => setForm({ ...form, expertise: e.target.value })}
                placeholder="Skills, technologies, areas of focus..."
                rows={3}
                className="resize-y"
              />
            </Field>
            <Field label="Achievements">
              <Textarea
                value={form.achievements}
                onChange={(e) => setForm({ ...form, achievements: e.target.value })}
                placeholder="Notable accomplishments, certifications, awards..."
                rows={3}
                className="resize-y"
              />
            </Field>
          </div>
        </DSCard>

        <DSCard padded>
          <div className="text-[13px] font-semibold tracking-tight mb-3">Social links</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={<span className="inline-flex items-center gap-1.5"><Github className="h-3.5 w-3.5" /> GitHub</span>}
              badge={syncBadge(form.github, hasLinkedUser, syncedFrom.github)}
            >
              <Input
                value={form.github}
                onChange={(e) => setForm({ ...form, github: e.target.value })}
                placeholder={linkedUser?.githubUrl || 'username or URL'}
              />
            </Field>
            <Field
              label={<span className="inline-flex items-center gap-1.5"><Linkedin className="h-3.5 w-3.5" /> LinkedIn</span>}
              badge={syncBadge(form.linkedin, hasLinkedUser, syncedFrom.linkedin)}
            >
              <Input
                value={form.linkedin}
                onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                placeholder={linkedUser?.linkedinUrl || 'username or URL'}
              />
            </Field>
            <Field
              label={<span className="inline-flex items-center gap-1.5"><Twitter className="h-3.5 w-3.5" /> Twitter / X</span>}
              badge={syncBadge(form.twitter, hasLinkedUser, syncedFrom.twitter)}
            >
              <Input
                value={form.twitter}
                onChange={(e) => setForm({ ...form, twitter: e.target.value })}
                placeholder={linkedUser?.twitterUrl || 'username or URL'}
              />
            </Field>
            <Field
              label={<span className="inline-flex items-center gap-1.5"><Instagram className="h-3.5 w-3.5" /> Instagram</span>}
            >
              <Input
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                placeholder="username or URL"
              />
            </Field>
            <Field
              label={<span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Website</span>}
              badge={syncBadge(form.website, hasLinkedUser, syncedFrom.website)}
              className="sm:col-span-2"
            >
              <Input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder={linkedUser?.websiteUrl || 'https://...'}
              />
            </Field>
          </div>
        </DSCard>

        <div className="flex items-center justify-between pt-1 pb-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !isDirty} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
