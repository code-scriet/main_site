// Dashboard v2 — Create Announcement.
// Two-pane: editor (left) + live preview (right).
// Design source: screen-admin2.jsx:689 (CreateAnnouncementScreen).

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send, Loader2, AlertCircle, Plus, Trash2, Link as LinkIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { DSCard, Field, Pill } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
const PRIORITY_TONE_CLASS: Record<Priority, string> = {
  URGENT: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]',
  HIGH:   'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
  MEDIUM: 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]',
  LOW:    'bg-[var(--surface-soft)] text-[var(--ds-text-2)] border-[var(--border-default)]',
};

interface AttachmentItem { title: string; url: string; type: string }
interface LinkItem { title: string; url: string }

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export default function CreateAnnouncement() {
  const navigate = useNavigate();
  const { token } = useAuth();
  // Edit mode toggles when the route is `/dashboard/announcements/:id/edit`.
  // The same form is reused for both create and update, identical to how EditEvent
  // shares state shape with CreateEvent.
  const { id: editingId } = useParams<{ id?: string }>();
  const isEditing = Boolean(editingId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  useUnsavedChangesWarning(isDirty);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [imageUrl, setImageUrl] = useState('');
  const [coverPreviewError, setCoverPreviewError] = useState(false);
  const [imageGallery, setImageGallery] = useState<string[]>([]);
  const [newGalleryUrl, setNewGalleryUrl] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [newAttachment, setNewAttachment] = useState<AttachmentItem>({ title: '', url: '', type: 'link' });
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [newLink, setNewLink] = useState<LinkItem>({ title: '', url: '' });
  const [expiresAt, setExpiresAt] = useState('');
  const [pinned, setPinned] = useState(false);
  const [featured, setFeatured] = useState(false);

  const slug = useMemo(() => slugify(title), [title]);
  const markDirty = () => setIsDirty(true);

  // Edit-mode prefill — fetch the existing announcement and copy every field.
  // Always reset isDirty afterwards so the unsaved-changes warning doesn't false-fire.
  useEffect(() => {
    if (!isEditing || !editingId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getAnnouncement(editingId);
        if (cancelled) return;
        setTitle(data.title ?? '');
        setBody(data.body ?? '');
        setShortDescription(data.shortDescription ?? '');
        setPriority((data.priority as Priority) ?? 'MEDIUM');
        setImageUrl(data.imageUrl ?? '');
        setImageGallery(Array.isArray(data.imageGallery) ? data.imageGallery : []);
        setTags(Array.isArray(data.tags) ? data.tags : []);
        setAttachments(Array.isArray(data.attachments) ? (data.attachments as AttachmentItem[]) : []);
        setLinks(Array.isArray(data.links) ? (data.links as LinkItem[]) : []);
        setExpiresAt(data.expiresAt ? new Date(data.expiresAt).toISOString().slice(0, 16) : '');
        setPinned(Boolean(data.pinned));
        setFeatured(Boolean(data.featured));
        setIsDirty(false);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load announcement');
          navigate('/dashboard/announcements');
        }
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, isEditing]);

  const submit = async (publish: boolean) => {
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required');
      return;
    }
    if (!token) { setError('Not authenticated'); return; }
    try {
      setLoading(true);
      setError(null);
      const payload = {
        title: title.trim(),
        body: body.trim(),
        shortDescription: shortDescription.trim() || undefined,
        priority,
        imageUrl: imageUrl.trim() || undefined,
        imageGallery: imageGallery.length ? imageGallery : undefined,
        tags: tags.length ? tags : undefined,
        attachments: attachments.length ? attachments : undefined,
        links: links.length ? links : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        pinned,
        featured,
      };
      if (isEditing && editingId) {
        await api.updateAnnouncement(editingId, payload, token);
        toast.success('Announcement updated');
      } else {
        await api.createAnnouncement(payload, token);
        toast.success(publish ? 'Announcement published' : 'Saved as draft');
      }
      setIsDirty(false);
      navigate('/dashboard/announcements');
    } catch (e) {
      setError(e instanceof Error ? e.message : isEditing ? 'Failed to update announcement' : 'Failed to publish');
    } finally {
      setLoading(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-8 w-48 bg-[var(--surface-soft)] rounded animate-pulse" />
        <div className="h-[420px] bg-[var(--surface-soft)] rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{isEditing ? 'Edit' : 'Create'}</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Announcement</h1>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <Button size="sm" variant="outline" onClick={() => submit(false)} disabled={loading}>
              Save draft
            </Button>
          )}
          <Button size="sm" onClick={() => submit(true)} disabled={loading || !title.trim() || !body.trim()}>
            {loading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />}
            {isEditing ? 'Save changes' : 'Publish'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[13px]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-4">
        <DSCard padded className="lg:col-span-7 flex flex-col gap-3">
          <Field label="Title" required>
            <Input value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} placeholder="DSA Sprint registrations close Saturday" />
          </Field>
          <Field label="Slug" hint="auto-from-title">
            <Input value={slug} readOnly className="bg-[var(--surface-soft)] cursor-not-allowed" />
          </Field>
          <Field label="Priority">
            <div className="flex gap-2 flex-wrap">
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setPriority(p); markDirty(); }}
                  className={cn(
                    'px-3 h-8 rounded-[7px] text-[12px] font-medium border transition-colors',
                    priority === p ? PRIORITY_TONE_CLASS[p] : 'bg-transparent text-[var(--ds-text-3)] border-[var(--border-default)] hover:text-[var(--ds-text-1)]',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Short description" hint="One line shown on cards">
            <Input value={shortDescription} onChange={(e) => { setShortDescription(e.target.value); markDirty(); }} maxLength={300} placeholder="Round 3 closes at 11:59 PM IST on Saturday." />
          </Field>
          <Field label="Body" hint="Markdown supported">
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); markDirty(); }}
              className="w-full h-[260px] p-3 text-[13px] font-mono bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
              placeholder="## Heading&#10;&#10;Round 3 closes at **11:59 PM IST**.&#10;&#10;- bullet&#10;- bullet"
            />
          </Field>
          <Field label="Cover image URL" hint="Optional">
            <Input
              value={imageUrl}
              onChange={(e) => { setImageUrl(e.target.value); setCoverPreviewError(false); markDirty(); }}
              placeholder="https://…"
            />
          </Field>
          {imageUrl && coverPreviewError && (
            <div className="text-[11.5px] text-[var(--warning)] flex items-center gap-1.5 -mt-1">
              <AlertCircle size={12} />
              Cover image failed to load. Double-check the URL.
            </div>
          )}

          {/* Image gallery — multi-image carousel for the public detail page */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12.5px] font-medium">Image gallery</div>
              <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums">{imageGallery.length}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Input
                value={newGalleryUrl}
                onChange={(e) => setNewGalleryUrl(e.target.value)}
                placeholder="https://res.cloudinary.com/…/img.jpg"
                className="h-8 text-[13px]"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const url = newGalleryUrl.trim();
                  if (!url) return;
                  setImageGallery((prev) => [...prev, url]);
                  setNewGalleryUrl('');
                  markDirty();
                }}
              >
                <Plus size={11} />
              </Button>
            </div>
            {imageGallery.map((u, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-t border-[var(--border-subtle)] text-[12px]">
                <span className="text-[var(--ds-text-3)] font-mono truncate flex-1 text-[11px]">{u}</span>
                <button
                  type="button"
                  onClick={() => { setImageGallery((p) => p.filter((_, idx) => idx !== i)); markDirty(); }}
                  className="size-6 rounded-[5px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>

          {/* Links */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12.5px] font-medium">Links</div>
              <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums">{links.length}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Input value={newLink.title} onChange={(e) => setNewLink({ ...newLink, title: e.target.value })} placeholder="Title" className="h-8 text-[13px]" />
              <Input value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} placeholder="https://…" className="h-8 text-[13px]" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!newLink.title.trim() || !newLink.url.trim()) return;
                  setLinks((prev) => [...prev, { ...newLink, title: newLink.title.trim(), url: newLink.url.trim() }]);
                  setNewLink({ title: '', url: '' });
                  markDirty();
                }}
              >
                <Plus size={11} />
              </Button>
            </div>
            {links.map((l, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-t border-[var(--border-subtle)] text-[12px]">
                <LinkIcon size={11} className="text-[var(--ds-text-3)] shrink-0" />
                <span className="font-medium truncate flex-1">{l.title}</span>
                <span className="text-[var(--ds-text-3)] truncate max-w-[200px] font-mono text-[11px]">{l.url}</span>
                <button type="button" onClick={() => { setLinks((p) => p.filter((_, idx) => idx !== i)); markDirty(); }} className="size-6 rounded-[5px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

          {/* Attachments */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12.5px] font-medium">Attachments</div>
              <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums">{attachments.length}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Input value={newAttachment.title} onChange={(e) => setNewAttachment({ ...newAttachment, title: e.target.value })} placeholder="Title" className="h-8 text-[13px]" />
              <Input value={newAttachment.url} onChange={(e) => setNewAttachment({ ...newAttachment, url: e.target.value })} placeholder="https://…" className="h-8 text-[13px]" />
              <select
                value={newAttachment.type}
                onChange={(e) => setNewAttachment({ ...newAttachment, type: e.target.value })}
                className="h-8 px-2 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
              >
                <option value="link">link</option>
                <option value="pdf">pdf</option>
                <option value="image">image</option>
                <option value="video">video</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!newAttachment.title.trim() || !newAttachment.url.trim()) return;
                  setAttachments((prev) => [...prev, newAttachment]);
                  setNewAttachment({ title: '', url: '', type: 'link' });
                  markDirty();
                }}
              >
                <Plus size={11} />
              </Button>
            </div>
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-t border-[var(--border-subtle)] text-[12px]">
                <span className="font-mono text-[10px] uppercase text-[var(--ds-text-3)] w-[44px]">{a.type}</span>
                <span className="font-medium truncate flex-1">{a.title}</span>
                <button type="button" onClick={() => { setAttachments((p) => p.filter((_, idx) => idx !== i)); markDirty(); }} className="size-6 rounded-[5px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

          {/* Tags */}
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <div className="text-[12.5px] font-medium mb-2">Tags</div>
            <div className="flex items-center gap-2 mb-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newTag.trim() && !tags.includes(newTag.trim())) {
                      setTags((p) => [...p, newTag.trim()]);
                      setNewTag('');
                      markDirty();
                    }
                  }
                }}
                placeholder="Add tag…"
                className="h-8 text-[13px]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button key={t} type="button" onClick={() => { setTags((p) => p.filter((x) => x !== t)); markDirty(); }} className="inline-flex items-center gap-1 h-6 px-2 rounded-[5px] bg-[var(--surface-soft)] text-[12px] text-[var(--ds-text-2)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]">
                  {t}
                  <Trash2 size={9} />
                </button>
              ))}
            </div>
          </div>

          {/* Misc */}
          <div className="grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3">
            <Field label="Expires at" hint="Optional">
              <Input type="datetime-local" value={expiresAt} onChange={(e) => { setExpiresAt(e.target.value); markDirty(); }} />
            </Field>
            <div className="flex flex-col gap-2 justify-end">
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={pinned} onChange={(e) => { setPinned(e.target.checked); markDirty(); }} />
                Pinned to top
              </label>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={featured} onChange={(e) => { setFeatured(e.target.checked); markDirty(); }} />
                Featured on home
              </label>
            </div>
          </div>
        </DSCard>

        <div className="lg:col-span-5">
          <DSCard padded={false} className="sticky top-[72px]">
            <div className="px-4 h-9 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-sunken)]">
              <span className="text-[11.5px] font-medium text-[var(--ds-text-3)]">Live preview</span>
              <span className="text-[10.5px] font-mono text-[var(--ds-text-3)]">/announcements/{slug || '…'}</span>
            </div>
            <div className="p-5 max-h-[640px] overflow-y-auto">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Pill tone={priority === 'URGENT' ? 'danger' : priority === 'HIGH' ? 'warning' : priority === 'MEDIUM' ? 'info' : 'neutral'} size="xs">{priority}</Pill>
                {pinned && <Pill tone="accent" size="xs">Pinned</Pill>}
                {featured && <Pill tone="warning" size="xs">Featured</Pill>}
                <span className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">just now</span>
              </div>
              <h3 className="text-[18px] font-semibold tracking-tight leading-tight">{title || 'Title goes here'}</h3>
              {shortDescription && <p className="text-[13px] text-[var(--ds-text-2)] mt-2 leading-relaxed">{shortDescription}</p>}
              {imageUrl && !coverPreviewError && (
                <div className="mt-3 rounded-[10px] overflow-hidden">
                  <img
                    src={imageUrl}
                    alt=""
                    className="w-full h-auto"
                    loading="lazy"
                    onError={() => setCoverPreviewError(true)}
                  />
                </div>
              )}
              <div className="mt-4 text-[13px] text-[var(--ds-text-2)] prose prose-sm max-w-none">
                {body.trim() ? <Markdown>{body}</Markdown> : <em className="text-[var(--ds-text-3)]">Markdown body renders here…</em>}
              </div>
              {links.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                  <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-2">Links</div>
                  <ul className="space-y-1 text-[12.5px]">
                    {links.map((l, i) => (
                      <li key={i}>
                        <a href={l.url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">{l.title}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </DSCard>
        </div>
      </div>
    </div>
  );
}
