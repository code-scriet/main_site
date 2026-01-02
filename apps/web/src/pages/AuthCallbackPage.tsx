import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

interface HiringIntent {
  role: string;
  name?: string;
  phone?: string;
  department?: string;
  year?: string;
  skills?: string;
}

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [status, setStatus] = useState('Completing sign in...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      try {
        const token = searchParams.get('token');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          console.error('Auth error:', errorParam);
          navigate('/signin?error=' + errorParam);
          return;
        }

        if (!token) {
          console.error('No token found in callback');
          navigate('/signin');
          return;
        }

        // First, login the user
        await login(token);

        // Check if there's a hiring intent stored
        const hiringIntentStr = localStorage.getItem('hiring_intent');
        if (hiringIntentStr) {
          try {
            const hiringIntent: HiringIntent = JSON.parse(hiringIntentStr);
            localStorage.removeItem('hiring_intent');

            // If we have a hiring intent, try to submit the application
            if (hiringIntent.role) {
              setStatus('Submitting your application...');
              
              // Fetch user info with the new token
              const meResponse = await fetch(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              
              if (meResponse.ok) {
                const result = await meResponse.json();
                const userData = result.data || result;
                
                // Submit the hiring application
                const applicationResponse = await fetch(`${API_URL}/hiring/apply`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    name: hiringIntent.name || userData.name,
                    email: userData.email,
                    phone: hiringIntent.phone,
                    department: hiringIntent.department || 'Not specified',
                    year: hiringIntent.year || 'Not specified',
                    skills: hiringIntent.skills,
                    applyingRole: hiringIntent.role,
                  }),
                });

                if (applicationResponse.ok) {
                  // Redirect to join-us success
                  navigate('/join-us?success=true');
                  return;
                } else {
                  const errorData = await applicationResponse.json();
                  // If application already exists or other error, redirect to complete form
                  if (errorData.error?.includes('already exists')) {
                    navigate('/dashboard');
                    return;
                  }
                  // Redirect to join-us page to complete the form
                  navigate(`/join-us?hiring_role=${hiringIntent.role}`);
                  return;
                }
              }
            }
          } catch (err) {
            console.error('Error processing hiring intent:', err);
          }
        }

        // Default: Check if profile is complete, redirect accordingly
        setStatus('Checking profile...');
        const meResponse = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (meResponse.ok) {
          const result = await meResponse.json();
          const userData = result.data || result;
          
          // Check if academic details are filled
          if (!userData.phone || !userData.course || !userData.branch || !userData.year) {
            setStatus('Redirecting to complete your profile...');
            navigate('/dashboard/profile');
            return;
          }
        }
        
        // Check for pending event registration
        const pendingEventId = localStorage.getItem('pendingEventRegistration');
        if (pendingEventId) {
          setStatus('Completing event registration...');
          try {
            await api.registerForEvent(pendingEventId, token);
            localStorage.removeItem('pendingEventRegistration');
            navigate('/dashboard'); // Success: Go to Dashboard
            return;
          } catch (err) {
            console.error('Auto-registration failed in callback:', err);
            // Failed: Go to Events page to try manually
            localStorage.removeItem('pendingEventRegistration'); 
            navigate('/dashboard/events');
            return;
          }
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
  }, [searchParams, navigate, login]);

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
