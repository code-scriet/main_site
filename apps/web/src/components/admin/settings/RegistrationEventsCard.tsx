import { Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Settings } from '@/lib/api';
import { ToggleRow } from './ToggleRow';

interface RegistrationEventsCardProps {
  settings: Settings;
  onChange: (next: Settings) => void;
}

export function RegistrationEventsCard({ settings, onChange }: RegistrationEventsCardProps) {
  return (
    <Card className="border-amber-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-600" />
          Registration &amp; Events
        </CardTitle>
        <CardDescription>Control event registration settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleRow
          id="registration-open"
          label="Event Registration"
          description="Allow users to register for events"
          checked={settings.registrationOpen}
          onCheckedChange={(checked) => onChange({ ...settings, registrationOpen: checked })}
        />
        <div className="space-y-2">
          <Label htmlFor="max-events-per-user">Max Events Per User</Label>
          <Input
            id="max-events-per-user"
            type="number"
            min="1"
            max="50"
            value={settings.maxEventsPerUser}
            onChange={(e) => onChange({ ...settings, maxEventsPerUser: parseInt(e.target.value) || 5 })}
          />
          <p className="text-xs text-gray-500">Maximum number of concurrent event registrations per user (1-50)</p>
        </div>
      </CardContent>
    </Card>
  );
}
