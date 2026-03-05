import { useAuth, getLoginUrl } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Code2, ExternalLink, LogOut, User, FolderCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const MAIN_SITE_URL =
  import.meta.env.VITE_MAIN_SITE_URL ||
  (import.meta.env.DEV ? 'http://localhost:5173' : 'https://codescriet.dev');

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <header className={cn(
      'h-12 border-b border-border flex items-center justify-between px-4 shrink-0 transition-colors',
      isDark ? 'bg-card/60 backdrop-blur-sm' : 'bg-white/80 backdrop-blur-sm shadow-sm'
    )}>
      {/* Left: Logo */}
      <div className="flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:shadow-amber-500/20 transition-shadow">
            <Code2 className="h-4 w-4 text-white" />
          </div>
          <span className="font-display font-bold text-base bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
            Code.Scriet
          </span>
          <span className={cn(
            'text-xs font-medium px-1.5 py-0.5 rounded',
            isDark
              ? 'text-muted-foreground bg-secondary/60'
              : 'text-amber-700 bg-amber-100/70'
          )}>
            Playground
          </span>
        </Link>
      </div>

      {/* Right: Nav links + user */}
      <div className="flex items-center gap-3">
        <Link
          to="/snippets"
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <FolderCode className="h-3.5 w-3.5" />
          Snippets
        </Link>

        <a
          href={MAIN_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Main Site
        </a>

        <div className="h-5 w-px bg-border" />

        {isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            {/* Avatar */}
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-6 h-6 rounded-full ring-1 ring-border"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-[10px] font-bold text-white">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <span className="text-xs font-medium hidden sm:block max-w-[100px] truncate">
              {user.name}
            </span>
            <Button
              onClick={logout}
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            asChild
            size="sm"
            className="h-7 text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
          >
            <a href={getLoginUrl()}>
              <User className="h-3 w-3 mr-1" />
              Sign in
            </a>
          </Button>
        )}
      </div>
    </header>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
