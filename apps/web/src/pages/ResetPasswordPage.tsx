import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, AlertCircle, Loader2, Eye, EyeOff, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Two modes behind one page:
 *  - /forgot-password (no token in URL): ask for the account email and trigger
 *    the self-service reset mail. Response is always neutral.
 *  - /reset-password?token=…&email=…: consume the link (self-service or
 *    admin-initiated) and set a new password.
 */
const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get('token') || '';
  const urlEmail = searchParams.get('email') || '';
  const consumeMode = useMemo(() => urlToken.length > 0 && urlEmail.length > 0, [urlToken, urlEmail]);

  const [email, setEmail] = useState(urlEmail);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.requestPasswordReset(email.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword.length > 72) {
      setError('Password must be at most 72 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(urlEmail, urlToken, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed. Please request a new link.');
    } finally {
      setLoading(false);
    }
  };

  const title = consumeMode ? 'Set a new password' : 'Forgot password';

  return (
    <Layout>
      <SEO
        title={title}
        description="Reset your code.scriet account password."
        url={consumeMode ? '/reset-password' : '/forgot-password'}
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
                <CardTitle className="text-2xl text-amber-900">{title}</CardTitle>
                <CardDescription>
                  {consumeMode
                    ? `Choose a new password for ${urlEmail}`
                    : 'Enter your account email and we will send you a reset link'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                      role="alert"
                    >
                      <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {done ? (
                  <div className="space-y-4 text-center py-2">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
                    {consumeMode ? (
                      <>
                        <p className="text-gray-700">
                          Your password has been updated. Sign in with your new password.
                        </p>
                        <Button asChild className="w-full h-12 text-base bg-amber-600 hover:bg-amber-700">
                          <Link to="/signin">Sign In</Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-gray-700">
                          If an account exists for <span className="font-medium">{email.trim()}</span>, a reset
                          link is on its way. Check your inbox (and spam folder) — the link expires in 30 minutes.
                        </p>
                        <Button asChild variant="outline" className="w-full h-12 text-base border-amber-300 hover:bg-amber-50">
                          <Link to="/signin">Back to sign in</Link>
                        </Button>
                      </>
                    )}
                  </div>
                ) : consumeMode ? (
                  <form onSubmit={handleReset} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="reset-password" className="text-sm font-medium text-gray-700">New password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          id="reset-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="pl-10 pr-10 h-12"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={72}
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
                      <p className="text-xs text-gray-500">At least 8 characters.</p>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="reset-password-confirm" className="text-sm font-medium text-gray-700">Confirm new password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          id="reset-password-confirm"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pl-10 h-12"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={72}
                          required
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 text-base bg-amber-600 hover:bg-amber-700"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Updating password...
                        </>
                      ) : (
                        'Update password'
                      )}
                    </Button>

                    <p className="text-center text-sm text-gray-600">
                      Link expired?{' '}
                      <Link to="/forgot-password" className="text-amber-600 hover:text-amber-700 font-medium hover:underline">
                        Request a new one
                      </Link>
                    </p>
                  </form>
                ) : (
                  <form onSubmit={handleRequest} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="forgot-email" className="text-sm font-medium text-gray-700">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          id="forgot-email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10 h-12"
                          autoComplete="email"
                          required
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 text-base bg-amber-600 hover:bg-amber-700"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Sending link...
                        </>
                      ) : (
                        'Send reset link'
                      )}
                    </Button>

                    <p className="text-center text-sm text-gray-600">
                      <Link to="/signin" className="inline-flex items-center text-amber-600 hover:text-amber-700 font-medium hover:underline">
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back to sign in
                      </Link>
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
};

export default ResetPasswordPage;
