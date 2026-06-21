import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, AlertCircle, CheckCircle, Globe, Mail, Shield, Loader2, RefreshCw, FileText, Eye, Code, Search, Clock, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import type { Settings, SecurityEnvStatus } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { Markdown } from '@/components/ui/markdown';
import { formatDateTime } from '@/lib/dateUtils';
import { ToggleRow as SharedToggleRow } from '@/components/admin/settings/ToggleRow';
import { GeneralSettingsCard } from '@/components/admin/settings/GeneralSettingsCard';
import { RegistrationEventsCard } from '@/components/admin/settings/RegistrationEventsCard';
import { SocialLinksCard } from '@/components/admin/settings/SocialLinksCard';
import { ContactChannelsCard } from '@/components/admin/settings/ContactChannelsCard';
import { BrandAccentCard } from '@/components/admin/settings/BrandAccentCard';
import { CodeExecutionCard } from '@/components/admin/settings/CodeExecutionCard';
import { SettingsCard } from '@/components/admin/settings/SettingsCard';

const ToggleRow = SharedToggleRow;

export default function AdminSettings() {
  const { user, token } = useAuth();
  const { refreshSettings: refreshGlobalSettings } = useSettings();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Bumped on every successful save (toggle, patch, or bulk). Drives the "Saved {relative}"
  // indicator on each <SettingsCard>. One global timestamp keeps the wiring simple — the
  // design pattern is "each card auto-saves", not "each card has independent history".
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  
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
    hiringCycle: '2026',
    competitionEnabled: false,
    problemsEnabled: false,
    plagiarismCheckEnabled: false,
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
    whatsappUrl: '',
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
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  const [reminderResult, setReminderResult] = useState<
    { sent: number; events: string[]; disabled?: boolean; error?: string } | null
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
      setLastSavedAt(Date.now());
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

      // Drop blank/half-filled contact-email rows so one incomplete row can't
      // fail Zod validation and block the entire settings save.
      const cleanedContactEmails = (updateData.contactEmails ?? [])
        .map((e) => ({ label: e.label.trim(), email: e.email.trim() }))
        .filter((e) => e.label && e.email);

      // Update regular settings
      const updated = await api.updateSettings(
        { ...updateData, contactEmails: cleanedContactEmails },
        token,
      );
      
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
      setLastSavedAt(Date.now());
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
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)] mx-auto mb-2" />
          <p className="text-[var(--ds-text-2)]">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--ds-text-1)]">Settings</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-0.5">Configure club settings and preferences</p>
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
          className="flex items-start gap-3 px-4 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[13px]"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p>{error}</p>
          </div>
        </motion.div>
      )}

      {saved && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 px-4 py-2.5 rounded-[10px] border border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)] text-[13px]"
          role="status"
        >
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Settings saved successfully!</p>
        </motion.div>
      )}

      {/* Card-per-block grid (design source: screen-admin.jsx:546).
          Heavy cards mark themselves lg:col-span-2 below. */}
      <div className="grid lg:grid-cols-2 gap-4">

      {/* General Settings */}
      <GeneralSettingsCard settings={settings} onChange={setSettings} lastSavedAt={lastSavedAt} />

      {/* Dashboard v2 — accent picker (writes Settings.accentColor and live-applies via [data-accent]) */}
      <BrandAccentCard settings={settings} onChange={setSettings} lastSavedAt={lastSavedAt} onSaved={() => setLastSavedAt(Date.now())} />

      {/* Code execution provider picker (writes Settings.codeExecutionProvider; honored by judge + playground) */}
      <CodeExecutionCard settings={settings} onChange={setSettings} lastSavedAt={lastSavedAt} onSaved={() => setLastSavedAt(Date.now())} />

      <RegistrationEventsCard settings={settings} onChange={setSettings} lastSavedAt={lastSavedAt} />

      {/* Email & Notifications — half-width per design intent (compact toggles only). */}
      <SettingsCard
        title="Email & notifications"
        description="Choose which categories send, and route all mail to test addresses while debugging."
        icon={Mail}
        lastSavedAt={lastSavedAt}
      >
        {settings.emailTestingMode && (
          <div className="flex items-start gap-2 p-3 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-[8px]">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-[var(--warning)]">Testing mode is on</p>
              <p className="text-[11.5px] text-[var(--ds-text-2)] mt-0.5 leading-snug">
                Email goes only to test addresses below.
                {!settings.emailTestRecipients?.trim() && (
                  <span className="block mt-0.5 text-[var(--danger)] font-medium">
                    No test recipients — all email is currently suppressed.
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        <ToggleRow
          id="email-testing-mode"
          label="Testing mode"
          description="Redirect outbound email to test addresses."
          checked={settings.emailTestingMode ?? false}
          onCheckedChange={(checked) => void handleToggle('emailTestingMode', checked)}
        />

        {settings.emailTestingMode && (
          <div className="ml-3 border-l-2 border-[var(--accent-ring)] pl-3 space-y-1.5">
            <Label htmlFor="email-test-recipients" className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Test recipients</Label>
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
              className="h-8 text-[12.5px]"
            />
            <p className="text-[10.5px] text-[var(--ds-text-3)]">Comma-separated. All outbound email lands here.</p>
          </div>
        )}

        <ToggleRow
          id="announcements-enabled"
          label="Announcements"
          description="Show announcement notifications to users."
          checked={settings.announcementsEnabled}
          onCheckedChange={(checked) => setSettings({ ...settings, announcementsEnabled: checked })}
        />

        <div className="pt-1">
          <p className="text-[10.5px] font-semibold text-[var(--ds-text-3)] uppercase tracking-[0.06em] mb-1.5">Categories</p>
          <div className="flex flex-col">
            {[
              { key: 'emailWelcomeEnabled' as const, label: 'Welcome', desc: 'New user registration' },
              { key: 'emailEventCreationEnabled' as const, label: 'New event', desc: 'When an event is created' },
              { key: 'emailRegistrationEnabled' as const, label: 'Registration confirmed', desc: 'On event registration' },
              { key: 'emailAnnouncementEnabled' as const, label: 'Announcement digest', desc: 'New club announcements' },
              { key: 'emailCertificateEnabled' as const, label: 'Certificate issued', desc: 'On certificate generation' },
              { key: 'emailReminderEnabled' as const, label: 'Event reminders', desc: 'Scheduled before event start' },
              { key: 'emailInvitationEnabled' as const, label: 'Invitations', desc: 'Guest/speaker invitations' },
              { key: 'mailingEnabled' as const, label: 'Admin bulk mail', desc: 'Composer for ad-hoc sends' },
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
        </div>
      </SettingsCard>

      {/* Feature toggles — wide per design (many switches in a 2-col layout). */}
      <SettingsCard
        title="Feature toggles"
        description="Show or hide features on the user dashboard."
        icon={Shield}
        lastSavedAt={lastSavedAt}
        wide
      >
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          <ToggleRow
            id="show-leaderboard"
            label="Leaderboard"
            description="Dashboard leaderboard widget."
            checked={settings.showLeaderboard ?? false}
            onCheckedChange={(checked) => void handleToggle('showLeaderboard', checked)}
            compact
          />
          <ToggleRow
            id="show-qotd"
            label="Question of the Day"
            description="QOTD widget + solve flow."
            checked={settings.showQOTD ?? true}
            onCheckedChange={(checked) => void handleToggle('showQOTD', checked)}
            compact
          />
          <ToggleRow
            id="show-achievements"
            label="Achievements"
            description="Dashboard achievements strip."
            checked={settings.showAchievements ?? true}
            onCheckedChange={(checked) => void handleToggle('showAchievements', checked)}
            compact
          />
          <ToggleRow
            id="show-tech-blogs"
            label="Tech blogs"
            description="Show tech blogs section where supported."
            checked={settings.show_tech_blogs ?? true}
            onCheckedChange={(checked) => void handleToggle('show_tech_blogs', checked)}
            compact
          />
          <ToggleRow
            id="show-network"
            label="Network"
            description="Alumni / industry network page."
            checked={settings.showNetwork ?? true}
            onCheckedChange={(checked) => void handleToggle('showNetwork', checked)}
            compact
          />
          <ToggleRow
            id="certificates-enabled"
            label="Certificates"
            description="Admin certificate generation."
            checked={settings.certificatesEnabled ?? true}
            onCheckedChange={(checked) => void handleToggle('certificatesEnabled', checked)}
            compact
          />
          <ToggleRow
            id="playground-enabled"
            label="Code playground"
            description="Editor link + execution widget."
            checked={settings.playgroundEnabled ?? true}
            onCheckedChange={(checked) => void handleToggle('playgroundEnabled', checked)}
            compact
          />
          <ToggleRow
            id="competition-enabled"
            label="Competition"
            description="Contest rounds (admin + solve)."
            checked={settings.competitionEnabled ?? false}
            onCheckedChange={(checked) => void handleToggle('competitionEnabled', checked)}
            compact
          />
          <ToggleRow
            id="problems-enabled"
            label="Problems"
            description="QOTD / practice / DSA judge stack."
            checked={settings.problemsEnabled ?? false}
            onCheckedChange={(checked) => void handleToggle('problemsEnabled', checked)}
            compact
          />
          <ToggleRow
            id="plagiarism-enabled"
            label="Plagiarism check"
            description="Admin-run code similarity check for contests (review-only)."
            checked={settings.plagiarismCheckEnabled ?? false}
            onCheckedChange={(checked) => void handleToggle('plagiarismCheckEnabled', checked)}
            compact
          />
          <ToggleRow
            id="hiring-enabled"
            label="Hiring"
            description="Application pipeline + kanban."
            checked={settings.hiringEnabled ?? true}
            onCheckedChange={(checked) => void handleToggle('hiringEnabled', checked)}
            compact
          />
        </div>

        {settings.hiringEnabled && (
          <div className="border-l-2 border-[var(--accent-ring)] pl-3 ml-1 mt-1 flex flex-col gap-1">
            <p className="text-[10.5px] font-semibold text-[var(--ds-text-3)] uppercase tracking-[0.06em] mb-0.5">Team-specific hiring</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0">
              {[
                { key: 'hiringTechnical' as const, label: 'Technical', desc: 'Technical division.' },
                { key: 'hiringDsaChamps' as const, label: 'DSA Champs', desc: 'DSA Champs division.' },
                { key: 'hiringDesigning' as const, label: 'Design', desc: 'Design division.' },
                { key: 'hiringSocialMedia' as const, label: 'Social media', desc: 'Social media division.' },
                { key: 'hiringManagement' as const, label: 'Management', desc: 'Management division.' },
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
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="hiring-cycle" className="text-[12.5px] text-[var(--ds-text-2)] shrink-0">
                Hiring cycle
              </label>
              <Input
                id="hiring-cycle"
                value={settings.hiringCycle ?? '2026'}
                onChange={(e) => setSettings({ ...settings, hiringCycle: e.target.value })}
                placeholder="2026"
                className="h-8 max-w-[180px] text-[12.5px]"
              />
              <span className="text-[11px] text-[var(--ds-text-3)]">
                Bump to re-open hiring — past applicants can apply again. Save to apply.
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 p-2.5 rounded-[8px] bg-[var(--surface-soft)] mt-1">
          <div className="min-w-0">
            <Label htmlFor="playground-daily-limit" className="text-[12.5px] font-medium text-[var(--ds-text-1)]">
              Playground daily limit
            </Label>
            <p className="text-[11px] text-[var(--ds-text-3)] mt-0.5">Shared cap across dashboard + executor.</p>
          </div>
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
            className="h-8 w-[88px] text-[12.5px] tabular-nums font-mono text-right"
          />
        </div>
      </SettingsCard>

      <SocialLinksCard settings={settings} onChange={setSettings} lastSavedAt={lastSavedAt} />

      {/* Contact channels — phone + admin-managed extra emails for the public /contact page. */}
      <ContactChannelsCard settings={settings} onChange={setSettings} lastSavedAt={lastSavedAt} />

      {/* Email templates — wide because the markdown editor needs horizontal room. */}
      <SettingsCard
        title="Email templates"
        description="Customise automated email copy. Markdown supported. Leave empty to use defaults."
        icon={FileText}
        lastSavedAt={lastSavedAt}
        wide
      >
        <div className="space-y-1.5">
          <Label htmlFor="email-footer-text" className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
            Email footer text
          </Label>
          <Input
            id="email-footer-text"
            value={settings.emailFooterText || ''}
            onChange={(e) => setSettings({ ...settings, emailFooterText: e.target.value })}
            placeholder="Building the next generation of developers."
            className="h-8 text-[12.5px]"
          />
          <p className="text-[10.5px] text-[var(--ds-text-3)]">Appears at the bottom of every email.</p>
        </div>

        {/* Tab nav + preview toggle */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)]" role="tablist" aria-label="Email templates">
          <div className="flex gap-0">
            {(['welcome', 'announcement', 'event'] as const).map((tab) => {
              const label = tab === 'welcome' ? 'Welcome' : tab === 'announcement' ? 'Announcement' : 'New event';
              const active = activeEmailTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="email-template-panel"
                  onClick={() => setActiveEmailTab(tab)}
                  className={`px-3 h-9 text-[12.5px] font-medium border-b-2 -mb-px transition-colors ${
                    active
                      ? 'border-[var(--accent)] text-[var(--ds-text-1)]'
                      : 'border-transparent text-[var(--ds-text-3)] hover:text-[var(--ds-text-2)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="gap-1.5 -mb-1"
          >
            {showPreview ? <Code className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPreview ? 'Edit' : 'Preview'}
          </Button>
        </div>

        {activeEmailTab === 'welcome' && (
          <div id="email-template-panel" role="tabpanel" className="space-y-2">
            <Label htmlFor="email-welcome-body" className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
              Custom welcome intro <span className="font-normal normal-case tracking-normal text-[var(--ds-text-3)]">(optional)</span>
            </Label>
            <p className="text-[11px] text-[var(--ds-text-3)]">
              Prepended to the premium welcome template. Variables: <code className="font-mono text-[var(--ds-text-2)]">{'{{name}}'}</code> <code className="font-mono text-[var(--ds-text-2)]">{'{{clubName}}'}</code>
            </p>
            {showPreview ? (
              <div className="min-h-[160px] p-3 bg-[var(--bg-sunken)] rounded-[8px] border border-[var(--border-subtle)] text-[12.5px]">
                <Markdown>{settings.emailWelcomeBody || `*No custom message set. Default premium template will render.*`}</Markdown>
              </div>
            ) : (
              <textarea
                id="email-welcome-body"
                value={settings.emailWelcomeBody || ''}
                onChange={(e) => setSettings({ ...settings, emailWelcomeBody: e.target.value })}
                className="w-full min-h-[160px] px-3 py-2 border border-[var(--border-default)] rounded-[8px] bg-[var(--bg-raised)] text-[12.5px] font-mono focus:outline-none focus:border-[var(--accent)] resize-y"
                placeholder={`Hey **{{name}}**, welcome to {{clubName}}!\nYour journey starts now…`}
              />
            )}
          </div>
        )}

        {activeEmailTab === 'announcement' && (
          <div id="email-template-panel" role="tabpanel" className="space-y-2">
            <Label htmlFor="email-announcement-body" className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
              Custom announcement intro <span className="font-normal normal-case tracking-normal text-[var(--ds-text-3)]">(optional)</span>
            </Label>
            <p className="text-[11px] text-[var(--ds-text-3)]">Prepended to the actual announcement body in emails.</p>
            {showPreview ? (
              <div className="min-h-[120px] p-3 bg-[var(--bg-sunken)] rounded-[8px] border border-[var(--border-subtle)] text-[12.5px]">
                <Markdown>{settings.emailAnnouncementBody || `Hey there! 👋\n\nHere's the latest update from **code.scriet**:`}</Markdown>
              </div>
            ) : (
              <textarea
                id="email-announcement-body"
                value={settings.emailAnnouncementBody || ''}
                onChange={(e) => setSettings({ ...settings, emailAnnouncementBody: e.target.value })}
                className="w-full min-h-[120px] px-3 py-2 border border-[var(--border-default)] rounded-[8px] bg-[var(--bg-raised)] text-[12.5px] font-mono focus:outline-none focus:border-[var(--accent)] resize-y"
                placeholder={`Hey there! 👋\n\nHere's the latest update from **code.scriet**:`}
              />
            )}
          </div>
        )}

        {activeEmailTab === 'event' && (
          <div id="email-template-panel" role="tabpanel" className="space-y-2">
            <Label htmlFor="email-event-body" className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
              Custom event intro <span className="font-normal normal-case tracking-normal text-[var(--ds-text-3)]">(optional)</span>
            </Label>
            <p className="text-[11px] text-[var(--ds-text-3)]">Prepended to event detail in notification emails.</p>
            {showPreview ? (
              <div className="min-h-[120px] p-3 bg-[var(--bg-sunken)] rounded-[8px] border border-[var(--border-subtle)] text-[12.5px]">
                <Markdown>{settings.emailEventBody || `🎯 **New event alert!**\n\nWe've got something exciting lined up for you:`}</Markdown>
              </div>
            ) : (
              <textarea
                id="email-event-body"
                value={settings.emailEventBody || ''}
                onChange={(e) => setSettings({ ...settings, emailEventBody: e.target.value })}
                className="w-full min-h-[120px] px-3 py-2 border border-[var(--border-default)] rounded-[8px] bg-[var(--bg-raised)] text-[12.5px] font-mono focus:outline-none focus:border-[var(--accent)] resize-y"
                placeholder={`🎯 **New event alert!**\n\nWe've got something exciting lined up for you:`}
              />
            )}
          </div>
        )}

        <details className="rounded-[8px] bg-[var(--surface-soft)] px-2.5 py-2 text-[11.5px]">
          <summary className="cursor-pointer font-medium text-[var(--ds-text-2)]">Markdown tips</summary>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[var(--ds-text-3)]">
            <li><code className="font-mono bg-[var(--bg-raised)] px-1 rounded">**bold**</code> → <strong>bold</strong></li>
            <li><code className="font-mono bg-[var(--bg-raised)] px-1 rounded">*italic*</code> → <em>italic</em></li>
            <li><code className="font-mono bg-[var(--bg-raised)] px-1 rounded">## Heading</code></li>
            <li><code className="font-mono bg-[var(--bg-raised)] px-1 rounded">- item</code></li>
            <li><code className="font-mono bg-[var(--bg-raised)] px-1 rounded">[link](url)</code></li>
            <li><code className="font-mono bg-[var(--bg-raised)] px-1 rounded">&gt; quote</code></li>
          </ul>
        </details>
      </SettingsCard>

      {/* Event status sync — half-width admin tool. */}
      <SettingsCard
        title="Event status sync"
        description="Background sync runs every 30 min. Trigger an instant pass here."
        icon={Clock}
        lastSavedAt={lastSavedAt}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
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
            {eventSyncSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync now
          </Button>
          {eventSyncResult && !eventSyncResult.error && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--success)]">
              <CheckCircle className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">
                {eventSyncResult.toOngoing + eventSyncResult.toPastFromOngoing + eventSyncResult.toPastFromUpcoming}
              </span> updated
            </span>
          )}
          {eventSyncResult?.error && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--danger)]">
              <AlertCircle className="h-3.5 w-3.5" />
              {eventSyncResult.error}
            </span>
          )}
        </div>
        {eventSyncResult && !eventSyncResult.error && (
          <p className="text-[11px] text-[var(--ds-text-3)] font-mono">
            <span className="tabular-nums">{eventSyncResult.toOngoing}</span> → ONGOING
            <span className="mx-1.5 text-[var(--border-default)]">·</span>
            <span className="tabular-nums">{eventSyncResult.toPastFromOngoing}</span> → PAST (live)
            <span className="mx-1.5 text-[var(--border-default)]">·</span>
            <span className="tabular-nums">{eventSyncResult.toPastFromUpcoming}</span> → PAST (skipped)
          </p>
        )}
      </SettingsCard>

      {/* Event reminders — half-width admin tool. The on/off switch is the
          "Event reminders" toggle under Email categories above; this card runs
          a reminder pass on demand and respects that switch + per-event opt-out. */}
      <SettingsCard
        title="Event reminders"
        description="Reminders auto-send ~24h before each event. Toggle the global switch under Email → Categories, or run a pass now."
        icon={Clock}
        lastSavedAt={lastSavedAt}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={reminderSubmitting}
            onClick={async () => {
              if (!token) return;
              setReminderSubmitting(true);
              setReminderResult(null);
              try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/settings/reminders/trigger`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                  credentials: 'include',
                });
                const data = await res.json();
                if (data.success && data.data) {
                  setReminderResult(data.data);
                } else {
                  setReminderResult({ sent: 0, events: [], error: data.error?.message || 'Trigger failed' });
                }
              } catch {
                setReminderResult({ sent: 0, events: [], error: 'Network error' });
              } finally {
                setReminderSubmitting(false);
              }
            }}
          >
            {reminderSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Send reminders now
          </Button>
          {reminderResult && !reminderResult.error && !reminderResult.disabled && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--success)]">
              <CheckCircle className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">{reminderResult.sent}</span> sent
            </span>
          )}
          {reminderResult?.disabled && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--warning)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              Reminders are turned off
            </span>
          )}
          {reminderResult?.error && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--danger)]">
              <AlertCircle className="h-3.5 w-3.5" />
              {reminderResult.error}
            </span>
          )}
        </div>
        {reminderResult && !reminderResult.error && !reminderResult.disabled && reminderResult.events.length > 0 && (
          <p className="text-[11px] text-[var(--ds-text-3)]">
            {reminderResult.events.join(' · ')}
          </p>
        )}
        {reminderResult && !reminderResult.error && !reminderResult.disabled && reminderResult.sent === 0 && (
          <p className="text-[11px] text-[var(--ds-text-3)]">No events were inside the reminder window.</p>
        )}
        {reminderResult?.disabled && (
          <p className="text-[11px] text-[var(--ds-text-3)]">Enable “Event reminders” under Email → Categories above, then try again.</p>
        )}
      </SettingsCard>

      {/* IndexNow — half-width admin tool. */}
      <SettingsCard
        title="IndexNow"
        description="Notify Bing, Yandex and Google about all your pages so they index faster."
        icon={Search}
        lastSavedAt={lastSavedAt}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
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
            {indexNowSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            Submit all URLs
          </Button>
          {indexNowResult && !indexNowResult.error && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--success)]">
              <CheckCircle className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">{indexNowResult.count}</span> URLs
            </span>
          )}
          {indexNowResult?.error && (
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--danger)]">
              <AlertCircle className="h-3.5 w-3.5" />
              {indexNowResult.error}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--ds-text-3)]">
          New pages submit automatically on create/update; this only catches up.
        </p>
      </SettingsCard>

      {/* Security keys — wide so the two key inputs fit side-by-side. Super admin / PRESIDENT only. */}
      {canManageSecurityEnv && (
        <SettingsCard
          title="Security keys"
          description="ATTENDANCE_JWT_SECRET and INDEXNOW_KEY live in settings. Env values are legacy fallbacks only."
          icon={Shield}
          lastSavedAt={lastSavedAt}
          wide
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="attendance-jwt-secret" className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                Attendance JWT secret
              </Label>
              <Input
                id="attendance-jwt-secret"
                type="password"
                value={securityEnvValues.attendanceJwtSecret}
                onChange={(e) =>
                  setSecurityEnvValues((prev) => ({ ...prev, attendanceJwtSecret: e.target.value }))
                }
                placeholder="Paste new secret"
                className="h-8 text-[12.5px] font-mono"
              />
              <p className="text-[10.5px] text-[var(--ds-text-3)]">Leave empty to keep current value.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="indexnow-key" className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                IndexNow key
              </Label>
              <Input
                id="indexnow-key"
                value={securityEnvValues.indexNowKey}
                onChange={(e) =>
                  setSecurityEnvValues((prev) => ({ ...prev, indexNowKey: e.target.value }))
                }
                placeholder="Paste new key"
                className="h-8 text-[12.5px] font-mono"
              />
              <p className="text-[10.5px] text-[var(--ds-text-3)]">Leave empty to keep current value.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={securityEnvChecking}
              onClick={() => void fetchSecurityEnvStatus()}
            >
              {securityEnvChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh status
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
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
              {securityEnvSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>

          {securityEnvStatus && (
            <div className="rounded-[8px] bg-[var(--surface-soft)] p-2.5 text-[11.5px] space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--ds-text-2)] font-medium">Attendance JWT secret</span>
                <span className={`font-mono tabular-nums text-[10.5px] ${securityEnvStatus.attendanceJwtSecretConfigured ? 'text-[var(--success)]' : 'text-[var(--ds-text-3)]'}`}>
                  {securityEnvStatus.attendanceJwtSecretConfigured ? 'Configured' : 'Not set'}
                  {securityEnvStatus.runtimeStatus.attendanceJwtSecretActive ? ' · active' : ''}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--ds-text-2)] font-medium">IndexNow key</span>
                <span className={`font-mono tabular-nums text-[10.5px] ${securityEnvStatus.indexNowKeyConfigured ? 'text-[var(--success)]' : 'text-[var(--ds-text-3)]'}`}>
                  {securityEnvStatus.indexNowKeyConfigured ? 'Configured' : 'Not set'}
                  {securityEnvStatus.runtimeStatus.indexNowKeyActive ? ' · active' : ''}
                </span>
              </div>
              {securityEnvStatus.updatedAt && (
                <div className="text-[10.5px] text-[var(--ds-text-3)] pt-1 border-t border-[var(--border-subtle)] mt-1">
                  Updated {formatDateTime(securityEnvStatus.updatedAt)} · {securityEnvStatus.runtimeStatus.nodeEnv}
                </div>
              )}
              {securityEnvStatus.runtimeOnlyApplied && (
                <div className="text-[10.5px] text-[var(--warning)]">
                  Applied for current runtime only. Run migrations to persist.
                </div>
              )}
            </div>
          )}
        </SettingsCard>
      )}

      </div>{/* /grid lg:grid-cols-2 */}

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={fetchSettings} disabled={saving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={saving} className="min-w-[140px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)]">
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
        <p className="text-xs text-[var(--ds-text-3)] text-right">
          Last updated: {formatDateTime(settings.updatedAt)}
        </p>
      )}
    </div>
  );
}
