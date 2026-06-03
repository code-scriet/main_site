import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { useSettings } from '@/context/SettingsContext';
import { Mail, MapPin, Phone, MessageCircle, Clock, Github, Linkedin, Instagram, ArrowUpRight } from 'lucide-react';
import { DiscordIcon, WhatsAppIcon, XIcon } from '@/components/icons/SocialIcons';
import type { ContactEmail } from '@/lib/api';

// Strip everything but digits for tel:/wa.me links while keeping the
// human-friendly formatting for display.
function phoneDigits(raw: string): string {
  return raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
}

export default function ContactPage() {
  const { settings } = useSettings();

  const primaryEmail = settings?.clubEmail || 'contact@codescriet.dev';
  const extraEmails: ContactEmail[] = (settings?.contactEmails ?? []).filter(
    (e) => e?.email?.trim(),
  );

  // Primary club email always leads, followed by any admin-added departmental inboxes.
  const emailRows: ContactEmail[] = [
    { label: 'General enquiries', email: primaryEmail },
    ...extraEmails,
  ];

  const phone = settings?.contactPhone?.trim() || '';
  const phoneTel = phone ? phoneDigits(phone) : '';

  // Every entry is gated on a real URL in Settings — no dead `#` placeholders.
  const socialLinks = [
    settings?.githubUrl && { name: 'GitHub', icon: Github, href: settings.githubUrl },
    settings?.linkedinUrl && { name: 'LinkedIn', icon: Linkedin, href: settings.linkedinUrl },
    settings?.discordUrl && { name: 'Discord', icon: DiscordIcon, href: settings.discordUrl },
    settings?.instagramUrl && { name: 'Instagram', icon: Instagram, href: settings.instagramUrl },
    settings?.twitterUrl && { name: 'X', icon: XIcon, href: settings.twitterUrl },
    settings?.whatsappUrl && { name: 'WhatsApp', icon: WhatsAppIcon, href: settings.whatsappUrl },
  ].filter(Boolean) as { name: string; icon: React.ComponentType<{ className?: string }>; href: string }[];

  const locationLabel = 'SCRIET, Chaudhary Charan Singh University, Meerut, Uttar Pradesh, India';
  const mapQuery = encodeURIComponent('SCRIET CCS University Meerut');

  return (
    <Layout>
      <SEO
        title="Contact"
        description="Get in touch with codescriet, the official coding club of SCRIET, CCS University Meerut. Reach us by email, phone, WhatsApp or social media."
        url="/contact"
      />
      <section className="bg-amber-50 min-h-screen">
        {/* Hero */}
        <div className="bg-gradient-to-br from-amber-100 via-amber-50 to-orange-50 border-b border-amber-100">
          <div className="container mx-auto px-4 py-14 sm:py-20 max-w-5xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700 border border-amber-200">
              <MessageCircle className="h-3.5 w-3.5" />
              Contact us
            </span>
            <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-amber-900 tracking-tight">
              Let&apos;s talk.
            </h1>
            <p className="mt-3 max-w-2xl text-base sm:text-lg text-amber-800/80">
              Questions, collaborations, sponsorships or just saying hi — pick whichever
              channel suits you best. We usually reply within a day or two.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12 sm:py-16 max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Left column — reach-us methods */}
            <div className="lg:col-span-3 space-y-6">
              {/* Email */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-amber-900 leading-tight">Email</h2>
                    <p className="text-sm text-gray-500">Best for detailed or formal queries.</p>
                  </div>
                </div>
                <ul className="divide-y divide-amber-50">
                  {emailRows.map((row, i) => (
                    <li key={`${row.email}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm font-medium text-gray-600">{row.label}</span>
                      <a
                        href={`mailto:${row.email}`}
                        className="group inline-flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700 hover:underline break-all text-right"
                      >
                        {row.email}
                        <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Phone / WhatsApp — only when an admin has set a number */}
              {phone && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                      <Phone className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-amber-900 leading-tight">Call or message</h2>
                      <p className="text-sm text-gray-500">Quick questions during the day.</p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-amber-900 tracking-tight mb-4">{phone}</p>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={`tel:${phoneTel}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
                    >
                      <Phone className="h-4 w-4" />
                      Call now
                    </a>
                    <a
                      href={`https://wa.me/${phoneTel}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors border border-emerald-200"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                      WhatsApp
                    </a>
                  </div>
                </div>
              )}

              {/* Social */}
              {socialLinks.length > 0 && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                      <MessageCircle className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-amber-900 leading-tight">Follow &amp; DM us</h2>
                      <p className="text-sm text-gray-500">Updates, events and the fastest replies.</p>
                    </div>
                  </div>
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

            {/* Right column — where to find us */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
                <div className="aspect-[4/3] w-full bg-amber-100">
                  <iframe
                    title="codescriet location map"
                    src={`https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                    className="h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-amber-900 leading-tight">Visit us</h2>
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    SCRIET, Chaudhary Charan Singh University<br />
                    Meerut, Uttar Pradesh, India
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open directions to ${locationLabel}`}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700 hover:underline"
                  >
                    Get directions
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5 text-white" />
                  </div>
                  <h2 className="text-lg font-semibold text-amber-900 leading-tight">Response time</h2>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  We're students too, so email and DMs are typically answered within
                  <span className="font-medium text-amber-800"> 24–48 hours</span>. For anything
                  urgent, WhatsApp or social DMs are quickest.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
