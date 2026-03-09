import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, AlertCircle, CheckCircle, Globe, Mail, Shield, Loader2, RefreshCw, Share2, FileText, Eye, Code, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { Markdown } from '@/components/ui/markdown';

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
    hiringTechnical: true,
    hiringDsaChamps: true,
    hiringDesigning: true,
    hiringSocialMedia: true,
    hiringManagement: true,
    showNetwork: true,
    mailingEnabled: true,
    githubUrl: '',
    linkedinUrl: '',
    twitterUrl: '',
    instagramUrl: '',
    discordUrl: '',
    emailWelcomeBody: '',
    emailAnnouncementBody: '',
    emailEventBody: '',
    emailFooterText: '',
    updatedAt: new Date().toISOString(),
  });
  
  const [activeEmailTab, setActiveEmailTab] = useState<'welcome' | 'announcement' | 'event'>('welcome');
  const [showPreview, setShowPreview] = useState(false);
  const [indexNowSubmitting, setIndexNowSubmitting] = useState(false);
  const [indexNowResult, setIndexNowResult] = useState<{ count: number; error?: string } | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSettings();
      
      // Fetch email templates from the config file endpoint
      if (token) {
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/settings/email-templates`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (response.ok) {
            const emailData = await response.json();
            if (emailData.success && emailData.data) {
              setSettings({
                ...data,
                emailWelcomeBody: emailData.data.emailWelcomeBody || '',
                emailAnnouncementBody: emailData.data.emailAnnouncementBody || '',
                emailEventBody: emailData.data.emailEventBody || '',
                emailFooterText: emailData.data.emailFooterText || '',
              });
              return;
            }
          }
        } catch (err) {
          console.error('Failed to fetch email templates:', err);
        }
      }
      
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
      const { id, updatedAt, emailWelcomeBody, emailAnnouncementBody, emailEventBody, emailFooterText, ...updateData } = settings;
      
      // Update regular settings
      const updated = await api.updateSettings(updateData, token);
      
      // Update email templates to config file
      const emailResponse = await fetch(`${import.meta.env.VITE_API_URL}/settings/email-templates`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          emailWelcomeBody,
          emailAnnouncementBody,
          emailEventBody,
          emailFooterText,
        }),
      });
      
      if (!emailResponse.ok) {
        throw new Error('Failed to update email templates');
      }
      
      setSettings({ ...updated, emailWelcomeBody, emailAnnouncementBody, emailEventBody, emailFooterText });
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
          {/* Per-team hiring toggles */}
          {settings.hiringEnabled && (
            <div className="ml-4 mt-2 space-y-2 border-l-2 border-amber-200 pl-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Team-specific Hiring</p>
              {[
                { key: 'hiringTechnical' as const, label: 'Technical Team', desc: 'Enable hiring for Technical division' },
                { key: 'hiringDsaChamps' as const, label: 'DSA Champs', desc: 'Enable hiring for DSA Champs division' },
                { key: 'hiringDesigning' as const, label: 'Design Team', desc: 'Enable hiring for Design division' },
                { key: 'hiringSocialMedia' as const, label: 'Social Media', desc: 'Enable hiring for Social Media division' },
                { key: 'hiringManagement' as const, label: 'Management', desc: 'Enable hiring for Management division' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-100">
                  <div>
                    <p className="text-sm font-medium text-amber-900">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings[key] ?? true}
                      onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Network</p>
              <p className="text-sm text-gray-500">Show industry network page and allow professionals to join</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showNetwork ?? true}
                onChange={(e) => setSettings({ ...settings, showNetwork: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Mailing System</p>
              <p className="text-sm text-gray-500">Enable the admin email composer to send emails to users</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.mailingEnabled ?? true}
                onChange={(e) => setSettings({ ...settings, mailingEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Certificate Generation</p>
              <p className="text-sm text-gray-500">Allow admins to generate and issue certificates to participants</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.certificatesEnabled ?? true}
                onChange={(e) => setSettings({ ...settings, certificatesEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
            <div>
              <p className="font-medium text-amber-900">Code Playground</p>
              <p className="text-sm text-gray-500">Show the Code Playground link and dashboard widgets for members</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.playgroundEnabled ?? true}
                onChange={(e) => setSettings({ ...settings, playgroundEnabled: e.target.checked })}
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

      {/* Email Template Settings */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" />
            Email Templates
          </CardTitle>
          <CardDescription>
            Customize the content of automated emails. Use Markdown for formatting.
            Leave empty to use default templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Footer Text */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email Footer Text</label>
            <Input
              value={settings.emailFooterText || ''}
              onChange={(e) => setSettings({ ...settings, emailFooterText: e.target.value })}
              placeholder="Building the next generation of developers."
            />
            <p className="text-xs text-gray-500">Appears at the bottom of all emails</p>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveEmailTab('welcome')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeEmailTab === 'welcome'
                  ? 'border-b-2 border-amber-500 text-amber-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Welcome Email
            </button>
            <button
              onClick={() => setActiveEmailTab('announcement')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeEmailTab === 'announcement'
                  ? 'border-b-2 border-amber-500 text-amber-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Announcement
            </button>
            <button
              onClick={() => setActiveEmailTab('event')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeEmailTab === 'event'
                  ? 'border-b-2 border-amber-500 text-amber-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              New Event
            </button>
          </div>
          
          {/* Preview Toggle */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="gap-2"
            >
              {showPreview ? <Code className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPreview ? 'Edit' : 'Preview'}
            </Button>
          </div>
          
          {/* Welcome Email Template */}
          {activeEmailTab === 'welcome' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Custom Welcome Message (Optional)</label>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  💡 <strong>Note:</strong> This text will be added to the beginning of the premium welcome email (before the power-ups section). 
                  Leave empty to use only the default premium template shown in your screenshot.
                </p>
                <span className="text-xs text-gray-400">Variables: {'{{name}}'} {'{{clubName}}'}</span>
              </div>
              {showPreview ? (
                <div className="min-h-[200px] p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <Markdown>{settings.emailWelcomeBody || `*No custom message set. Using default premium template with:*

- Welcome message
- 4 Power-up cards (QOTD, Events, Leaderboard, Community)  
- Next Steps section with numbered actions
- Pro tip box`}</Markdown>
                </div>
              ) : (
                <textarea
                  value={settings.emailWelcomeBody || ''}
                  onChange={(e) => setSettings({ ...settings, emailWelcomeBody: e.target.value })}
                  className="w-full min-h-[200px] px-3 py-2 border border-gray-300 rounded-md bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder={`Add a personalized intro message here (optional)...

Example:
Hey **{{name}}**, we're excited to have you! 🎉

Your journey with {{clubName}} starts now...

(The premium template with power-ups and next steps will appear after this)`}
                />
              )}
              <p className="text-xs text-gray-500">
                Custom text is added <strong>before</strong> the premium design. Leave empty to use default only.
              </p>
            </div>
          )}
          
          {/* Announcement Email Template */}
          {activeEmailTab === 'announcement' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Custom Announcement Intro (Optional)</label>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  💡 <strong>Note:</strong> This intro appears before the actual announcement content in emails.
                </p>
              </div>
              {showPreview ? (
                <div className="min-h-[150px] p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <Markdown>{settings.emailAnnouncementBody || `Hey there! 👋

Here's the latest update from **code.scriet**:`}</Markdown>
                </div>
              ) : (
                <textarea
                  value={settings.emailAnnouncementBody || ''}
                  onChange={(e) => setSettings({ ...settings, emailAnnouncementBody: e.target.value })}
                  className="w-full min-h-[150px] px-3 py-2 border border-gray-300 rounded-md bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder={`Hey there! 👋

Here's the latest update from **code.scriet**:`}
                />
              )}
              <p className="text-xs text-gray-500">
                This intro text appears before the announcement content in emails.
              </p>
            </div>
          )}
          
          {/* Event Email Template */}
          {activeEmailTab === 'event' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Custom Event Intro (Optional)</label>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  💡 <strong>Note:</strong> This intro appears before event details in notification emails.
                </p>
              </div>
              {showPreview ? (
                <div className="min-h-[150px] p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <Markdown>{settings.emailEventBody || `🎯 **New Event Alert!**

We've got something exciting lined up for you:`}</Markdown>
                </div>
              ) : (
                <textarea
                  value={settings.emailEventBody || ''}
                  onChange={(e) => setSettings({ ...settings, emailEventBody: e.target.value })}
                  className="w-full min-h-[150px] px-3 py-2 border border-gray-300 rounded-md bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder={`🎯 **New Event Alert!**

We've got something exciting lined up for you:`}
                />
              )}
              <p className="text-xs text-gray-500">
                This intro text appears before event details in notification emails.
              </p>
            </div>
          )}
          
          {/* Help Text */}
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
            <h4 className="text-sm font-medium text-amber-900 mb-2">Markdown Tips</h4>
            <ul className="text-xs text-amber-700 space-y-1">
              <li><code className="bg-amber-100 px-1 rounded">**bold**</code> → <strong>bold</strong></li>
              <li><code className="bg-amber-100 px-1 rounded">*italic*</code> → <em>italic</em></li>
              <li><code className="bg-amber-100 px-1 rounded">## Heading</code> → Creates a heading</li>
              <li><code className="bg-amber-100 px-1 rounded">- item</code> → Creates a bullet list</li>
              <li><code className="bg-amber-100 px-1 rounded">[link](url)</code> → Creates a link</li>
              <li><code className="bg-amber-100 px-1 rounded">&gt; quote</code> → Creates a blockquote</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}

      {/* SEO — IndexNow */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-amber-600" />
            IndexNow — Search Engine Indexing
          </CardTitle>
          <CardDescription>
            Instantly notify Bing, Yandex and Google about all your pages so they get indexed faster.
            New content is submitted automatically when created or updated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Button
              variant="outline"
              className="gap-2"
              disabled={indexNowSubmitting}
              onClick={async () => {
                if (!token) return;
                setIndexNowSubmitting(true);
                setIndexNowResult(null);
                try {
                  const res = await fetch(`${import.meta.env.VITE_API_URL}/indexnow/submit-all`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const data = await res.json();
                  if (data.success) {
                    setIndexNowResult({ count: data.data.submitted });
                  } else {
                    setIndexNowResult({ count: 0, error: data.error?.message || 'Submission failed' });
                  }
                } catch {
                  setIndexNowResult({ count: 0, error: 'Network error' });
                } finally {
                  setIndexNowSubmitting(false);
                }
              }}
            >
              {indexNowSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
              Submit All URLs to IndexNow
            </Button>
            {indexNowResult && !indexNowResult.error && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                {indexNowResult.count} URLs submitted
              </span>
            )}
            {indexNowResult?.error && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {indexNowResult.error}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Individual pages are submitted automatically when events, achievements, announcements, team members, or network profiles are created/updated.
          </p>
        </CardContent>
      </Card>

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
          Last updated: {new Date(settings.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        </p>
      )}
    </div>
  );
}
