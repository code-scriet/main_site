import { Calendar } from 'lucide-react';
import { Field } from '@/components/dash';
import { Input } from '@/components/ui/input';
import type { Settings } from '@/lib/api';
import { SettingsCard } from './SettingsCard';
import { ToggleRow } from './ToggleRow';

interface RegistrationEventsCardProps {
  settings: Settings;
  onChange: (next: Settings) => void;
  lastSavedAt?: number | null;
}

export function RegistrationEventsCard({ settings, onChange, lastSavedAt }: RegistrationEventsCardProps) {
  return (
    <SettingsCard
      title="Registration & events"
      description="Control event registration limits and behavior club-wide."
      icon={Calendar}
      lastSavedAt={lastSavedAt}
    >
      <ToggleRow
        id="registration-open"
        label="Event registration"
        description="Allow users to register for events."
        checked={settings.registrationOpen}
        onCheckedChange={(checked) => onChange({ ...settings, registrationOpen: checked })}
      />
      <Field label="Max events per user" hint="Concurrent registrations cap (1–50)">
        <Input
          type="number"
          min="1"
          max="50"
          value={settings.maxEventsPerUser}
          onChange={(e) => onChange({ ...settings, maxEventsPerUser: parseInt(e.target.value, 10) || 5 })}
        />
      </Field>
    </SettingsCard>
  );
}
