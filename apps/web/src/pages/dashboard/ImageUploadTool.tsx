// Dashboard v2 — Upload Image library.
// Drag-drop dropzone + gallery of past uploads (via /api/upload/history). Click → copy URL.
// Pixel-port of screen-admin2.jsx:1111 (UploadImageScreen).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Search, Copy, Check, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { DSCard, EmptyState, Pill, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/dateUtils';

function fmtBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageUploadTool() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const historyQ = useQuery({
    queryKey: ['upload-history'],
    queryFn: () => api.getUploadHistory(token!),
    enabled: Boolean(token),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => api.uploadImage(file, token!),
    onSuccess: () => {
      toast.success('Image uploaded');
      qc.invalidateQueries({ queryKey: ['upload-history'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Upload failed'),
  });

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const f of list) {
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} is not an image`);
        continue;
      }
      await uploadMut.mutateAsync(f).catch(() => undefined);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const items = historyQ.data ?? [];
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

  // Reset "copied" state after a short delay
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      toast.success('URL copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Upload</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Image library</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1 max-w-prose">
            Drop images to use them in events, announcements, and certificates. Auto-optimised + served from a public CDN URL.
          </p>
        </div>
        <Pill tone="neutral" size="sm">
          <span className="font-mono tabular-nums">{(totalBytes / (1024 * 1024)).toFixed(1)}</span> MB used
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
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
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
        title={items.length === 0 ? 'Empty' : `${items.length} recent`}
        action={
          <div className="relative w-full sm:w-[260px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename…"
              className="pl-8 h-8 text-[13px]"
            />
          </div>
        }
      >
        {historyQ.isLoading ? (
          <div className="grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-square bg-[var(--surface-soft)] rounded-[10px] animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <DSCard padded>
            <EmptyState
              icon={<Upload size={18} />}
              title={items.length === 0 ? 'No uploads yet' : 'No matches'}
              body={items.length === 0 ? 'Drop your first image above to start building the library.' : 'Try a different search term.'}
            />
          </DSCard>
        ) : (
          <div className="grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {filtered.map((g) => (
              <div key={g.id} className="group text-left">
                <div className="aspect-square rounded-[10px] relative overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-soft)]">
                  <img src={g.url} alt={g.filename ?? ''} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                  <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      type="button"
                      title="Copy URL"
                      onClick={() => copyUrl(g.url, g.id)}
                      className="size-6 rounded-[6px] bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60"
                    >
                      {copied === g.id ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open"
                      className="size-6 rounded-[6px] bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60"
                    >
                      <Upload size={11} className="rotate-45" />
                    </a>
                  </div>
                </div>
                <div className="mt-1.5 text-[11.5px] font-medium font-mono truncate" title={g.filename ?? g.publicId}>
                  {g.filename ?? g.publicId.split('/').pop()}
                </div>
                <div className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums truncate">
                  {g.width && g.height ? `${g.width}×${g.height}` : '—'} · {fmtBytes(g.bytes ?? null)} · {relativeTime(g.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// silence unused-import
void Trash2;
