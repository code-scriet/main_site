import { Share2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Settings } from '@/lib/api';

interface SocialLinksCardProps {
  settings: Settings;
  onChange: (next: Settings) => void;
}

export function SocialLinksCard({ settings, onChange }: SocialLinksCardProps) {
  return (
    <Card className="border-amber-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-amber-600" />
          Social Links
        </CardTitle>
        <CardDescription>Configure "Connect With Us" links shown in the footer</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="github-url">GitHub URL</Label>
            <Input
              id="github-url"
              value={settings.githubUrl || ''}
              onChange={(e) => onChange({ ...settings, githubUrl: e.target.value })}
              placeholder="https://github.com/your-org"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkedin-url">LinkedIn URL</Label>
            <Input
              id="linkedin-url"
              value={settings.linkedinUrl || ''}
              onChange={(e) => onChange({ ...settings, linkedinUrl: e.target.value })}
              placeholder="https://linkedin.com/company/your-org"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="twitter-url">Twitter URL</Label>
            <Input
              id="twitter-url"
              value={settings.twitterUrl || ''}
              onChange={(e) => onChange({ ...settings, twitterUrl: e.target.value })}
              placeholder="https://twitter.com/your-org"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instagram-url">Instagram URL</Label>
            <Input
              id="instagram-url"
              value={settings.instagramUrl || ''}
              onChange={(e) => onChange({ ...settings, instagramUrl: e.target.value })}
              placeholder="https://instagram.com/your-org"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="discord-url">Discord Invite URL</Label>
          <Input
            id="discord-url"
            value={settings.discordUrl || ''}
            onChange={(e) => onChange({ ...settings, discordUrl: e.target.value })}
            placeholder="https://discord.gg/invite-code"
          />
          <p className="text-xs text-gray-500">Leave empty to hide Discord from the footer</p>
        </div>
      </CardContent>
    </Card>
  );
}
