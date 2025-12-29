import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

  useEffect(() => {
    const processCallback = async () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error) {
        console.error('Auth error:', error);
        navigate('/signin?error=' + error);
        return;
      }

      if (token) {
        // First, login the user
        login(token);

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
                const userData = await meResponse.json();
                
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

        // Default: navigate to dashboard
        navigate('/dashboard');
      } else {
        navigate('/signin');
      }
    };

    processCallback();
  }, [searchParams, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  );
}
