import { Link } from 'react-router-dom';
import { Github, Linkedin, Twitter, Mail, Instagram } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';

// Discord icon component (not in lucide-react)
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function Footer() {
  const { settings } = useSettings();
  
  const quickLinks = [
    { name: 'About', href: '/about' },
    { name: 'Events', href: '/events' },
    { name: 'Team', href: '/team' },
    { name: 'Achievements', href: '/achievements' },
  ];

  // Build social links from settings
  const socialLinks = [
    settings?.githubUrl && { name: 'GitHub', icon: Github, href: settings.githubUrl },
    settings?.linkedinUrl && { name: 'LinkedIn', icon: Linkedin, href: settings.linkedinUrl },
    settings?.twitterUrl && { name: 'Twitter', icon: Twitter, href: settings.twitterUrl },
    settings?.instagramUrl && { name: 'Instagram', icon: Instagram, href: settings.instagramUrl },
    settings?.discordUrl && { name: 'Discord', icon: DiscordIcon, href: settings.discordUrl },
    // Always show email link using clubEmail from settings
    { name: 'Email', icon: Mail, href: `mailto:${settings?.clubEmail || 'contact@codescriet.com'}` },
  ].filter(Boolean) as { name: string; icon: React.ComponentType<{ className?: string }>; href: string }[];

  return (
    <footer className="bg-amber-950 text-amber-50 safe-area-pb">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Logo & Description */}
          <div className="space-y-3 sm:space-y-4 col-span-2 sm:col-span-2 md:col-span-1">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <span className="text-xl sm:text-2xl font-bold text-white">CS</span>
              </div>
              <span className="text-lg sm:text-xl font-bold">{settings?.clubName || 'code.scriet'}</span>
            </div>
            <p className="text-amber-200 text-xs sm:text-sm">
              {settings?.clubDescription || 'Building tomorrow\'s problem solvers through collaborative learning and hands-on coding experiences.'}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Quick Links</h3>
            <ul className="space-y-1.5 sm:space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-amber-200 hover:text-amber-400 transition-colors duration-200 text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Connect</h3>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target={social.name === 'Email' ? undefined : '_blank'}
                    rel={social.name === 'Email' ? undefined : 'noopener noreferrer'}
                    className="p-2 rounded-lg bg-amber-900 hover:bg-amber-800 transition-colors duration-200 touch-target"
                    aria-label={social.name}
                    title={social.name}
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-amber-900 text-center text-amber-200 text-xs sm:text-sm">
          <p>&copy; {new Date().getFullYear()} {settings?.clubName || 'code.scriet'}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
