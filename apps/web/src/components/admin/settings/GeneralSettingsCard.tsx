import { Globe } from 'lucide-react';
import { Field } from '@/components/dash';
import { Input } from '@/components/ui/input';
import type { Settings } from '@/lib/api';
import { SettingsCard } from './SettingsCard';

interface GeneralSettingsCardProps {
  settings: Settings;
  onChange: (next: Settings) => void;
  lastSavedAt?: number | null;
}

export function GeneralSettingsCard({ settings, onChange, lastSavedAt }: GeneralSettingsCardProps) {
  return (
    <SettingsCard
      title="Club profile"
      description="Basic club information shown on the public site and emails."
      icon={Globe}
      lastSavedAt={lastSavedAt}
    >
      <Field label="Club name" required>
        <Input
          value={settings.clubName}
          onChange={(e) => onChange({ ...settings, clubName: e.target.value })}
          placeholder="Enter club name"
        />
      </Field>
      <Field label="Contact email" required>
        <Input
          type="email"
          value={settings.clubEmail}
          onChange={(e) => onChange({ ...settings, clubEmail: e.target.value })}
          placeholder="contact@example.com"
        />
      </Field>
      <Field label="Description" hint="Shown on the homepage and about page">
        <textarea
          value={settings.clubDescription}
          onChange={(e) => onChange({ ...settings, clubDescription: e.target.value })}
          rows={4}
          className="w-full min-h-[100px] px-3 py-2 text-[13px] rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-default)] text-[var(--ds-text-1)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] resize-y"
          placeholder="Describe your club…"
        />
      </Field>
    </SettingsCard>
  );
}
