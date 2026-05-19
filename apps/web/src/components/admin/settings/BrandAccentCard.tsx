// Dashboard v2 — accent picker for AdminSettings.
// Writes Settings.accentColor; SettingsContext refreshes after save and DashboardLayout
// re-applies the new [data-accent] attribute on next render.

import { useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api, type Settings } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SettingsCard } from './SettingsCard';

interface Props {
  settings: Settings;
  onChange: (next: Settings) => void;
  lastSavedAt?: number | null;
  onSaved?: () => void;
}

const ACCENTS: Array<{ id: string; label: string; hex: string }> = [
  { id: 'rust', label: 'Rust', hex: '#E26F3A' },
  { id: 'teal', label: 'Teal', hex: '#1F8A8C' },
  { id: 'indigo', label: 'Indigo', hex: '#5B5BFE' },
  { id: 'violet', label: 'Violet', hex: '#A78BFA' },
  { id: 'mint', label: 'Mint', hex: '#22D3A0' },
  { id: 'mono', label: 'Mono', hex: '#14110D' },
];

export function BrandAccentCard({ settings, onChange, lastSavedAt, onSaved }: Props) {
  const { token } = useAuth();
  const { refreshSettings } = useSettings();
  const [saving, setSaving] = useState<string | null>(null);
  const current = settings.accentColor || 'rust';

  const pick = async (id: string) => {
    if (!token || saving) return;
    setSaving(id);
    onChange({ ...settings, accentColor: id });
    try {
      await api.patchSetting('accentColor', id, token);
      await refreshSettings();
      // Apply immediately to the live dashboard scope so admins see it without reload.
      document.querySelectorAll<HTMLElement>('[data-dashboard]').forEach((el) => {
        el.setAttribute('data-accent', id);
      });
      toast.success(`Accent set to ${id}`);
      onSaved?.();
    } catch {
      toast.error('Failed to update accent');
      onChange({ ...settings, accentColor: current });
    } finally {
      setSaving(null);
    }
  };

  return (
    <SettingsCard
      title="Brand & accent"
      description="Club-wide accent color. Applied across every signed-in dashboard surface; the public site is unaffected."
      icon={Palette}
      lastSavedAt={lastSavedAt}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {ACCENTS.map((a) => {
          const active = current === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a.id)}
              disabled={saving !== null && saving !== a.id}
              aria-pressed={active}
              className={cn(
                'h-auto p-3 flex items-center gap-2.5 justify-start text-left rounded-[8px]',
                'border bg-[var(--bg-raised)] transition-colors',
                'hover:border-[var(--border-strong)]',
                active
                  ? 'border-2 ring-2 ring-offset-2 ring-offset-[var(--bg-raised)]'
                  : 'border-[var(--border-default)]',
                saving !== null && saving !== a.id && 'opacity-60 cursor-not-allowed',
              )}
              style={active ? { borderColor: a.hex, '--tw-ring-color': a.hex } as React.CSSProperties : undefined}
            >
              <span className="size-5 rounded-full shrink-0" style={{ background: a.hex }} />
              <span className="flex-1 text-[13px] font-medium text-[var(--ds-text-1)]">{a.label}</span>
              {active && <Check className="h-3.5 w-3.5" style={{ color: a.hex }} />}
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] text-[var(--ds-text-3)]">
        Tip: change is applied instantly across the live dashboard. Sidebar accent, focus rings, primary buttons, and chart palettes all follow.
      </p>
    </SettingsCard>
  );
}
