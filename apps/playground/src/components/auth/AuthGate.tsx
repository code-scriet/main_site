import { useAuth, getLoginUrl, getPlaygroundReturnUrl, getRegisterUrl, shouldAutoRedirectToLogin } from '@/context/AuthContext';
import { Lock, ArrowRight, UserPlus, Loader2, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    if (!shouldAutoRedirectToLogin()) return;
    window.location.assign(getLoginUrl(getPlaygroundReturnUrl()));
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
          <p className="text-muted-foreground text-sm">Loading playground...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-background relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[128px]" />
        </div>

        <div className="relative z-10 max-w-md w-full mx-auto px-6">
          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm p-8 shadow-xl text-center space-y-6">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Lock className="h-7 w-7 text-white" />
            </div>

            {/* Title */}
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Code2 className="h-5 w-5 text-amber-500" />
                <h1 className="text-xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                  Code.Scriet Playground
                </h1>
              </div>
              <p className="text-muted-foreground text-sm">
                Sign in to your Code.Scriet account to start coding
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                asChild
                className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                <a href={getLoginUrl(getPlaygroundReturnUrl())}>
                  <ArrowRight className="h-4 w-4" />
                  Sign in to Code.Scriet
                </a>
              </Button>

              <Button asChild variant="outline" className="w-full gap-2">
                <a href={getRegisterUrl(getPlaygroundReturnUrl())}>
                  <UserPlus className="h-4 w-4" />
                  Create free account
                </a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Run code in 6+ languages · Save snippets · Track progress
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
