// Dashboard v2 — My Certificates.
// Grid of gradient cert cards; click → preview Dialog with download + verify links.
// Design source: screen-stubs.jsx:136 (CertificatesScreen).

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, ExternalLink, Download, Copy, Check, Share2, ArrowDownAZ, ArrowUpAZ, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { DSCard, EmptyState, MonoChip, Pill, SegmentedTabs } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 12;

interface MyCert {
  id: string;
  certId: string;
  type: string;
  eventName: string;
  issuedAt: string;
  pdfUrl?: string | null;
  isRevoked?: boolean;
  revokedReason?: string | null;
  recipientName?: string;
}

const COVERS = [
  'from-rose-500 to-orange-600',
  'from-amber-500 to-yellow-600',
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-indigo-600',
  'from-violet-500 to-fuchsia-600',
  'from-pink-500 to-rose-600',
];

const TYPE_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'info'> = {
  PARTICIPATION: 'neutral',
  COMPLETION: 'success',
  WINNER: 'warning',
  SPEAKER: 'info',
};

type TypeFilter = 'all' | 'PARTICIPATION' | 'COMPLETION' | 'WINNER' | 'SPEAKER';

export default function DashboardCertificates() {
  const { token } = useAuth();
  const [picked, setPicked] = useState<MyCert | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['my-certificates'],
    queryFn: async () => {
      const r = await api.getMyCertificates(token!);
      const list = Array.isArray(r) ? r : (r as { certificates: unknown[] }).certificates;
      return (list ?? []) as MyCert[];
    },
    enabled: Boolean(token),
  });

  const allSorted = useMemo(() => {
    const arr = [...(q.data ?? [])];
    arr.sort((a, b) => {
      const ta = new Date(a.issuedAt).getTime();
      const tb = new Date(b.issuedAt).getTime();
      return sortOrder === 'desc' ? tb - ta : ta - tb;
    });
    return arr;
  }, [q.data, sortOrder]);
  const filtered = useMemo(
    () => (typeFilter === 'all' ? allSorted : allSorted.filter((c) => c.type === typeFilter)),
    [allSorted, typeFilter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Reset to page 1 when the filter / sort changes so empty pages aren't shown.
  useEffect(() => { setPage(1); }, [typeFilter, sortOrder]);
  // Clamp page if filtered list shrinks below current page boundary.
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const sorted = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );
  const typeCounts = useMemo(() => ({
    all: allSorted.length,
    PARTICIPATION: allSorted.filter((c) => c.type === 'PARTICIPATION').length,
    COMPLETION: allSorted.filter((c) => c.type === 'COMPLETION').length,
    WINNER: allSorted.filter((c) => c.type === 'WINNER').length,
    SPEAKER: allSorted.filter((c) => c.type === 'SPEAKER').length,
  }), [allSorted]);
  const verifyLink = (certId: string) => `${window.location.origin}/verify/${certId}`;
  const copyLink = async (certId: string) => {
    try {
      await navigator.clipboard.writeText(verifyLink(certId));
      setCopiedId(certId);
      setTimeout(() => setCopiedId((c) => (c === certId ? null : c)), 1800);
      toast.success('Verification link copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">My certificates</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">All certificates are verifiable on a public URL.</p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <a href="/verify" target="_blank" rel="noreferrer">
            <ExternalLink size={13} className="mr-1.5" />
            Verify a certificate
          </a>
        </Button>
      </div>

      {allSorted.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <SegmentedTabs
            items={[
              { value: 'all', label: 'All', count: typeCounts.all },
              { value: 'PARTICIPATION', label: 'Participation', count: typeCounts.PARTICIPATION },
              { value: 'COMPLETION', label: 'Completion', count: typeCounts.COMPLETION },
              { value: 'WINNER', label: 'Winner', count: typeCounts.WINNER },
              { value: 'SPEAKER', label: 'Speaker', count: typeCounts.SPEAKER },
            ]}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as TypeFilter)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            title={`Sort ${sortOrder === 'desc' ? 'oldest first' : 'newest first'}`}
          >
            {sortOrder === 'desc' ? <ArrowDownAZ size={13} className="mr-1.5" /> : <ArrowUpAZ size={13} className="mr-1.5" />}
            {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          </Button>
        </div>
      )}

      {q.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[260px] bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Award size={18} />}
            title="No certificates yet"
            body="Attend an event or win a competition round — your certificates appear here."
          />
        </DSCard>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map((c, i) => (
              <CertCard key={c.id} cert={c} cover={COVERS[i % COVERS.length]} onOpen={() => setPicked(c)} onCopy={() => copyLink(c.certId)} copied={copiedId === c.certId} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-[12.5px] text-[var(--ds-text-3)]">
              <span>
                Showing <span className="font-mono tabular-nums text-[var(--ds-text-2)]">{(page - 1) * PAGE_SIZE + 1}</span>
                –<span className="font-mono tabular-nums text-[var(--ds-text-2)]">{Math.min(page * PAGE_SIZE, filtered.length)}</span>
                {' '}of <span className="font-mono tabular-nums text-[var(--ds-text-2)]">{filtered.length}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft size={12} className="mr-1" /> Prev
                </Button>
                <span className="font-mono tabular-nums text-[12px]">{page} / {totalPages}</span>
                <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next <ChevronRight size={12} className="ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Preview dialog */}
      <Dialog open={Boolean(picked)} onOpenChange={(open) => !open && setPicked(null)}>
        <DialogContent className="max-w-[640px] p-0 overflow-hidden bg-[var(--bg-raised)] border-[var(--border-subtle)]" data-dashboard="true">
          <DialogTitle className="sr-only">Certificate preview</DialogTitle>
          {picked && (
            <>
              <div
                className={cn(
                  'aspect-[1.55/1] bg-gradient-to-br relative text-white',
                  COVERS[sorted.findIndex((c) => c.id === picked.id) % COVERS.length],
                )}
              >
                <div className="absolute inset-0 p-5 flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <Award size={20} className="opacity-90" />
                    <span className="inline-flex items-center h-[20px] px-2 text-[11px] font-medium rounded-[5px] bg-white/20 text-white">
                      {picked.type}
                    </span>
                  </div>
                  <div>
                    {picked.recipientName && (
                      <div className="text-[14px] opacity-80 mb-1">{picked.recipientName}</div>
                    )}
                    <div className="text-[20px] font-semibold leading-tight">{picked.eventName}</div>
                    <div className="text-[12px] opacity-80 font-mono tabular-nums mt-2">{picked.certId}</div>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Pill tone={TYPE_TONE[picked.type] ?? 'neutral'} size="sm">{picked.type}</Pill>
                  <MonoChip>{picked.certId}</MonoChip>
                  <span className="text-[12px] text-[var(--ds-text-3)] font-mono tabular-nums">
                    Issued {new Date(picked.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {picked.isRevoked && <Pill tone="danger" size="sm">Revoked</Pill>}
                </div>
                {picked.isRevoked && picked.revokedReason && (
                  <p className="text-[12.5px] text-[var(--danger)] mt-3">Revoked: {picked.revokedReason}</p>
                )}
                <div className="flex items-center gap-2 mt-5 flex-wrap">
                  {picked.pdfUrl && (
                    <Button size="sm" asChild>
                      <a href={picked.pdfUrl} target="_blank" rel="noreferrer" download>
                        <Download size={13} className="mr-1.5" />
                        Download PDF
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => copyLink(picked.certId)}>
                    {copiedId === picked.certId ? <Check size={13} className="mr-1.5" /> : <Copy size={13} className="mr-1.5" />}
                    {copiedId === picked.certId ? 'Copied' : 'Copy verify link'}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={verifyLink(picked.certId)} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} className="mr-1.5" />
                      Open verify page
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CertCard({
  cert, cover, onOpen, onCopy, copied,
}: {
  cert: MyCert;
  cover: string;
  onOpen: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <DSCard padded={false} hover className="overflow-hidden cursor-pointer" onClick={onOpen}>
      <div className={cn('aspect-[1.4/1] bg-gradient-to-br p-4 text-white flex flex-col justify-between relative', cover)}>
        {cert.isRevoked && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Pill tone="danger" size="md">Revoked</Pill>
          </div>
        )}
        <div className="flex items-start justify-between">
          <Award size={18} className="opacity-90" />
          <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium rounded-[5px] bg-white/20 text-white">
            {cert.type}
          </span>
        </div>
        <div>
          <div className="text-[12px] opacity-80 font-mono tabular-nums">{cert.certId}</div>
          <div className="text-[16px] font-semibold leading-tight mt-1 line-clamp-2">{cert.eventName}</div>
        </div>
      </div>
      <div className="p-3 flex items-center justify-between">
        <div className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
          Issued {new Date(cert.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Copy verify link"
            onClick={(ev) => { ev.stopPropagation(); onCopy(); }}
            className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center"
          >
            {copied ? <Check size={12} /> : <Share2 size={12} />}
          </button>
          {cert.pdfUrl && (
            <a
              href={cert.pdfUrl}
              target="_blank"
              rel="noreferrer"
              download
              onClick={(ev) => ev.stopPropagation()}
              title="Download PDF"
              className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center"
            >
              <Download size={12} />
            </a>
          )}
        </div>
      </div>
    </DSCard>
  );
}
