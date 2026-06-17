import { Award, Check, Download, Share2 } from 'lucide-react';
import { DSCard, Pill } from '@/components/dash';
import { cn } from '@/lib/utils';

const COVER_GRADIENTS = [
  'from-rose-500 to-orange-600',
  'from-amber-500 to-yellow-600',
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-indigo-600',
  'from-violet-500 to-fuchsia-600',
  'from-pink-500 to-rose-600',
];

export interface CertificateCardData {
  id: string;
  certId: string;
  type: string;
  eventName: string;
  eventImageUrl?: string | null;
  issuedAt: string;
  pdfUrl?: string | null;
  isRevoked?: boolean;
  revokedReason?: string | null;
  recipientName?: string;
  viewCount?: number;
}

export function getCertificateCover(index: number): string {
  return COVER_GRADIENTS[index % COVER_GRADIENTS.length];
}

export function CertificateCard({
  cert,
  cover,
  onCopy,
  copied,
  onClick,
  showActions = true,
}: {
  cert: CertificateCardData;
  cover: string;
  onCopy?: () => void;
  copied?: boolean;
  onClick?: () => void;
  showActions?: boolean;
}) {
  const hasEventImage = Boolean(cert.eventImageUrl);

  return (
    <DSCard padded={false} hover className="overflow-hidden cursor-pointer" onClick={onClick}>
      <div
        className={cn(
          'aspect-[1.4/1] bg-gradient-to-br p-4 text-white flex flex-col justify-between relative overflow-hidden',
          !hasEventImage && cover,
        )}
        style={hasEventImage ? { backgroundImage: `url(${cert.eventImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {hasEventImage && (
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.78))]" />
        )}
        {cert.isRevoked && (
          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center">
            <Pill tone="danger" size="md">Revoked</Pill>
          </div>
        )}
        <div className="relative z-10 flex items-start justify-between">
          <Award size={18} className="opacity-90" />
          <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium rounded-[5px] bg-white/20 text-white">
            {cert.type}
          </span>
        </div>
        <div className="relative z-10">
          <div className="text-[12px] opacity-80 font-mono tabular-nums">{cert.certId}</div>
          <div className="text-[16px] font-semibold leading-tight mt-1 line-clamp-2">{cert.eventName}</div>
        </div>
      </div>
      {showActions && (
        <div className="p-3 flex items-center justify-between">
          <div className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
            Issued {new Date(cert.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Copy verify link"
              onClick={(ev) => { ev.stopPropagation(); onCopy?.(); }}
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
      )}
    </DSCard>
  );
}