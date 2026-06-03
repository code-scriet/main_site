import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/api';

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
}

interface SettingsActions {
  refreshSettings: () => Promise<void>;
}

type SettingsContextType = SettingsState & SettingsActions;

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
  problemsEnabled: false,
  accentColor: 'rust',
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
  emailInvitationEnabled: true,
  emailTestingMode: false,
  emailTestRecipients: null,
  githubUrl: '',
  linkedinUrl: '',
  twitterUrl: '',
  instagramUrl: '',
  discordUrl: '',
  whatsappUrl: '',
  contactPhone: null,
  contactEmails: [],
  updatedAt: new Date().toISOString(),
};

// Two contexts so consumers that only need `refreshSettings()` don't re-render
// on every settings/loading/error change. `useSettings()` keeps the combined
// shape for backward compatibility.
const SettingsStateContext = createContext<SettingsState>({
  settings: defaultSettings,
  loading: true,
  error: null,
});

const SettingsActionsContext = createContext<SettingsActions>({
  refreshSettings: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    // Initial state is `loading: true`. Subsequent refetches keep the
    // stale settings visible and never flip `loading` back to true —
    // otherwise every window-focus refetch briefly unmounts every
    // consumer that gates on `settingsLoading` (dashboard Hiring CTA,
    // playground card, etc.), causing right-column cards to flicker out
    // and back in with Framer Motion's fade-in.
    try {
      setError(null);
      const data = await api.getSettings();
      setSettings(data);
    } catch {
      setError('Failed to load settings');
      // Use default settings on error so consumers never block forever.
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

  const state = useMemo<SettingsState>(
    () => ({ settings, loading, error }),
    [settings, loading, error],
  );

  const actions = useMemo<SettingsActions>(
    () => ({ refreshSettings }),
    [refreshSettings],
  );

  return (
    <SettingsActionsContext.Provider value={actions}>
      <SettingsStateContext.Provider value={state}>
        {children}
      </SettingsStateContext.Provider>
    </SettingsActionsContext.Provider>
  );
}

export function useSettingsState(): SettingsState {
  return useContext(SettingsStateContext);
}

export function useSettingsActions(): SettingsActions {
  return useContext(SettingsActionsContext);
}

// Backward-compatible combined hook. Subscribes to both contexts so it
// re-renders on any state change (same as before). New code that only needs
// `refreshSettings` should use useSettingsActions() to skip the re-renders.
export function useSettings(): SettingsContextType {
  const state = useSettingsState();
  const actions = useSettingsActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
