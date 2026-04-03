import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/api';

interface SettingsContextType {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
}

const defaultSettings: Settings = {
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
  showNetwork: true,
  certificatesEnabled: true,
  playgroundEnabled: true,
  playgroundDailyLimit: 100,
  emailWelcomeEnabled: true,
  emailEventCreationEnabled: true,
  emailRegistrationEnabled: true,
  emailAnnouncementEnabled: true,
  emailCertificateEnabled: true,
  emailReminderEnabled: true,
  emailTestingMode: false,
  emailTestRecipients: null,
  githubUrl: '',
  linkedinUrl: '',
  twitterUrl: '',
  instagramUrl: '',
  discordUrl: '',
  updatedAt: new Date().toISOString(),
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  loading: true,
  error: null,
  refreshSettings: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSettings();
      setSettings(data);
    } catch {
      setError('Failed to load settings');
      // Use default settings on error
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  // Refetch settings when the tab regains focus (catches admin changes in another tab)
  // Throttled to at most once every 30 seconds to avoid excessive API calls on rapid tab switching
  const lastFetchedRef = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFetchedRef.current > 30_000) {
        lastFetchedRef.current = Date.now();
        void refreshSettings();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSettings]);

  const value = useMemo(
    () => ({ settings, loading, error, refreshSettings }),
    [settings, loading, error, refreshSettings]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
