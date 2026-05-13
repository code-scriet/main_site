export const CERT_TYPES = ['PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER'] as const;
export type CertType = (typeof CERT_TYPES)[number];

const typeColors: Record<CertType, string> = {
  PARTICIPATION: 'bg-blue-100 text-blue-700',
  COMPLETION: 'bg-green-100 text-green-700',
  WINNER: 'bg-amber-100 text-amber-700',
  SPEAKER: 'bg-purple-100 text-purple-700',
};

export function CertTypeBadge({ type }: { type: CertType }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeColors[type]}`}>
      {type}
    </span>
  );
}
