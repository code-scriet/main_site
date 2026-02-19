import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const errorMessages: Record<string, string> = {
  google_not_configured: 'Google Sign-In is not configured yet. Please use another method.',
  github_not_configured: 'GitHub Sign-In is not configured yet. Please use another method.',
  google_auth_failed: 'Google authentication failed. Please try again.',
  github_auth_failed: 'GitHub authentication failed. Please try again.',
};

type AuthMode = 'options' | 'login' | 'register';

export default function SignInPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loginWithEmail, register, isLoading: authLoading } = useAuth();
  
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
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate]);

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
        console.log('Providers fetched:', data);
        setProviders(data);
      })
      .catch((err) => {
        console.error('Failed to fetch providers:', err);
        // Fallback: show all OAuth options if API fails
        setProviders({ google: true, github: true, devLogin: false, emailPassword: true });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleGoogleSignIn = () => {
    setError(null);
    localStorage.removeItem('network_intent');
    localStorage.removeItem('network_onboarding_type');
    window.location.href = `${API_URL}/auth/google`;
  };

  const handleGithubSignIn = () => {
    setError(null);
    localStorage.removeItem('network_intent');
    localStorage.removeItem('network_onboarding_type');
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
      
      // Check if user needs to complete profile (especially for pending event registration)
      const pendingEventId = localStorage.getItem('pendingEventRegistration');
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
            navigate(`/events/${pendingEventId}?register=1`);
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
                      >
                        <User className="h-5 w-5 mr-3" />
                        Create new account
                      </Button>
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
                        <label className="text-sm font-medium text-gray-700">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
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
                        <label className="text-sm font-medium text-gray-700">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
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

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
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
                        <label className="text-sm font-medium text-gray-700">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
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
                        <label className="text-sm font-medium text-gray-700">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
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
                          >
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Confirm Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
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
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Footer */}
                <div className="pt-4 border-t border-amber-100">
                  <p className="text-center text-xs text-gray-500">
                    By continuing, you agree to our{' '}
                    <a href="#" className="text-amber-600 hover:underline">Terms of Service</a>
                    {' '}and{' '}
                    <a href="#" className="text-amber-600 hover:underline">Privacy Policy</a>
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
