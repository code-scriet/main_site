import { Link } from 'react-router-dom';
import { Github, Instagram, Linkedin } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { DiscordIcon, XIcon } from '@/components/icons/SocialIcons';
import { Wordmark } from './Wordmark';

export function Footer() {
  const { settings } = useSettings();

  const tag =
    settings?.clubDescription ||
    'A coding community at SCRIET, CCS University Meerut. Founded 1 January 2026.';
  const clubEmail = settings?.clubEmail || 'contact@codescriet.dev';
  const year = new Date().getFullYear();

  // Order mirrors the design bundle's footer (lib/layout.jsx Footer): GitHub →
  // LinkedIn → Discord → Instagram → X. Each icon is gated on a real URL —
  // empty settings drop the icon rather than rendering a dead `#` link.
  const socials = [
    settings?.githubUrl && { key: 'github', label: 'GitHub', href: settings.githubUrl, Icon: Github },
    settings?.linkedinUrl && { key: 'linkedin', label: 'LinkedIn', href: settings.linkedinUrl, Icon: Linkedin },
    settings?.discordUrl && { key: 'discord', label: 'Discord', href: settings.discordUrl, Icon: DiscordIcon },
    settings?.instagramUrl && { key: 'instagram', label: 'Instagram', href: settings.instagramUrl, Icon: Instagram },
    settings?.twitterUrl && { key: 'twitter', label: 'X', href: settings.twitterUrl, Icon: XIcon },
  ].filter(Boolean) as Array<{ key: string; label: string; href: string; Icon: React.ComponentType<{ size?: number }> }>;

  return (
    <footer className="pub-site-footer">
      <div className="pub-container">
        <div className="pub-site-footer-top">
          <div>
            <Wordmark size="md" />
            <p className="pub-site-footer-tag">{tag}</p>
            <div className="pub-site-footer-social">
              {socials.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  aria-label={label}
                  title={label}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>
          <div className="pub-site-footer-cols">
            <div>
              <h4 className="pub-site-footer-h4">Sitemap</h4>
              <ul className="pub-site-footer-list">
                <li><Link to="/about">About</Link></li>
                <li><Link to="/events">Events</Link></li>
                <li><Link to="/team">Team</Link></li>
                <li><Link to="/achievements">Achievements</Link></li>
                <li><Link to="/announcements">Announcements</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="pub-site-footer-h4">Community</h4>
              <ul className="pub-site-footer-list">
                {settings?.showNetwork !== false && <li><Link to="/network">Network</Link></li>}
                {settings?.hiringEnabled !== false && <li><Link to="/join-us">Join us</Link></li>}
                <li><Link to="/verify">Verify certificate</Link></li>
                <li><Link to="/credits">Credits</Link></li>
                <li><Link to="/signin">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="pub-site-footer-h4">Contact</h4>
              <ul className="pub-site-footer-list">
                <li><a href={`mailto:${clubEmail}`}>{clubEmail}</a></li>
                <li className="pub-site-footer-address">SCRIET, CCS University<br />Meerut, Uttar Pradesh, India</li>
                <li><Link to="/contact">Contact form</Link></li>
                <li><Link to="/privacy-policy">Privacy</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="pub-site-footer-bottom">
          <span className="pub-mono">© {year} code.scriet · SCRIET, CCS University Meerut</span>
          <span className="pub-site-footer-status pub-mono">
            <span className="pub-live-dot" /> all systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
