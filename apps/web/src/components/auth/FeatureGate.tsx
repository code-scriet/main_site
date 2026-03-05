import { Navigate, Outlet } from 'react-router-dom';
import { useSettings } from '@/context/SettingsContext';
import type { Settings } from '@/lib/api';

interface FeatureGateProps {
  featureKey: keyof Settings;
  redirectTo?: string;
}

/**
 * Wraps routes that should only be accessible when a feature toggle is enabled.
 * Redirects to `redirectTo` (default: '/') when the feature is disabled.
 * While settings are still loading the gate is transparent (allows rendering),
 * so there is no flash of redirect for users who visit before settings arrive.
 */
export function FeatureGate({ featureKey, redirectTo = '/' }: FeatureGateProps) {
  const { settings, loading } = useSettings();

  // While loading, don't block (avoids incorrect redirect on first paint)
  if (loading) return <Outlet />;

  // Treat both null and undefined as "no settings yet" → enable the feature.
  // The intentional loose equality (==) handles both cases concisely.
  const isEnabled = settings == null || settings[featureKey] !== false;

  if (!isEnabled) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
