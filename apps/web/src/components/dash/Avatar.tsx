import { cn } from '@/lib/utils';

interface Props {
  name?: string;
  src?: string | null;
  size?: number;
  status?: 'online' | 'away' | 'busy' | 'offline';
  className?: string;
  title?: string;
}

export function Avatar({ name = '', src, size = 32, status, className, title }: Props) {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Deterministic hue from name hash
  const hue = name.split('').reduce((h, c) => (h + c.charCodeAt(0) * 7) % 360, 0);
  const bg = `hsl(${hue} 32% 76%)`;
  const fg = `hsl(${hue} 50% 22%)`;

  const dotColor =
    status === 'online' ? 'var(--success)' :
    status === 'away' ? 'var(--warning)' :
    status === 'busy' ? 'var(--danger)' :
    'var(--ds-text-3)';

  return (
    <span
      className={cn('relative inline-flex items-center justify-center font-semibold select-none shrink-0', className)}
      title={title ?? name}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: src ? undefined : bg,
        color: fg,
        borderRadius: size <= 24 ? 6 : 999,
        backgroundImage: src ? `url(${src})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {!src && initials}
      {status && (
        <span
          className="absolute rounded-full border-2 border-[var(--bg-raised)]"
          style={{
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            right: -1,
            bottom: -1,
            background: dotColor,
          }}
        />
      )}
    </span>
  );
}
