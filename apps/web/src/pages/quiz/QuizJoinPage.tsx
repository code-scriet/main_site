/**
 * QuizJoinPage — Premium PIN entry page matching the site's auth page design.
 * Full-height centered layout, site logo, OTP-style 6-digit input.
 * Mobile-first, 375px minimum width tested.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Zap, ArrowLeft, AlertCircle } from 'lucide-react';
import { cn, getApiBaseUrl } from '@/lib/utils';

const shakeKeyframes = {
  x: [0, -4, 4, -4, 4, -2, 2, 0],
  transition: { duration: 0.3 },
};

export default function QuizJoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const fullPin = pin.join('');

  useEffect(() => {
    const presetPin = (searchParams.get('pin') || '').replace(/\D/g, '').slice(0, 6);
    if (presetPin.length === 6) {
      setPin(presetPin.split(''));
    }
  }, [searchParams]);

  const handleChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    
    setPin(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setError('');

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!pin[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        setPin(prev => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
      } else {
        setPin(prev => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && fullPin.length === 6) {
      handleJoin();
    }
  }, [pin, fullPin]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newPin = Array(6).fill('');
      for (let i = 0; i < Math.min(pasted.length, 6); i++) {
        newPin[i] = pasted[i];
      }
      setPin(newPin);
      setError('');
      const nextIdx = Math.min(pasted.length, 5);
      inputRefs.current[nextIdx]?.focus();
    }
  }, []);

  const handleJoin = async () => {
    if (fullPin.length !== 6) return;
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/quiz/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ pin: fullPin }),
      });
      const data = await res.json();
      
      if (!data.success) {
        setError(data.error?.message || 'Quiz not found');
        setShake(true);
        setTimeout(() => setShake(false), 350);
        return;
      }
      if (!data.data?.quizAccessToken) {
        setError('Failed to issue secure quiz access token. Please try again.');
        setShake(true);
        setTimeout(() => setShake(false), 350);
        return;
      }

      sessionStorage.setItem(`quiz_access_token_${data.data.quizId}`, data.data.quizAccessToken);
      navigate(`/quiz/${data.data.quizId}`);
    } catch {
      setError('Failed to find quiz. Check your PIN.');
      setShake(true);
      setTimeout(() => setShake(false), 350);
    } finally {
      setLoading(false);
    }
  };

  const presetPin = searchParams.get('pin');

  return (
    <Layout>
      <section className="min-h-[80vh] flex items-center justify-center py-20 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            {/* Back button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/quiz')}
              className="mb-4 -ml-2 text-gray-600 hover:text-amber-700"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Quizzes
            </Button>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="shadow-2xl border-amber-200/50 backdrop-blur-sm bg-white/90">
                <CardContent className="p-6 sm:p-8 space-y-6">
                  {/* Header */}
                  <div className="text-center space-y-3">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.1 }}
                      className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg"
                    >
                      <Zap className="h-8 w-8 text-white" />
                    </motion.div>
                    <h1 className="text-3xl md:text-4xl font-bold text-amber-900 tracking-tight font-display">
                      Join Quiz
                    </h1>
                    <p className="text-gray-600">
                      Enter the 6-digit code from your host
                    </p>
                  </div>

                  {/* PIN Input */}
                  <motion.div
                    className="flex justify-center gap-2 sm:gap-3"
                    onPaste={handlePaste}
                    animate={shake ? shakeKeyframes : {}}
                  >
                    {pin.map((digit, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * i }}
                      >
                        <input
                          ref={(el) => { inputRefs.current[i] = el; }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleChange(i, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(i, e)}
                          className={cn(
                            'w-11 h-14 sm:w-14 sm:h-[4.5rem] text-center text-2xl sm:text-3xl font-bold font-mono rounded-xl',
                            'bg-white border-2 text-gray-800',
                            'focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20',
                            'transition-all duration-200',
                            'placeholder:text-gray-300',
                            i === 2 && 'mr-2 sm:mr-3',
                            error
                              ? 'border-red-300 bg-red-50/50'
                              : digit
                                ? 'border-amber-400 bg-amber-50/50'
                                : 'border-amber-200',
                          )}
                          placeholder="·"
                          autoComplete="off"
                        />
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* Error */}
                  <AnimatePresence>
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

                  {/* Join button */}
                  <Button
                    onClick={handleJoin}
                    disabled={fullPin.length !== 6 || loading}
                    size="lg"
                    className="w-full h-12 text-base font-medium"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      'Join Quiz'
                    )}
                  </Button>

                  {/* QR confirmation or alternative text */}
                  <div className="text-center">
                    {presetPin ? (
                      <p className="text-sm text-green-600 font-medium">
                        ✓ PIN pre-filled from QR code
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">
                        Or ask the host for a direct link
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
