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

// WhatsApp icon component (not in lucide-react)
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488" />
    </svg>
  );
}

export function Footer() {
  const { settings } = useSettings();
  
  const quickLinks = [
    { name: 'About', href: '/about' },
    { name: 'Events', href: '/events' },
    { name: 'Announcements', href: '/announcements' },
    { name: 'Team', href: '/team' },
    { name: 'Achievements', href: '/achievements' },
    { name: 'Network', href: '/network' },
    { name: 'Contact', href: '/contact' },
    { name: 'Privacy Policy', href: '/privacy-policy' },
    { name: 'Credits', href: '/credits' },
  ];

  // Build social links from settings
  const socialLinks = [
    settings?.githubUrl && { name: 'GitHub', icon: Github, href: settings.githubUrl },
    settings?.linkedinUrl && { name: 'LinkedIn', icon: Linkedin, href: settings.linkedinUrl },
    settings?.twitterUrl && { name: 'Twitter', icon: Twitter, href: settings.twitterUrl },
    settings?.instagramUrl && { name: 'Instagram', icon: Instagram, href: settings.instagramUrl },
    settings?.discordUrl && { name: 'Discord', icon: DiscordIcon, href: settings.discordUrl },
    settings?.whatsappUrl && { name: 'WhatsApp', icon: WhatsAppIcon, href: settings.whatsappUrl },
    // Always show email link using clubEmail from settings
    { name: 'Email', icon: Mail, href: `mailto:${settings?.clubEmail || 'contact@codescriet.com'}` },
  ].filter(Boolean) as { name: string; icon: React.ComponentType<{ className?: string }>; href: string }[];

  return (
    <footer className="bg-amber-950 text-amber-50 safe-area-pb dark:border-t dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
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
            <p className="text-amber-200 text-xs sm:text-sm dark:text-zinc-400">
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
                    className="text-amber-200 hover:text-amber-400 transition-colors duration-200 text-sm dark:text-zinc-400 dark:hover:text-amber-300"
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
                    className="p-2 rounded-lg bg-amber-900 hover:bg-amber-800 transition-colors duration-200 touch-target dark:bg-zinc-900 dark:hover:bg-zinc-800"
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
        <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-amber-900 text-center text-amber-200 text-xs sm:text-sm dark:border-zinc-800 dark:text-zinc-400">
          <p>&copy; {new Date().getFullYear()} {settings?.clubName || 'code.scriet'}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
