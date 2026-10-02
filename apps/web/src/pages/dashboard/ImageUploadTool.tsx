// Dashboard v2 — Upload Image library.
// Drag-drop dropzone + gallery of past uploads. Uploads go to Cloudinary and the
// returned CDN URL is the whole point: paste it into events/announcements/etc.
//
// IMPORTANT (by design): no image link is persisted server-side. The gallery is
// stored ONLY in this browser's localStorage — POST /api/upload/image returns the
// Cloudinary URL + metadata and the client owns the history. Clearing browser
// storage (or switching device) clears the list; the Cloudinary assets remain.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload, Search, Copy, Check, Trash2, Loader2, ExternalLink, Link2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { DSCard, EmptyState, Pill, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/dateUtils';

// One entry in the localStorage-backed image library.
interface StoredImage {
  id: string;
  url: string;
  publicId: string;
  filename: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  createdAt: string;
}

const STORAGE_KEY = 'codescriet:image-library:v1';
// Bound the list so localStorage can't grow without limit (~quota-safe).
const MAX_ITEMS = 200;

function fmtBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function loadLibrary(): StoredImage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: only keep well-formed rows (storage can be hand-edited / stale).
    return parsed.filter(
      (r): r is StoredImage =>
        r && typeof r.url === 'string' && typeof r.id === 'string',
    );
  } catch {
    return [];
  }
}

function saveLibrary(items: StoredImage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // Quota or private-mode failure — non-fatal; the in-memory list still works
    // for this session.
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts / older browsers without the async API.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function ImageUploadTool() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [items, setItems] = useState<StoredImage[]>(() => loadLibrary());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Persist to localStorage on every change — this IS the source of truth.
  useEffect(() => {
    saveLibrary(items);
  }, [items]);

  const uploadMut = useMutation({
    mutationFn: (file: File) => api.uploadImageDetailed(file, token!),
    onError: (e: Error) => toast.error(e.message || 'Upload failed'),
  });

  const addToLibrary = (img: Omit<StoredImage, 'id' | 'createdAt'>) => {
    setItems((prev) => {
      // De-dupe by publicId (re-upload of the same asset) — newest wins, moved to front.
      const withoutDupe = prev.filter((p) => p.publicId !== img.publicId || !img.publicId);
      const entry: StoredImage = {
        ...img,
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            // Fallback (old browsers): timestamp + randomness, NOT prev.length —
            // an index suffix collides after a delete-then-re-upload.
            : `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
      };
      return [entry, ...withoutDupe].slice(0, MAX_ITEMS);
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    let ok = 0;
    for (const f of list) {
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} is not an image`);
        continue;
      }
      try {
        const res = await uploadMut.mutateAsync(f);
        if (res.url) {
          addToLibrary({
            url: res.url,
            publicId: res.publicId,
            filename: res.filename ?? f.name ?? null,
            bytes: res.bytes,
            width: res.width,
            height: res.height,
            format: res.format,
          });
          ok++;
        }
      } catch {
        // Surfaced by the mutation's onError toast; keep going with the rest.
      }
    }
    // Per-file failures are already surfaced (invalid-type toast above, or the
    // mutation's onError for server failures); only summarise the successes.
    if (ok > 0) toast.success(`${ok} image${ok > 1 ? 's' : ''} uploaded`);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        !search.trim()
          ? true
          : (i.filename ?? i.publicId).toLowerCase().includes(search.toLowerCase()),
      ),
    [items, search],
  );
  const totalBytes = items.reduce((sum, i) => sum + (i.bytes ?? 0), 0);

  // Reset the per-item "copied" flash after a short delay.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copyUrl = async (url: string, id: string) => {
    if (await copyText(url)) {
      setCopied(id);
      toast.success('Link copied');
    } else {
      toast.error('Could not copy');
    }
  };

  // Copy many links at once, comma-separated. Targets the selection if any, else
  // every link in the current (filtered) view.
  const copyAll = async () => {
    const source = selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered;
    const urls = source.map((i) => i.url);
    if (urls.length === 0) {
      toast.error('No links to copy');
      return;
    }
    if (await copyText(urls.join(', '))) {
      toast.success(`Copied ${urls.length} link${urls.length > 1 ? 's' : ''}`);
    } else {
      toast.error('Could not copy');
    }
  };

  const removeFromLibrary = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearLibrary = () => {
    setItems([]);
    setSelected(new Set());
    toast.success('Library cleared (this device only)');
  };

  const selCount = selected.size;
  const copyAllLabel =
    selCount > 0 ? `Copy ${selCount} selected` : filtered.length > 0 ? `Copy all (${filtered.length})` : 'Copy all';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Upload</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Image library</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1 max-w-prose">
            Drop images to get a public CDN link — paste it into events, announcements, and certificates.
            Auto-optimised. Links are kept only in this browser, never on the server.
          </p>
        </div>
        <Pill tone="neutral" size="sm">
          <span className="font-mono tabular-nums">{(totalBytes / (1024 * 1024)).toFixed(1)}</span> MB · {items.length} saved
        </Pill>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'rounded-[14px] border-2 border-dashed p-10 text-center cursor-pointer transition-colors',
          dragOver
            ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/30'
            : 'border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]/20',
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="size-12 rounded-full bg-[var(--surface-soft)] flex items-center justify-center mx-auto mb-3">
          {uploadMut.isPending ? <Loader2 size={20} className="animate-spin text-[var(--accent)]" /> : <Upload size={20} className="text-[var(--ds-text-2)]" />}
        </div>
        <div className="text-[15px] font-semibold">
          {uploadMut.isPending ? 'Uploading…' : 'Drop images here'}
        </div>
        <p className="text-[12.5px] text-[var(--ds-text-3)] mt-1">
          or <span className="text-[var(--accent)] font-medium">browse files</span> · JPG, PNG, WebP, GIF up to 5 MB each
        </p>
        <div className="flex items-center justify-center gap-3 mt-4 text-[11px] text-[var(--ds-text-3)]">
          <span className="inline-flex items-center gap-1"><Check size={10} className="text-[var(--success)]" /> Auto-optimise</span>
          <span className="inline-block w-px h-3 bg-[var(--border-default)]" />
          <span className="inline-flex items-center gap-1"><Check size={10} className="text-[var(--success)]" /> WebP variants</span>
          <span className="inline-block w-px h-3 bg-[var(--border-default)]" />
          <span className="inline-flex items-center gap-1"><Check size={10} className="text-[var(--success)]" /> Public CDN URL</span>
        </div>
      </div>

      <Section
        eyebrow="Library"
        title={items.length === 0 ? 'Empty' : `${items.length} saved`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={copyAll}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12.5px] font-medium bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 transition-opacity"
                  title="Copy links, comma-separated"
                >
                  <Link2 size={13} /> {copyAllLabel}
                </button>
                <button
                  type="button"
                  onClick={clearLibrary}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12.5px] font-medium border border-[var(--border-default)] text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] transition-colors"
                  title="Remove all saved links from this browser"
                >
                  <Trash2 size={13} /> Clear
                </button>
              </>
            )}
            <div className="relative w-full sm:w-[220px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by filename…"
                className="pl-8 h-8 text-[13px]"
              />
            </div>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <DSCard padded>
            <EmptyState
              icon={<Upload size={18} />}
              title={items.length === 0 ? 'No uploads yet' : 'No matches'}
              body={items.length === 0 ? 'Drop your first image above to start building the library.' : 'Try a different search term.'}
            />
          </DSCard>
        ) : (
          <div className="grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {filtered.map((g) => {
              const isSel = selected.has(g.id);
              return (
                <div key={g.id} className="text-left">
                  <button
                    type="button"
                    onClick={() => toggleSelect(g.id)}
                    title={isSel ? 'Deselect' : 'Select for copy-all'}
                    className={cn(
                      'block w-full aspect-square rounded-[10px] relative overflow-hidden border bg-[var(--surface-soft)] cursor-pointer',
                      isSel ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40' : 'border-[var(--border-subtle)]',
                    )}
                  >
                    <img src={g.url} alt={g.filename ?? ''} className="w-full h-full object-cover" loading="lazy" />
                    {/* Selection tick — always visible, doubles as the tap target on touch */}
                    <span
                      className={cn(
                        'absolute top-1.5 left-1.5 size-5 rounded-[5px] flex items-center justify-center transition-colors',
                        isSel ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-black/45 text-white',
                      )}
                    >
                      {isSel && <Check size={12} />}
                    </span>
                  </button>
                  {/* Action row — ALWAYS visible (no hover); fully tappable on phones */}
                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyUrl(g.url, g.id)}
                      className={cn(
                        'flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-[7px] text-[11.5px] font-medium border transition-colors',
                        copied === g.id
                          ? 'border-[var(--success)] text-[var(--success)] bg-[var(--success)]/10'
                          : 'border-[var(--border-default)] text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] hover:border-[var(--accent)]',
                      )}
                    >
                      {copied === g.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy link</>}
                    </button>
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in new tab"
                      className="size-7 shrink-0 rounded-[7px] border border-[var(--border-default)] text-[var(--ds-text-2)] flex items-center justify-center hover:bg-[var(--surface-soft)] hover:border-[var(--accent)] transition-colors"
                    >
                      <ExternalLink size={12} />
                    </a>
                    <button
                      type="button"
                      title="Remove from this list (keeps the Cloudinary file)"
                      onClick={() => removeFromLibrary(g.id)}
                      className="size-7 shrink-0 rounded-[7px] border border-[var(--border-default)] text-[var(--ds-text-2)] flex items-center justify-center hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] font-medium font-mono truncate text-[var(--ds-text-2)]" title={g.filename ?? g.publicId}>
                    {g.filename ?? g.publicId.split('/').pop() ?? g.url}
                  </div>
                  <div className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums truncate">
                    {g.width && g.height ? `${g.width}×${g.height}` : '—'} · {fmtBytes(g.bytes ?? null)} · {relativeTime(g.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
