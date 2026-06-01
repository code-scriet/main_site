import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { useSettings } from '@/context/SettingsContext';
import { Mail, MapPin, Github, Linkedin, Instagram } from 'lucide-react';
import { DiscordIcon, WhatsAppIcon, XIcon } from '@/components/icons/SocialIcons';

export default function ContactPage() {
  const { settings } = useSettings();

  // Every entry is gated on a real URL in Settings — no dead `#` placeholders.
  // X (Twitter) and Discord both pull from `settings.twitterUrl` / `settings.discordUrl`
  // and disappear from the Follow Us strip when those are blank.
  const socialLinks = [
    settings?.githubUrl && { name: 'GitHub', icon: Github, href: settings.githubUrl },
    settings?.linkedinUrl && { name: 'LinkedIn', icon: Linkedin, href: settings.linkedinUrl },
    settings?.discordUrl && { name: 'Discord', icon: DiscordIcon, href: settings.discordUrl },
    settings?.instagramUrl && { name: 'Instagram', icon: Instagram, href: settings.instagramUrl },
    settings?.twitterUrl && { name: 'X', icon: XIcon, href: settings.twitterUrl },
    settings?.whatsappUrl && { name: 'WhatsApp', icon: WhatsAppIcon, href: settings.whatsappUrl },
  ].filter(Boolean) as { name: string; icon: React.ComponentType<{ className?: string }>; href: string }[];

  return (
    <Layout>
      <SEO
        title="Contact"
        description="Get in touch with codescriet, the official coding club of SCRIET, CCS University Meerut."
        url="/contact"
      />
      <section className="py-14 sm:py-20 bg-amber-50 min-h-screen">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 mb-8">Contact Us</h1>

          <div className="space-y-8">
            {/* Email */}
            <div className="flex items-start gap-4 bg-white rounded-xl p-6 shadow-sm border border-amber-100">
              <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-amber-900 mb-1">Email</h2>
                <p className="text-gray-600 mb-2">Reach out to us for any queries, collaborations, or feedback.</p>
                <a
                  href={`mailto:${settings?.clubEmail || 'contact@codescriet.dev'}`}
                  className="text-amber-600 hover:underline font-medium"
                >
                  {settings?.clubEmail || 'contact@codescriet.dev'}
                </a>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-4 bg-white rounded-xl p-6 shadow-sm border border-amber-100">
              <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-amber-900 mb-1">Location</h2>
                <p className="text-gray-600">
                  SCRIET, Chaudhary Charan Singh University<br />
                  Meerut, Uttar Pradesh, India
                </p>
              </div>
            </div>

            {/* Social Media */}
            {socialLinks.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-amber-100">
                <h2 className="text-lg font-semibold text-amber-900 mb-4">Follow Us</h2>
                <div className="flex flex-wrap gap-3">
                  {socialLinks.map((social) => {
                    const Icon = social.icon;
                    return (
                      <a
                        key={social.name}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{social.name}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
