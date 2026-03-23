import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chrome, Github, Mail, AlertCircle, Loader2, Eye, EyeOff, Lock, User, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import type { AuthProviders } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const errorMessages: Record<string, string> = {
  google_not_configured: 'Google Sign-In is not configured yet. Please use another method.',
  github_not_configured: 'GitHub Sign-In is not configured yet. Please use another method.',
  google_auth_failed: 'Google authentication failed. Please try again.',
  github_auth_failed: 'GitHub authentication failed. Please try again.',
};

type AuthMode = 'options' | 'login' | 'register';

const getPendingEventRedirectPath = (eventId: string, pendingType: 'solo' | 'team') => (
  pendingType === 'team'
    ? `/events/${eventId}`
    : `/events/${eventId}?register=1`
);

const getSafeNextUrl = (rawNext: string | null): string | null => {
  if (!rawNext) return null;
  try {
    const parsed = new URL(rawNext, window.location.origin);
    const allowedOrigins = new Set([
      window.location.origin,
      'https://codescriet.dev',
      'https://www.codescriet.dev',
      'https://code.codescriet.dev',
      ...(import.meta.env.DEV
        ? ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']
        : []),
    ]);
    return allowedOrigins.has(parsed.origin) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const getPlaygroundOrigins = (): Set<string> => {
  const origins = new Set<string>();
  const configured = (import.meta.env.VITE_PLAYGROUND_URL as string | undefined)?.trim();
  if (configured) {
    try {
      origins.add(new URL(configured, window.location.origin).origin);
    } catch {
      // ignore invalid configured playground url
    }
  }
  origins.add(import.meta.env.DEV ? 'http://localhost:5174' : 'https://code.codescriet.dev');
  if (import.meta.env.DEV) {
    origins.add('http://127.0.0.1:5174');
  }
  return origins;
};

const redirectToNext = (navigate: ReturnType<typeof useNavigate>, targetUrl: string) => {
  const parsed = new URL(targetUrl);
  if (getPlaygroundOrigins().has(parsed.origin)) {
    const token = localStorage.getItem('token');
    if (token) {
      parsed.hash = `token=${encodeURIComponent(token)}`;
    }
  }
  if (parsed.origin === window.location.origin) {
    navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    return;
  }
  window.location.assign(parsed.toString());
};

export default function SignInPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loginWithEmail, register, isLoading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const nextUrl = getSafeNextUrl(searchParams.get('next'));
  const registrationOpen = settings?.registrationOpen !== false;
  
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('options');
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (user && !authLoading) {
      if (nextUrl) {
        redirectToNext(navigate, nextUrl);
        return;
      }
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate, nextUrl]);

  // Defensive cleanup: normal sign-in page should never carry network intent.
  useEffect(() => {
    localStorage.removeItem('network_intent');
    localStorage.removeItem('network_onboarding_type');
  }, []);

  // Check for error in URL
  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError) {
      setError(errorMessages[urlError] || 'Authentication failed. Please try again.');
    }
  }, [searchParams]);

  // Fetch available auth providers
  useEffect(() => {
    api.getProviders()
      .then((data) => {
        setProviders(data);
      })
      .catch(() => {
        // Fallback: show all OAuth options if API fails
        setProviders({ google: true, github: true, devLogin: false, emailPassword: true });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setShowPassword(false);
    setAuthMode(location.pathname === '/signup' ? 'register' : 'options');
  }, [location.pathname]);

  const handleGoogleSignIn = () => {
    setError(null);
    localStorage.removeItem('network_intent');
    localStorage.removeItem('network_onboarding_type');
    if (nextUrl) {
      sessionStorage.setItem('post_login_next', nextUrl);
    } else {
      sessionStorage.removeItem('post_login_next');
    }
    window.location.href = `${API_URL}/auth/google`;
  };

  const handleGithubSignIn = () => {
    setError(null);
    localStorage.removeItem('network_intent');
    localStorage.removeItem('network_onboarding_type');
    if (nextUrl) {
      sessionStorage.setItem('post_login_next', nextUrl);
    } else {
      sessionStorage.removeItem('post_login_next');
    }
    window.location.href = `${API_URL}/auth/github`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    
    setFormLoading(true);
    setError(null);
    
    try {
      await loginWithEmail(email.trim(), password);

      if (nextUrl) {
        sessionStorage.removeItem('post_login_next');
        redirectToNext(navigate, nextUrl);
        return;
      }
      
      // Check if user needs to complete profile (especially for pending event registration)
      const pendingEventId = localStorage.getItem('pendingEventRegistration');
      const pendingEventType = localStorage.getItem('pendingEventRegistrationType');
      const normalizedPendingType: 'solo' | 'team' = pendingEventType === 'team' ? 'team' : 'solo';
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          const userData = await api.getProfile(token);
          // If academic details are incomplete, redirect to profile
          if (!userData.phone || !userData.course || !userData.branch || !userData.year) {
            navigate('/dashboard/profile', { state: { pendingEventId } });
            return;
          }
          
          // If profile is complete and an event is pending, continue registration on event detail page
          if (pendingEventId) {
            localStorage.removeItem('pendingEventRegistration');
            localStorage.removeItem('pendingEventRegistrationType');
            navigate(getPendingEventRedirectPath(pendingEventId, normalizedPendingType));
            return;
          }
        } catch {
          // Couldn't check profile, just go to dashboard
        }
      }
      
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setFormLoading(true);
    setError(null);
    
    try {
      await register(name.trim(), email.trim(), password);

      if (nextUrl) {
        sessionStorage.removeItem('post_login_next');
        redirectToNext(navigate, nextUrl);
        return;
      }
      
      // New user registration always means incomplete profile
      // Redirect to profile page to complete academic details
      const pendingEventId = localStorage.getItem('pendingEventRegistration');
      if (pendingEventId) {
        // If there's a pending event, must complete profile first
        navigate('/dashboard/profile', { state: { pendingEventId } });
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const switchMode = (mode: AuthMode) => {
    resetForm();
    setAuthMode(mode);
  };

  if (loading || authLoading) {
    return (
      <Layout>
        <section className="min-h-[80vh] flex items-center justify-center py-20 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-amber-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO 
        title="Sign In"
        description="Sign in to your code.scriet account to access events, announcements, and member features."
        url="/signin"
        noIndex={true}
      />
      <section className="min-h-[80vh] flex items-center justify-center py-20 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-md mx-auto"
          >
            <Card className="shadow-2xl border-amber-200/50 backdrop-blur-sm bg-white/90">
              <CardHeader className="text-center pb-2">
                <Link to="/" className="inline-block mx-auto mb-4">
                  <img src="/logo.jpeg" alt="code.scriet" className="h-16 w-16 rounded-lg object-cover" />
                </Link>
                <CardTitle className="text-2xl text-amber-900">
                  {authMode === 'options' && 'Welcome to code.scriet'}
                  {authMode === 'login' && 'Sign In'}
                  {authMode === 'register' && 'Create Account'}
                </CardTitle>
                <CardDescription>
                  {authMode === 'options' && 'Join our community of problem solvers'}
                  {authMode === 'login' && 'Sign in to access your dashboard'}
                  {authMode === 'register' && 'Create your account to get started'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {/* Error Alert */}
                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -10, height: 0 }}
                      className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
                    >
                      <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <p className="text-sm">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {/* Options View - OAuth + Email choices */}
                  {authMode === 'options' && (
                    <motion.div
                      key="options"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      {/* OAuth Buttons */}
                      {providers?.google && (
                        <Button
                          onClick={handleGoogleSignIn}
                          variant="outline"
                          className="w-full h-12 text-base font-medium hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all"
                        >
                          <Chrome className="h-5 w-5 mr-3 text-red-500" />
                          Continue with Google
                        </Button>
                      )}
                      
                      {providers?.github && (
                        <Button
                          onClick={handleGithubSignIn}
                          variant="outline"
                          className="w-full h-12 text-base font-medium hover:bg-gray-100 hover:border-gray-300 transition-all"
                        >
                          <Github className="h-5 w-5 mr-3" />
                          Continue with GitHub
                        </Button>
                      )}

                      {(providers?.google || providers?.github) && (
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-amber-200"></div>
                          </div>
                          <div className="relative flex justify-center text-sm">
                            <span className="bg-white/90 px-4 text-gray-500">or continue with email</span>
                          </div>
                        </div>
                      )}

                      {/* Email/Password Options */}
                      <Button
                        onClick={() => switchMode('login')}
                        className="w-full h-12 text-base font-medium bg-amber-600 hover:bg-amber-700"
                      >
                        <Mail className="h-5 w-5 mr-3" />
                        Sign in with Email
                      </Button>

                      <Button
                        onClick={() => switchMode('register')}
                        variant="outline"
                        className="w-full h-12 text-base font-medium border-amber-300 hover:bg-amber-50"
                        disabled={settingsLoading}
                      >
                        <User className="h-5 w-5 mr-3" />
                        {registrationOpen ? 'Create new account' : 'Registration Closed'}
                      </Button>
                      {!settingsLoading && !registrationOpen && (
                        <p className="text-center text-sm text-amber-700">
                          Registration is currently closed. Use an existing account or contact the club admins.
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* Login Form */}
                  {authMode === 'login' && (
                    <motion.form
                      key="login"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                      onSubmit={handleLogin}
                      className="space-y-4"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => switchMode('options')}
                        className="mb-2 -ml-2 text-gray-600 hover:text-amber-700"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back
                      </Button>

                      <div className="space-y-2">
                        <label htmlFor="signin-email" className="text-sm font-medium text-gray-700">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
                            id="signin-email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pl-10 h-12"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="signin-password" className="text-sm font-medium text-gray-700">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
                            id="signin-password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-10 pr-10 h-12"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>

                      <Button 
                        type="submit" 
                        className="w-full h-12 text-base bg-amber-600 hover:bg-amber-700"
                        disabled={formLoading}
                      >
                        {formLoading ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          'Sign In'
                        )}
                      </Button>

                      <p className="text-center text-sm text-gray-600">
                        Don't have an account?{' '}
                        <button
                          type="button"
                          onClick={() => switchMode('register')}
                          className="text-amber-600 hover:text-amber-700 font-medium hover:underline"
                        >
                          Sign up
                        </button>
                      </p>
                    </motion.form>
                  )}

                  {/* Register Form */}
                  {authMode === 'register' && (
                    <motion.form
                      key="register"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                      onSubmit={handleRegister}
                      className="space-y-4"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => switchMode('options')}
                        className="mb-2 -ml-2 text-gray-600 hover:text-amber-700"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back
                      </Button>

                      {!registrationOpen ? (
                        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
                          <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-amber-900">Registration is currently closed</h3>
                            <p className="text-sm text-amber-800">
                              New account creation is disabled right now. Use an existing account or check back later.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => switchMode('login')}
                          >
                            Go to Sign In
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <label htmlFor="signup-name" className="text-sm font-medium text-gray-700">Full Name</label>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                              <Input
                                id="signup-name"
                                type="text"
                                placeholder="John Doe"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="pl-10 h-12"
                                required
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label htmlFor="signup-email" className="text-sm font-medium text-gray-700">Email</label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                              <Input
                                id="signup-email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="pl-10 h-12"
                                required
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label htmlFor="signup-password" className="text-sm font-medium text-gray-700">Password</label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                              <Input
                                id="signup-password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="At least 6 characters"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pl-10 pr-10 h-12"
                                required
                                minLength={6}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                              >
                                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label htmlFor="signup-confirm-password" className="text-sm font-medium text-gray-700">Confirm Password</label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                              <Input
                                id="signup-confirm-password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Confirm your password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="pl-10 h-12"
                                required
                              />
                            </div>
                          </div>

                          <Button 
                            type="submit" 
                            className="w-full h-12 text-base bg-amber-600 hover:bg-amber-700"
                            disabled={formLoading}
                          >
                            {formLoading ? (
                              <>
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                Creating account...
                              </>
                            ) : (
                              'Create Account'
                            )}
                          </Button>

                          <p className="text-center text-sm text-gray-600">
                            Already have an account?{' '}
                            <button
                              type="button"
                              onClick={() => switchMode('login')}
                              className="text-amber-600 hover:text-amber-700 font-medium hover:underline"
                            >
                              Sign in
                            </button>
                          </p>
                        </>
                      )}
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Footer */}
                <div className="pt-4 border-t border-amber-100">
                  <p className="text-center text-xs text-gray-500">
                    By signing in or creating an account, you accept our{' '}
                    <Link to="/privacy-policy" className="text-amber-600 hover:underline">Privacy Policy</Link>
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
