// Admin picker for the primary code-execution provider (judge + playground).
// Writes Settings.codeExecutionProvider; the CF Worker tries this provider first
// and falls back to the other on an infra failure. SettingsContext refreshes after
// save; the change reaches the judge (≤5 min, usually instant) and playground (≤60s)
// via their cached settings reads — no redeploy needed.

import { useState } from 'react';
import { Cpu, Check } from 'lucide-react';
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

const PROVIDERS: Array<{ id: string; label: string; blurb: string }> = [
  {
    id: 'wandbox',
    label: 'Wandbox',
    blurb: 'Primary historically. Runs all four languages (Python, JavaScript, C++, Java). Falls back to godbolt on an outage — except JavaScript, which godbolt cannot run.',
  },
  {
    id: 'godbolt',
    label: 'godbolt',
    blurb: 'Compiler Explorer. Very reliable for Python, C++, Java (and C). Cannot execute JavaScript/Node — those automatically fall back to Wandbox.',
  },
];

export function CodeExecutionCard({ settings, onChange, lastSavedAt, onSaved }: Props) {
  const { token } = useAuth();
  const { refreshSettings } = useSettings();
  const [saving, setSaving] = useState<string | null>(null);
  const current = settings.codeExecutionProvider || 'wandbox';

  const pick = async (id: string) => {
    if (!token || saving || id === current) return;
    setSaving(id);
    onChange({ ...settings, codeExecutionProvider: id });
    try {
      await api.patchSetting('codeExecutionProvider', id, token);
      await refreshSettings();
      toast.success(`Code execution provider set to ${id}`);
      onSaved?.();
    } catch {
      toast.error('Failed to update execution provider');
      onChange({ ...settings, codeExecutionProvider: current });
    } finally {
      setSaving(null);
    }
  };

  return (
    <SettingsCard
      title="Code execution provider"
      description="Primary upstream for the problems judge, contest DSA, QOTD, and the playground. The chosen provider is tried first everywhere; the other engages automatically on an infra outage."
      icon={Cpu}
      lastSavedAt={lastSavedAt}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {PROVIDERS.map((p) => {
          const active = current === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              disabled={saving !== null && saving !== p.id}
              aria-pressed={active}
              className={cn(
                'p-3.5 flex flex-col items-start gap-1.5 text-left rounded-[8px]',
                'border bg-[var(--bg-raised)] transition-colors',
                'hover:border-[var(--border-strong)]',
                active
                  ? 'border-2 border-[var(--accent)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-raised)]'
                  : 'border-[var(--border-default)]',
                saving !== null && saving !== p.id && 'opacity-60 cursor-not-allowed',
              )}
            >
              <span className="flex items-center gap-2 w-full">
                <span className="text-[14px] font-semibold text-[var(--ds-text-1)]">{p.label}</span>
                {active && <Check className="h-3.5 w-3.5 ml-auto text-[var(--accent)]" />}
              </span>
              <span className="text-[11.5px] leading-snug text-[var(--ds-text-3)]">{p.blurb}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] text-[var(--ds-text-3)]">
        Note: godbolt has no JavaScript/Node runtime, so JS always runs on Wandbox. The worker change must be deployed to Cloudflare for godbolt to take effect.
      </p>
    </SettingsCard>
  );
}
