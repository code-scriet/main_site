import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { extractApiErrorMessage } from '@/lib/error';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api } from '@/lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

interface HiringIntent {
  role: string;
  name?: string;
  phone?: string;
  department?: string;
  year?: string;
  skills?: string;
}

interface NetworkIntent {
  intent: 'network';
  type?: 'professional' | 'alumni';
}

const getPendingEventRedirectPath = (eventId: string, pendingType: 'solo' | 'team') => (
  pendingType === 'team'
    ? `/events/${eventId}`
    : `/events/${eventId}?register=1`
);

const normalizeNetworkType = (value: string | null | undefined): 'professional' | 'alumni' | undefined => (
  value === 'professional' || value === 'alumni' ? value : undefined
);

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const [status, setStatus] = useState('Completing sign in...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsLoading) {
      return;
    }

    const processCallback = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const tokenFromHash = hashParams.get('token');
        const tokenFromQuery = searchParams.get('token');
        const code = searchParams.get('code');
        let token = tokenFromHash || tokenFromQuery;
        const errorParam = searchParams.get('error');
        let callbackIntent: string | undefined;
        let callbackNetworkType: 'professional' | 'alumni' | undefined;

        if (errorParam) {
          console.error('Auth error:', errorParam);
          navigate('/signin?error=' + errorParam);
          return;
        }

        if (!token && code) {
          const exchange = await api.exchangeAuthCode(code);
          token = exchange.token;
          callbackIntent = exchange.intent;
          callbackNetworkType = normalizeNetworkType(exchange.network_type);
        }

        if (!token) {
          console.error('No token or authorization code found in callback');
          navigate('/signin?error=invalid_oauth_callback');
          return;
        }

        // Remove sensitive token from URL as soon as we have it.
        window.history.replaceState({}, document.title, `${window.location.pathname}`);

        // First, login the user and reuse this user payload to avoid extra /auth/me calls.
        const loggedInUser = await login(token);

        // Check if there's a hiring intent stored
        const hiringIntentStr = localStorage.getItem('hiring_intent');
        if (hiringIntentStr) {
          try {
            const hiringIntent: HiringIntent = JSON.parse(hiringIntentStr);
            localStorage.removeItem('hiring_intent');

            // If hiring is disabled, skip the hiring flow
            if (settings?.hiringEnabled === false) {
              navigate('/dashboard');
              return;
            }

            // If we have a hiring intent, try to submit the application
            if (hiringIntent.role) {
              setStatus('Submitting your application...');

              // Submit the hiring application
              const applicationResponse = await fetch(`${API_URL}/hiring/apply`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  name: hiringIntent.name || loggedInUser.name,
                  email: loggedInUser.email,
                  phone: hiringIntent.phone,
                  department: hiringIntent.department || 'Not specified',
                  year: hiringIntent.year || 'Not specified',
                  skills: hiringIntent.skills,
                  applyingRole: hiringIntent.role,
                }),
              });

              if (applicationResponse.ok) {
                // Redirect to join-us success (will redirect to home if hiring disabled)
                navigate('/join-us?success=true');
                return;
              } else {
                const errorData = await applicationResponse.json().catch(() => null);
                const errorMessage = extractApiErrorMessage(errorData, 'Failed to submit application');
                // If application already exists or other error, redirect to complete form
                if (errorMessage.toLowerCase().includes('already exists')) {
                  navigate('/dashboard');
                  return;
                }
                // Redirect to join-us page to complete the form (will redirect to home if hiring disabled)
                navigate(`/join-us?hiring_role=${hiringIntent.role}`);
                return;
              }
            }
          } catch (err) {
            console.error('Error processing hiring intent:', err);
          }
        }

        // Check for network intent from URL hash/query (set by backend) or localStorage
        const intentFromHash = callbackIntent || hashParams.get('intent') || searchParams.get('intent');
        const networkTypeFromHash = normalizeNetworkType(
          callbackNetworkType || hashParams.get('network_type') || searchParams.get('network_type')
        );
        const networkTypeFromStorage = normalizeNetworkType(localStorage.getItem('network_onboarding_type'));
        const networkIntentStr = localStorage.getItem('network_intent');
        let parsedNetworkIntent: NetworkIntent | null = null;
        if (networkIntentStr) {
          try {
            const parsed = JSON.parse(networkIntentStr) as Partial<NetworkIntent>;
            if (parsed.intent === 'network') {
              parsedNetworkIntent = {
                intent: 'network',
                type: normalizeNetworkType(parsed.type),
              };
            }
          } catch {
            parsedNetworkIntent = null;
          } finally {
            localStorage.removeItem('network_intent');
          }
        }

        // Network routing must be driven by backend callback intent only.
        // Local storage is used as a fallback for type, never as the source of intent.
        const isNetworkIntent = intentFromHash === 'network';
        const resolvedNetworkType =
          networkTypeFromHash ||
          parsedNetworkIntent?.type ||
          networkTypeFromStorage;

        if (isNetworkIntent && settings?.showNetwork !== false) {
          // For network users, skip academic profile check and redirect to onboarding
          setStatus('Redirecting to network onboarding...');
          if (resolvedNetworkType) {
            localStorage.setItem('network_onboarding_type', resolvedNetworkType);
          }
          const onboardingUrl = resolvedNetworkType
            ? `/network/onboarding?type=${encodeURIComponent(resolvedNetworkType)}`
            : '/network/onboarding';
          navigate(onboardingUrl);
          return;
        }

        // Determine role and profile completion from logged-in user payload
        setStatus('Checking profile...');
        
        // NETWORK role users should never see dashboard — route to network pages
        if (loggedInUser.role === 'NETWORK') {
          if (settings?.showNetwork === false) {
            navigate('/');
            return;
          }
          if (resolvedNetworkType) {
            localStorage.setItem('network_onboarding_type', resolvedNetworkType);
          }
          // Check if they already have a network profile
          try {
            const profileRes = await fetch(`${API_URL}/network/profile/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (profileRes.ok) {
              navigate('/network/status');
            } else {
              const onboardingUrl = resolvedNetworkType
                ? `/network/onboarding?type=${encodeURIComponent(resolvedNetworkType)}`
                : '/network/onboarding';
              navigate(onboardingUrl);
            }
          } catch {
            const onboardingUrl = resolvedNetworkType
              ? `/network/onboarding?type=${encodeURIComponent(resolvedNetworkType)}`
              : '/network/onboarding';
            navigate(onboardingUrl);
          }
          return;
        }

        if (!isNetworkIntent) {
          localStorage.removeItem('network_onboarding_type');
          localStorage.removeItem('network_intent');
        }
        
        // Regular users: Check if academic details are filled
        if (!loggedInUser.phone || !loggedInUser.course || !loggedInUser.branch || !loggedInUser.year) {
          setStatus('Redirecting to complete your profile...');
          const pendingEventId = localStorage.getItem('pendingEventRegistration');
          navigate('/dashboard/profile', { state: { pendingEventId } });
          return;
        }
        
        // Check for pending event registration
        const pendingEventId = localStorage.getItem('pendingEventRegistration');
        const pendingEventType = localStorage.getItem('pendingEventRegistrationType');
        if (pendingEventId) {
          setStatus('Redirecting to event registration...');
          localStorage.removeItem('pendingEventRegistration');
          localStorage.removeItem('pendingEventRegistrationType');
          navigate(getPendingEventRedirectPath(pendingEventId, pendingEventType === 'team' ? 'team' : 'solo'));
          return;
        }
        
        setStatus('Redirecting to dashboard...');
        navigate('/dashboard');
      } catch (err) {
        console.error('Callback processing error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setTimeout(() => navigate('/signin'), 2000);
      }
    };

    processCallback();
  }, [searchParams, navigate, login, settingsLoading, settings?.hiringEnabled, settings?.showNetwork]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
      <div className="text-center bg-white p-8 rounded-lg shadow-lg max-w-md">
        {error ? (
          <>
            <div className="text-red-500 text-5xl mb-4">✕</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Authentication Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">Redirecting to sign in...</p>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-amber-600 mx-auto mb-6"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">{status}</h2>
            <p className="text-sm text-gray-500">Please wait...</p>
          </>
        )}
      </div>
    </div>
  );
}
