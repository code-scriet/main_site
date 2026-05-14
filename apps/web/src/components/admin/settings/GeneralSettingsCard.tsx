import { Globe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Settings } from '@/lib/api';

interface GeneralSettingsCardProps {
  settings: Settings;
  onChange: (next: Settings) => void;
}

export function GeneralSettingsCard({ settings, onChange }: GeneralSettingsCardProps) {
  return (
    <Card className="border-amber-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-amber-600" />
          General Settings
        </CardTitle>
        <CardDescription>Basic club information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="club-name">Club Name</Label>
          <Input
            id="club-name"
            value={settings.clubName}
            onChange={(e) => onChange({ ...settings, clubName: e.target.value })}
            placeholder="Enter club name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-email">Contact Email</Label>
          <Input
            id="club-email"
            type="email"
            value={settings.clubEmail}
            onChange={(e) => onChange({ ...settings, clubEmail: e.target.value })}
            placeholder="contact@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-description">Description</Label>
          <textarea
            id="club-description"
            value={settings.clubDescription}
            onChange={(e) => onChange({ ...settings, clubDescription: e.target.value })}
            className="w-full min-h-[100px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            placeholder="Describe your club..."
          />
          <p className="text-xs text-gray-500">This description appears on the homepage and about page</p>
        </div>
      </CardContent>
    </Card>
  );
}
