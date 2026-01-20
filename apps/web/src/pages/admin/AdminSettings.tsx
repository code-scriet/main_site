import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, AlertCircle, CheckCircle, Globe, Mail, Shield, Loader2, RefreshCw, Share2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';

export default function AdminSettings() {
  const { token } = useAuth();
  const { refreshSettings: refreshGlobalSettings } = useSettings();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [settings, setSettings] = useState<Settings>({
    id: 'default',
    clubName: 'code.scriet',
    clubEmail: 'contact@codescriet.com',
    clubDescription: 'Building tomorrow\'s problem solvers through collaborative learning and hands-on coding experiences.',
    registrationOpen: true,
    maxEventsPerUser: 5,
    announcementsEnabled: true,
    showLeaderboard: false,
    showQOTD: true,
    showAchievements: true,
    hiringEnabled: true,
    githubUrl: '',
    linkedinUrl: '',
    twitterUrl: '',
    instagramUrl: '',
    discordUrl: '',
    updatedAt: new Date().toISOString(),
  });

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (err) {
      setError('Failed to load settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!token) {
      setError('Authentication required. Please log in again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { id, updatedAt, ...updateData } = settings;
      const updated = await api.updateSettings(updateData, token);
      setSettings(updated);
      // Refresh global settings so all components get the update
      await refreshGlobalSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Settings</h1>
          <p className="text-gray-600">Configure club settings and preferences</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSettings} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </motion.div>
      )}

      {saved && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700"
        >
          <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">Settings saved successfully!</p>
        </motion.div>
      )}

      {/* General Settings */}
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
            <label className="text-sm font-medium text-gray-700">Club Name</label>
            <Input
              value={settings.clubName}
              onChange={(e) => setSettings({ ...settings, clubName: e.target.value })}
              placeholder="Enter club name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Contact Email</label>
            <Input
              type="email"
              value={settings.clubEmail}
              onChange={(e) => setSettings({ ...settings, clubEmail: e.target.value })}
              placeholder="contact@example.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={settings.clubDescription}
              onChange={(e) => setSettings({ ...settings, clubDescription: e.target.value })}
              className="w-full min-h-[100px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="Describe your club..."
            />
            <p className="text-xs text-gray-500">This description appears on the homepage and about page</p>
          </div>
        </CardContent>
      </Card>

      {/* Registration Settings */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600" />
            Registration & Events
          </CardTitle>
          <CardDescription>Control event registration settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Event Registration</p>
              <p className="text-sm text-gray-500">Allow users to register for events</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.registrationOpen}
                onChange={(e) => setSettings({ ...settings, registrationOpen: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Max Events Per User</label>
            <Input
              type="number"
              min="1"
              max="50"
              value={settings.maxEventsPerUser}
              onChange={(e) => setSettings({ ...settings, maxEventsPerUser: parseInt(e.target.value) || 5 })}
            />
            <p className="text-xs text-gray-500">Maximum number of concurrent event registrations per user (1-50)</p>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-amber-600" />
            Notifications
          </CardTitle>
          <CardDescription>Configure announcement settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Announcements</p>
              <p className="text-sm text-gray-500">Enable announcement notifications</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.announcementsEnabled}
                onChange={(e) => setSettings({ ...settings, announcementsEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600" />
            Feature Toggles
          </CardTitle>
          <CardDescription>Show or hide features on user dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Leaderboard</p>
              <p className="text-sm text-gray-500">Show leaderboard on user dashboard</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showLeaderboard ?? false}
                onChange={(e) => setSettings({ ...settings, showLeaderboard: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Question of the Day (QOTD)</p>
              <p className="text-sm text-gray-500">Show QOTD widget on dashboard</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showQOTD ?? true}
                onChange={(e) => setSettings({ ...settings, showQOTD: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Achievements Section</p>
              <p className="text-sm text-gray-500">Show achievements on dashboard overview</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showAchievements ?? true}
                onChange={(e) => setSettings({ ...settings, showAchievements: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Hiring/Recruitment</p>
              <p className="text-sm text-gray-500">Allow users to apply for team positions</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.hiringEnabled ?? true}
                onChange={(e) => setSettings({ ...settings, hiringEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
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
              <label className="text-sm font-medium text-gray-700">GitHub URL</label>
              <Input
                value={settings.githubUrl || ''}
                onChange={(e) => setSettings({ ...settings, githubUrl: e.target.value })}
                placeholder="https://github.com/your-org"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">LinkedIn URL</label>
              <Input
                value={settings.linkedinUrl || ''}
                onChange={(e) => setSettings({ ...settings, linkedinUrl: e.target.value })}
                placeholder="https://linkedin.com/company/your-org"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Twitter URL</label>
              <Input
                value={settings.twitterUrl || ''}
                onChange={(e) => setSettings({ ...settings, twitterUrl: e.target.value })}
                placeholder="https://twitter.com/your-org"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Instagram URL</label>
              <Input
                value={settings.instagramUrl || ''}
                onChange={(e) => setSettings({ ...settings, instagramUrl: e.target.value })}
                placeholder="https://instagram.com/your-org"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Discord Invite URL</label>
            <Input
              value={settings.discordUrl || ''}
              onChange={(e) => setSettings({ ...settings, discordUrl: e.target.value })}
              placeholder="https://discord.gg/invite-code"
            />
            <p className="text-xs text-gray-500">Leave empty to hide Discord from the footer</p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={fetchSettings} disabled={saving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={saving} className="min-w-[140px] bg-amber-600 hover:bg-amber-700">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>

      {/* Last Updated */}
      {settings.updatedAt && (
        <p className="text-xs text-gray-400 text-right">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
