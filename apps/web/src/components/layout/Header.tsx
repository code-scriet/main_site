import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'About', href: '/about' },
    { name: 'Events', href: '/events' },
    { name: 'Announcements', href: '/announcements' },
    { name: 'Team', href: '/team' },
    { name: 'Achievements', href: '/achievements' },
    // Playground link - conditionally shown based on settings
    ...(settings?.playgroundEnabled !== false ? [{ name: 'Playground', href: import.meta.env.DEV ? 'http://localhost:5174' : 'https://playground.codescriet.dev', external: true }] : []),
    // Network link - conditionally shown based on settings
    ...(settings?.showNetwork !== false ? [{ name: 'Network', href: '/network' }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-amber-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="h-12 w-12 rounded-lg overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
              <img src="/logo.jpeg" alt="code.scriet" className="h-full w-full object-cover" />
            </div>
            <span className="text-xl font-bold text-amber-900 group-hover:text-amber-700 transition-colors">code.scriet</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navigation.map((item) => (
              item.external ? (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-700 hover:text-amber-600 transition-colors duration-200 font-medium"
                >
                  {item.name}
                </a>
              ) : (
                <Link
                  key={item.name}
                  to={item.href}
                  className="text-gray-700 hover:text-amber-600 transition-colors duration-200 font-medium"
                >
                  {item.name}
                </Link>
              )
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {user ? (
              <>
                <Link to="/dashboard">
                  <Button variant="outline" size="sm">
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={logout}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/signin">
                  <Button variant="outline" size="sm">
                    Sign In
                  </Button>
                </Link>
                {!settingsLoading && settings?.hiringEnabled === true && (
                  <Link to="/join-us">
                    <Button size="sm">
                      Join Us
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2.5 rounded-lg hover:bg-amber-50 active:bg-amber-100 transition-colors touch-target"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMenuOpen ? (
              <X className="h-6 w-6 text-gray-700" />
            ) : (
              <Menu className="h-6 w-6 text-gray-700" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 pb-4 space-y-3">
            {navigation.map((item) => (
              item.external ? (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-2.5 px-3 text-gray-700 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors duration-200 font-medium"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.name}
                </a>
              ) : (
                <Link
                  key={item.name}
                  to={item.href}
                  className="block py-2.5 px-3 text-gray-700 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors duration-200 font-medium"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.name}
                </Link>
              )
            ))}
            <div className="flex flex-col gap-2 pt-4 mt-2 border-t border-amber-200">
              {user ? (
                <>
                  <Link to="/dashboard" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Dashboard
                    </Button>
                  </Link>
                  <Button variant="ghost" className="w-full" onClick={() => { logout(); setIsMenuOpen(false); }}>
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/signin" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Sign In
                    </Button>
                  </Link>
                  {!settingsLoading && settings?.hiringEnabled === true && (
                    <Link to="/join-us" onClick={() => setIsMenuOpen(false)}>
                      <Button className="w-full">
                        Join Us
                      </Button>
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
