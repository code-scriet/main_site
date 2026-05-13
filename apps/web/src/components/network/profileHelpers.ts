// Shared helpers + lookup tables used by NetworkPage and its extracted cards.

import {
  Award,
  Building2,
  Github,
  Globe,
  GraduationCap,
  Handshake,
  Linkedin,
  MessageSquare,
  Mic,
  Star,
  Twitter,
  Users,
} from 'lucide-react';
import type { NetworkConnectionType, NetworkProfile } from '@/lib/api';

export const connectionTypeLabels: Record<NetworkConnectionType, string> = {
  GUEST_SPEAKER: 'Guest Speaker',
  GMEET_SESSION: 'Session Host',
  EVENT_JUDGE: 'Event Judge',
  MENTOR: 'Mentor',
  INDUSTRY_PARTNER: 'Industry Partner',
  ALUMNI: 'Alumni',
  OTHER: 'Collaborator',
};

export const connectionTypeIcons: Record<NetworkConnectionType, typeof Star> = {
  GUEST_SPEAKER: Mic,
  GMEET_SESSION: MessageSquare,
  EVENT_JUDGE: Award,
  MENTOR: Handshake,
  INDUSTRY_PARTNER: Building2,
  ALUMNI: GraduationCap,
  OTHER: Users,
};

export type SocialLink = {
  icon: typeof Linkedin;
  href: string;
  label: string;
  hoverClass: string;
};

export const profileSocialLinks = (profile: NetworkProfile): SocialLink[] =>
  [
    profile.linkedinUsername
      ? {
          icon: Linkedin,
          href: `https://linkedin.com/in/${profile.linkedinUsername}`,
          label: 'LinkedIn',
          hoverClass: 'hover:bg-[#0077B5] hover:text-white',
        }
      : null,
    profile.twitterUsername
      ? {
          icon: Twitter,
          href: `https://twitter.com/${profile.twitterUsername}`,
          label: 'Twitter',
          hoverClass: 'hover:bg-[#1DA1F2] hover:text-white',
        }
      : null,
    profile.githubUsername
      ? {
          icon: Github,
          href: `https://github.com/${profile.githubUsername}`,
          label: 'GitHub',
          hoverClass: 'hover:bg-slate-900 hover:text-white',
        }
      : null,
    profile.personalWebsite
      ? {
          icon: Globe,
          href: profile.personalWebsite,
          label: 'Website',
          hoverClass: 'hover:bg-emerald-600 hover:text-white',
        }
      : null,
  ].filter(Boolean) as SocialLink[];

export const profileUrlFor = (profile: NetworkProfile) =>
  `/network/${profile.slug || profile.id}`;

export const profilePhotoFor = (profile: NetworkProfile) =>
  profile.profilePhoto || '/fallback-avatar.svg';
