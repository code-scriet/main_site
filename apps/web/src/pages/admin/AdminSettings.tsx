import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, AlertCircle, CheckCircle, Globe, Mail, Shield, Loader2, RefreshCw, Share2, FileText, Eye, Code, Search, Clock, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import type { Settings, SecurityEnvStatus } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { Markdown } from '@/components/ui/markdown';
import { formatDateTime } from '@/lib/dateUtils';
import { ToggleRow as SharedToggleRow } from '@/components/admin/settings/ToggleRow';
import { GeneralSettingsCard } from '@/components/admin/settings/GeneralSettingsCard';
import { RegistrationEventsCard } from '@/components/admin/settings/RegistrationEventsCard';

const ToggleRow = SharedToggleRow;

export default function AdminSettings() {
  const { user, token } = useAuth();
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
    show_tech_blogs: true,
    hiringEnabled: true,
    hiringTechnical: true,
    hiringDsaChamps: true,
    hiringDesigning: true,
    hiringSocialMedia: true,
    hiringManagement: true,
    competitionEnabled: false,
    problemsEnabled: false,
    showNetwork: true,
    certificatesEnabled: true,
    playgroundEnabled: true,
    mailingEnabled: true,
    emailWelcomeEnabled: true,
    emailEventCreationEnabled: true,
    emailRegistrationEnabled: true,
    emailAnnouncementEnabled: true,
    emailCertificateEnabled: true,
    emailReminderEnabled: true,
    emailInvitationEnabled: true,
    emailTestingMode: false,
    emailTestRecipients: null,
    playgroundDailyLimit: 100,
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
  const [eventSyncSubmitting, setEventSyncSubmitting] = useState(false);
  const [eventSyncResult, setEventSyncResult] = useState<
    { toOngoing: number; toPastFromOngoing: number; toPastFromUpcoming: number; error?: string } | null
  >(null);
  const [securityEnvValues, setSecurityEnvValues] = useState({ attendanceJwtSecret: '', indexNowKey: '' });
  const [securityEnvStatus, setSecurityEnvStatus] = useState<SecurityEnvStatus | null>(null);
  const [securityEnvSaving, setSecurityEnvSaving] = useState(false);
  const [securityEnvChecking, setSecurityEnvChecking] = useState(false);
  const savedTimerRef = useRef<number | null>(null);
  const canManageSecurityEnv = Boolean(user?.isSuperAdmin || user?.role === 'PRESIDENT');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (token) {
        // Use admin endpoint to load ALL settings including admin-only fields
        // (emailTestingMode, emailTestRecipients, email notification toggles, email body templates)
        const response = await fetch(`${import.meta.env.VITE_API_URL}/settings`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const json = await response.json();
          if (json.success && json.data) {
            setSettings({
              ...json.data,
              // DB stores these as nullable; ensure empty string in UI
              emailWelcomeBody: json.data.emailWelcomeBody ?? '',
              emailAnnouncementBody: json.data.emailAnnouncementBody ?? '',
              emailEventBody: json.data.emailEventBody ?? '',
              emailFooterText: json.data.emailFooterText ?? '',
            });
            return;
          }
        }
      }
      // Fallback: public endpoint (admin-only fields will show initial defaults)
      const data = await api.getSettings();
      setSettings(data);
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  useEffect(() => () => {
    if (savedTimerRef.current) {
      window.clearTimeout(savedTimerRef.current);
    }
  }, []);

  const fetchSecurityEnvStatus = useCallback(async () => {
    if (!token || !canManageSecurityEnv) return;

    setSecurityEnvChecking(true);
    try {
      const status = await api.getSecurityEnvStatus(token);
      setSecurityEnvStatus(status);
    } catch {
      setError('Failed to refresh security key status');
    } finally {
      setSecurityEnvChecking(false);
    }
  }, [token, canManageSecurityEnv]);

  useEffect(() => {
    if (canManageSecurityEnv) {
      void fetchSecurityEnvStatus();
    }
  }, [canManageSecurityEnv, fetchSecurityEnvStatus]);

  // Auto-save a single boolean toggle immediately via PATCH
  const handleToggle = async (key: keyof Settings, value: boolean) => {
    // Optimistic local update
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (!token) return;
    try {
      await api.patchSetting(key as string, value, token);
      await refreshGlobalSettings();
    } catch {
      // Revert on failure
      setSettings((prev) => ({ ...prev, [key]: !value }));
      setError(`Failed to save ${key}`);
    }
  };

  const handleSave = async () => {
    if (!token) {
      setError('Authentication required. Please log in again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const {
        id: _id,
        updatedAt: _updatedAt,
        emailWelcomeBody,
        emailAnnouncementBody,
        emailEventBody,
        emailFooterText,
        ...updateData
      } = settings;
      
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
          emailWelcomeBody: emailWelcomeBody ?? '',
          emailAnnouncementBody: emailAnnouncementBody ?? '',
          emailEventBody: emailEventBody ?? '',
          emailFooterText: emailFooterText ?? '',
        }),
      });
      
      if (!emailResponse.ok) {
        throw new Error('Failed to update email templates');
      }
      
      setSettings({ ...updated, emailWelcomeBody: emailWelcomeBody ?? '', emailAnnouncementBody: emailAnnouncementBody ?? '', emailEventBody: emailEventBody ?? '', emailFooterText: emailFooterText ?? '' });
      // Refresh global settings so all components get the update
      await refreshGlobalSettings();
      setSaved(true);
      if (savedTimerRef.current) {
        window.clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] sm:min-h-[400px]">{/* responsive: reduced on mobile */}
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
      <GeneralSettingsCard settings={settings} onChange={setSettings} />

      <RegistrationEventsCard settings={settings} onChange={setSettings} />

      {/* Email & Notifications */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-amber-600" />
            Email & Notifications
          </CardTitle>
          <CardDescription>Control which emails are sent and enable testing mode to prevent accidental mass emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Testing Mode Banner */}
          {settings.emailTestingMode && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Testing Mode Active</p>
                <p className="text-xs text-amber-700 mt-1">
                  All emails are being redirected to test addresses below. No real users will receive emails.
                  {!settings.emailTestRecipients?.trim() && (
                    <span className="block mt-1 text-red-600 font-medium">No test recipients configured — all emails are being suppressed!</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Testing Mode Toggle */}
          <ToggleRow
            id="email-testing-mode"
            label="Testing Mode"
            description="Redirect all emails to test addresses instead of real users"
            checked={settings.emailTestingMode ?? false}
            onCheckedChange={(checked) => void handleToggle('emailTestingMode', checked)}
          />

          {/* Test Recipients Input */}
          {settings.emailTestingMode && (
            <div className="ml-4 border-l-2 border-amber-200 pl-4 space-y-2">
              <Label htmlFor="email-test-recipients">Test Recipients</Label>
              <Input
                id="email-test-recipients"
                value={settings.emailTestRecipients || ''}
                onChange={(e) => setSettings({ ...settings, emailTestRecipients: e.target.value })}
                onBlur={async () => {
                  if (!token) return;
                  try {
                    await api.patchSetting('emailTestRecipients', settings.emailTestRecipients || '', token);
                  } catch {
                    setError('Failed to save test recipients');
                  }
                }}
                placeholder="admin@example.com, dev@example.com"
              />
              <p className="text-xs text-gray-500">Comma-separated email addresses. All outgoing emails will be redirected here.</p>
            </div>
          )}

          {/* Announcements Feature Toggle */}
          <ToggleRow
            id="announcements-enabled"
            label="Announcements"
            description="Enable announcement notifications"
            checked={settings.announcementsEnabled}
            onCheckedChange={(checked) => setSettings({ ...settings, announcementsEnabled: checked })}
          />

          {/* Email Category Toggles */}
          <div className="space-y-1 pt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Email Category Toggles</p>
            {[
              { key: 'emailWelcomeEnabled' as const, label: 'Welcome Emails', desc: 'Sent when a new user registers' },
              { key: 'emailEventCreationEnabled' as const, label: 'New Event Emails', desc: 'Sent to all users when a new event is created' },
              { key: 'emailRegistrationEnabled' as const, label: 'Registration Confirmation', desc: 'Sent when a user registers for an event' },
              { key: 'emailAnnouncementEnabled' as const, label: 'Announcement Emails', desc: 'Sent to all users for new announcements' },
              { key: 'emailCertificateEnabled' as const, label: 'Certificate Emails', desc: 'Sent when a certificate is issued to a user' },
              { key: 'emailReminderEnabled' as const, label: 'Event Reminders', desc: 'Automated reminders before events start' },
              { key: 'emailInvitationEnabled' as const, label: 'Event Invitations', desc: 'Sent to invited guests and speakers for event invitations' },
              { key: 'mailingEnabled' as const, label: 'Admin Bulk Mail', desc: 'Enable the admin email composer to send emails to users' },
            ].map(({ key, label, desc }) => (
              <ToggleRow
                key={key}
                id={key}
                label={label}
                description={desc}
                checked={settings[key] ?? true}
                onCheckedChange={(checked) => void handleToggle(key, checked)}
                compact
              />
            ))}
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
          <ToggleRow
            id="show-leaderboard"
            label="Leaderboard"
            description="Show leaderboard on user dashboard"
            checked={settings.showLeaderboard ?? false}
            onCheckedChange={(checked) => void handleToggle('showLeaderboard', checked)}
          />
          <ToggleRow
            id="show-qotd"
            label="Question of the Day (QOTD)"
            description="Show QOTD widget on dashboard"
            checked={settings.showQOTD ?? true}
            onCheckedChange={(checked) => void handleToggle('showQOTD', checked)}
          />
          <ToggleRow
            id="show-achievements"
            label="Achievements Section"
            description="Show achievements on dashboard overview"
            checked={settings.showAchievements ?? true}
            onCheckedChange={(checked) => void handleToggle('showAchievements', checked)}
          />
          <ToggleRow
            id="show-tech-blogs"
            label="Tech Blogs"
            description="Show the tech blogs section wherever this frontend feature is enabled"
            checked={settings.show_tech_blogs ?? true}
            onCheckedChange={(checked) => void handleToggle('show_tech_blogs', checked)}
          />
          <ToggleRow
            id="hiring-enabled"
            label="Hiring/Recruitment"
            description="Allow users to apply for team positions"
            checked={settings.hiringEnabled ?? true}
            onCheckedChange={(checked) => void handleToggle('hiringEnabled', checked)}
          />
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
                <ToggleRow
                  key={key}
                  id={key}
                  label={label}
                  description={desc}
                  checked={settings[key] ?? true}
                  onCheckedChange={(checked) => void handleToggle(key, checked)}
                  compact
                />
              ))}
            </div>
          )}
          <ToggleRow
            id="show-network"
            label="Network"
            description="Show industry network page and allow professionals to join"
            checked={settings.showNetwork ?? true}
            onCheckedChange={(checked) => void handleToggle('showNetwork', checked)}
          />
          <ToggleRow
            id="certificates-enabled"
            label="Certificate Generation"
            description="Allow admins to generate and issue certificates to participants"
            checked={settings.certificatesEnabled ?? true}
            onCheckedChange={(checked) => void handleToggle('certificatesEnabled', checked)}
          />
          <ToggleRow
            id="playground-enabled"
            label="Code Playground"
            description="Show the Code Playground link and dashboard widgets for members"
            checked={settings.playgroundEnabled ?? true}
            onCheckedChange={(checked) => void handleToggle('playgroundEnabled', checked)}
          />
          <ToggleRow
            id="competition-enabled"
            label="Competition System"
            description="Enable competition rounds for events (admin panel link and management)"
            checked={settings.competitionEnabled ?? false}
            onCheckedChange={(checked) => void handleToggle('competitionEnabled', checked)}
          />
          <ToggleRow
            id="problems-enabled"
            label="Problems System"
            description="Enable QOTD solving, practice problems, DSA contest rounds, and admin problem tools"
            checked={settings.problemsEnabled ?? false}
            onCheckedChange={(checked) => void handleToggle('problemsEnabled', checked)}
          />
          <div className="space-y-2 p-4 bg-amber-50 rounded-lg">
            <Label htmlFor="playground-daily-limit">Playground Daily Execution Limit</Label>
            <Input
              id="playground-daily-limit"
              type="number"
              min="1"
              max="10000"
              value={settings.playgroundDailyLimit ?? 100}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  playgroundDailyLimit: Math.min(10000, Math.max(1, parseInt(e.target.value, 10) || 100)),
                })
              }
            />
            <p className="text-xs text-gray-500">Shared across dashboard and playground runtime. Editable by super admin or president.</p>
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
              <Label htmlFor="github-url">GitHub URL</Label>
              <Input
                id="github-url"
                value={settings.githubUrl || ''}
                onChange={(e) => setSettings({ ...settings, githubUrl: e.target.value })}
                placeholder="https://github.com/your-org"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin-url">LinkedIn URL</Label>
              <Input
                id="linkedin-url"
                value={settings.linkedinUrl || ''}
                onChange={(e) => setSettings({ ...settings, linkedinUrl: e.target.value })}
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
                onChange={(e) => setSettings({ ...settings, twitterUrl: e.target.value })}
                placeholder="https://twitter.com/your-org"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram-url">Instagram URL</Label>
              <Input
                id="instagram-url"
                value={settings.instagramUrl || ''}
                onChange={(e) => setSettings({ ...settings, instagramUrl: e.target.value })}
                placeholder="https://instagram.com/your-org"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="discord-url">Discord Invite URL</Label>
            <Input
              id="discord-url"
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
            <Label htmlFor="email-footer-text">Email Footer Text</Label>
            <Input
              id="email-footer-text"
              value={settings.emailFooterText || ''}
              onChange={(e) => setSettings({ ...settings, emailFooterText: e.target.value })}
              placeholder="Building the next generation of developers."
            />
            <p className="text-xs text-gray-500">Appears at the bottom of all emails</p>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-gray-200" role="tablist" aria-label="Email templates">
            <button
              type="button"
              role="tab"
              aria-selected={activeEmailTab === 'welcome'}
              aria-controls="email-template-panel"
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
              type="button"
              role="tab"
              aria-selected={activeEmailTab === 'announcement'}
              aria-controls="email-template-panel"
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
              type="button"
              role="tab"
              aria-selected={activeEmailTab === 'event'}
              aria-controls="email-template-panel"
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
            <div id="email-template-panel" role="tabpanel" className="space-y-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email-welcome-body">Custom Welcome Message (Optional)</Label>
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
                  id="email-welcome-body"
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
            <div id="email-template-panel" role="tabpanel" className="space-y-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email-announcement-body">Custom Announcement Intro (Optional)</Label>
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
                  id="email-announcement-body"
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
            <div id="email-template-panel" role="tabpanel" className="space-y-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email-event-body">Custom Event Intro (Optional)</Label>
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
                  id="email-event-body"
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

      {/* Event Status Sync */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            Event Status Sync
          </CardTitle>
          <CardDescription>
            Background sync runs every 30 minutes. Use this button to run an instant sync for everyone right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Button
              variant="outline"
              className="gap-2"
              disabled={eventSyncSubmitting}
              onClick={async () => {
                if (!token) return;
                setEventSyncSubmitting(true);
                setEventSyncResult(null);
                try {
                  const res = await fetch(`${import.meta.env.VITE_API_URL}/settings/event-status/sync-now`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    credentials: 'include',
                  });
                  const data = await res.json();
                  if (data.success && data.data) {
                    setEventSyncResult(data.data);
                  } else {
                    setEventSyncResult({ toOngoing: 0, toPastFromOngoing: 0, toPastFromUpcoming: 0, error: data.error?.message || 'Sync failed' });
                  }
                } catch {
                  setEventSyncResult({ toOngoing: 0, toPastFromOngoing: 0, toPastFromUpcoming: 0, error: 'Network error' });
                } finally {
                  setEventSyncSubmitting(false);
                }
              }}
            >
              {eventSyncSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync Event Status Now
            </Button>

            {eventSyncResult && !eventSyncResult.error && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Updated: {eventSyncResult.toOngoing + eventSyncResult.toPastFromOngoing + eventSyncResult.toPastFromUpcoming}
              </span>
            )}

            {eventSyncResult?.error && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {eventSyncResult.error}
              </span>
            )}
          </div>

          {eventSyncResult && !eventSyncResult.error && (
            <p className="text-xs text-gray-600">
              UPCOMING -&gt; ONGOING: {eventSyncResult.toOngoing} | ONGOING -&gt; PAST: {eventSyncResult.toPastFromOngoing} | UPCOMING -&gt; PAST: {eventSyncResult.toPastFromUpcoming}
            </p>
          )}
        </CardContent>
      </Card>

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

      {/* Security Env Settings (super admin / president only) */}
      {canManageSecurityEnv && (
        <Card className="border-amber-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-600" />
              Security Keys (Settings)
            </CardTitle>
            <CardDescription>
              ATTENDANCE_JWT_SECRET and INDEXNOW_KEY are managed from privileged settings.
              Env variables are optional legacy fallbacks, not required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="attendance-jwt-secret">ATTENDANCE_JWT_SECRET Reference</Label>
                <Input
                  id="attendance-jwt-secret"
                  type="password"
                  value={securityEnvValues.attendanceJwtSecret}
                  onChange={(e) =>
                    setSecurityEnvValues((prev) => ({ ...prev, attendanceJwtSecret: e.target.value }))
                  }
                  placeholder="Paste new attendance JWT secret"
                />
                <p className="text-xs text-gray-500">Saved as a privileged settings reference. Leave empty to keep current stored value.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="indexnow-key">INDEXNOW_KEY Reference</Label>
                <Input
                  id="indexnow-key"
                  value={securityEnvValues.indexNowKey}
                  onChange={(e) =>
                    setSecurityEnvValues((prev) => ({ ...prev, indexNowKey: e.target.value }))
                  }
                  placeholder="Paste new IndexNow key"
                />
                <p className="text-xs text-gray-500">Saved as a privileged settings reference. Leave empty to keep current stored value.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="gap-2"
                disabled={securityEnvChecking}
                onClick={() => void fetchSecurityEnvStatus()}
              >
                {securityEnvChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh Key Status
              </Button>
              <Button
                className="gap-2 bg-amber-600 hover:bg-amber-700"
                disabled={securityEnvSaving}
                onClick={async () => {
                  if (!token) return;

                  const payload: { attendanceJwtSecret?: string | null; indexNowKey?: string | null } = {};
                  const attendanceValue = securityEnvValues.attendanceJwtSecret.trim();
                  const indexNowValue = securityEnvValues.indexNowKey.trim();

                  if (attendanceValue) payload.attendanceJwtSecret = attendanceValue;
                  if (indexNowValue) payload.indexNowKey = indexNowValue;

                  if (!payload.attendanceJwtSecret && !payload.indexNowKey) {
                    setError('Enter at least one security value before saving.');
                    return;
                  }

                  setSecurityEnvSaving(true);
                  setError(null);
                  try {
                    const status = await api.updateSecurityEnvSettings(payload, token);
                    setSecurityEnvStatus(status);
                    setSecurityEnvValues({ attendanceJwtSecret: '', indexNowKey: '' });
                    setSaved(true);
                    if (savedTimerRef.current) {
                      window.clearTimeout(savedTimerRef.current);
                    }
                    savedTimerRef.current = window.setTimeout(() => setSaved(false), 3000);
                  } catch {
                    setError('Failed to save security env references');
                  } finally {
                    setSecurityEnvSaving(false);
                  }
                }}
              >
                {securityEnvSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Security Values
              </Button>
            </div>

            {securityEnvStatus && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 space-y-2 text-sm">
                <p className="font-medium text-amber-900">
                  Security Status ({securityEnvStatus.runtimeStatus.nodeEnv})
                </p>
                <p className="text-gray-700">
                  ATTENDANCE_JWT_SECRET: {securityEnvStatus.attendanceJwtSecretConfigured ? 'configured in settings' : 'not configured'}
                  {securityEnvStatus.runtimeStatus.attendanceJwtSecretActive ? ' · active at runtime' : ' · not active yet'}
                </p>
                <p className="text-gray-700">
                  INDEXNOW_KEY: {securityEnvStatus.indexNowKeyConfigured ? 'configured in settings' : 'not configured'}
                  {securityEnvStatus.runtimeStatus.indexNowKeyActive ? ' · active at runtime' : ' · not active yet'}
                </p>
                <p className="text-xs text-gray-500">
                  Mode: settings-only.
                  {securityEnvStatus.persistenceSupported === false ? ' Database persistence unavailable (runtime-only mode).' : ' Database persistence available.'}
                </p>
                {securityEnvStatus.runtimeStatus.legacyEnvDetected.attendanceJwtSecret || securityEnvStatus.runtimeStatus.legacyEnvDetected.indexNowKey ? (
                  <p className="text-xs text-amber-700">
                    Legacy env values were detected. Settings values remain the primary source.
                  </p>
                ) : null}
                {securityEnvStatus.runtimeOnlyApplied ? (
                  <p className="text-xs text-amber-700">
                    Values were applied for current runtime only. Run migrations to persist them.
                  </p>
                ) : null}
                {securityEnvStatus.updatedAt ? (
                  <p className="text-xs text-gray-500">Last updated: {formatDateTime(securityEnvStatus.updatedAt)}</p>
                ) : null}
                {!securityEnvStatus.updatedAt ? (
                  <p className="text-xs text-gray-500">No persisted keys yet.</p>
                ) : null}
                <p className="text-xs text-gray-500">
                  This section is visible only to super admin and PRESIDENT.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
          Last updated: {formatDateTime(settings.updatedAt)}
        </p>
      )}
    </div>
  );
}
