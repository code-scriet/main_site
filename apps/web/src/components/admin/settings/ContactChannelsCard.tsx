import { AtSign, Phone, Plus, Trash2 } from 'lucide-react';
import { Field } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ContactEmail, Settings } from '@/lib/api';
import { SettingsCard } from './SettingsCard';

interface ContactChannelsCardProps {
  settings: Settings;
  onChange: (next: Settings) => void;
  lastSavedAt?: number | null;
}

const MAX_EMAILS = 20;

// Repeatable { label, email } editor for the public /contact page. The primary
// "Contact email" lives on the Club profile card; these are extra inboxes
// (e.g. Hiring, Sponsorship, Tech support) rendered alongside it. Saved with
// the rest of the form via the page's "Save Settings" button.
export function ContactChannelsCard({ settings, onChange, lastSavedAt }: ContactChannelsCardProps) {
  const emails: ContactEmail[] = settings.contactEmails ?? [];

  const updateEmail = (index: number, patch: Partial<ContactEmail>) => {
    const next = emails.map((e, i) => (i === index ? { ...e, ...patch } : e));
    onChange({ ...settings, contactEmails: next });
  };

  const addEmail = () => {
    if (emails.length >= MAX_EMAILS) return;
    onChange({ ...settings, contactEmails: [...emails, { label: '', email: '' }] });
  };

  const removeEmail = (index: number) => {
    onChange({ ...settings, contactEmails: emails.filter((_, i) => i !== index) });
  };

  return (
    <SettingsCard
      title="Contact channels"
      description="Phone number and extra labelled email addresses shown on the public Contact page."
      icon={AtSign}
      lastSavedAt={lastSavedAt}
      wide
    >
      <Field label="Phone number" hint="Shown as a call + WhatsApp link. Leave blank to hide.">
        <div className="relative">
          <Phone className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ds-text-3)]" />
          <Input
            value={settings.contactPhone || ''}
            onChange={(e) => onChange({ ...settings, contactPhone: e.target.value })}
            placeholder="+91 98765 43210"
            className="pl-8"
          />
        </div>
      </Field>

      <div className="h-px bg-[var(--border-subtle)]" />

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-medium text-[var(--ds-text-2)]">Additional emails</p>
          <p className="text-[11px] text-[var(--ds-text-3)]">
            Give each address a label so visitors know who they're reaching.
          </p>
        </div>
        <span className="text-[11px] tabular-nums text-[var(--ds-text-3)]">
          {emails.length}/{MAX_EMAILS}
        </span>
      </div>

      {emails.length === 0 && (
        <p className="text-[12px] text-[var(--ds-text-3)] rounded-[8px] border border-dashed border-[var(--border-default)] px-3 py-4 text-center">
          No extra emails yet. Only the primary club email will show.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {emails.map((entry, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-2 items-start">
            <Input
              value={entry.label}
              onChange={(e) => updateEmail(index, { label: e.target.value })}
              placeholder="Label (e.g. Hiring)"
              aria-label={`Email label ${index + 1}`}
            />
            <Input
              type="email"
              value={entry.email}
              onChange={(e) => updateEmail(index, { email: e.target.value })}
              placeholder="hiring@example.com"
              aria-label={`Email address ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeEmail(index)}
              aria-label={`Remove email ${index + 1}`}
              className="text-[var(--ds-text-3)] hover:text-[var(--danger)] shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={addEmail}
          disabled={emails.length >= MAX_EMAILS}
        >
          <Plus className="h-3.5 w-3.5" />
          Add email
        </Button>
      </div>
    </SettingsCard>
  );
}
