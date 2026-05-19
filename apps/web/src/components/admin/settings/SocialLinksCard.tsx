import { Globe } from 'lucide-react';
import { Field } from '@/components/dash';
import { Input } from '@/components/ui/input';
import type { Settings } from '@/lib/api';
import { SettingsCard } from './SettingsCard';

interface SocialLinksCardProps {
  settings: Settings;
  onChange: (next: Settings) => void;
  lastSavedAt?: number | null;
}

const SOCIAL_FIELDS: Array<{
  key: keyof Pick<Settings, 'githubUrl' | 'linkedinUrl' | 'twitterUrl' | 'instagramUrl' | 'discordUrl' | 'whatsappUrl'>;
  label: string;
  placeholder: string;
  hint?: string;
}> = [
  { key: 'githubUrl',    label: 'GitHub',    placeholder: 'https://github.com/your-org' },
  { key: 'linkedinUrl',  label: 'LinkedIn',  placeholder: 'https://linkedin.com/company/your-org' },
  { key: 'twitterUrl',   label: 'Twitter',   placeholder: 'https://twitter.com/your-org' },
  { key: 'instagramUrl', label: 'Instagram', placeholder: 'https://instagram.com/your-org' },
  { key: 'discordUrl',   label: 'Discord',   placeholder: 'https://discord.gg/invite-code', hint: 'Leave blank to hide from footer' },
  { key: 'whatsappUrl',  label: 'WhatsApp community', placeholder: 'https://chat.whatsapp.com/invite-code', hint: 'Leave blank to hide from footer' },
];

export function SocialLinksCard({ settings, onChange, lastSavedAt }: SocialLinksCardProps) {
  return (
    <SettingsCard
      title="Social links"
      description='Configure "Connect with us" links shown in the public footer.'
      icon={Globe}
      lastSavedAt={lastSavedAt}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIAL_FIELDS.map((f) => (
          <Field key={f.key as string} label={f.label} hint={f.hint}>
            <Input
              value={(settings[f.key] as string | undefined) || ''}
              onChange={(e) => onChange({ ...settings, [f.key]: e.target.value })}
              placeholder={f.placeholder}
            />
          </Field>
        ))}
      </div>
    </SettingsCard>
  );
}
