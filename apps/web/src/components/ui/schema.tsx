/**
 * JSON-LD Schema Markup components for structured data
 * Helps Google understand your content better for rich results
 */

interface SchemaMarkupProps {
  schema: object;
}

/**
 * Generic Schema component that injects JSON-LD script tag
 * Used internally by specific schema components
 */
export function SchemaMarkup({ schema }: SchemaMarkupProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema),
      }}
    />
  );
}

/**
 * Organization schema for homepage
 * Helps Google understand your organization's basic info
 */
export function OrganizationSchema({
  name = 'CodeScriet',
  logo = 'https://codescriet.dev/logo.png',
  url = 'https://codescriet.dev',
  description = 'CodeScriet - The Official Coding Club of SCRIET',
  sameAs = [
    'https://www.instagram.com/code.scriet/',
    'https://www.linkedin.com/company/codescriet/',
  ],
}: {
  name?: string;
  logo?: string;
  url?: string;
  description?: string;
  sameAs?: string[];
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
    logo,
    description,
    sameAs,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'General',
      email: 'contact@codescriet.dev',
    },
  };

  return <SchemaMarkup schema={schema} />;
}

/**
 * ProfilePage + Person schema for Team and Network profile detail pages.
 * Improves person-name discoverability in search.
 *
 * `sameAs` is the strongest signal Google uses to merge a name with an
 * identity across the web — pass every social/personal URL we know about.
 */
export function ProfilePageSchema({
  profileUrl,
  personName,
  description,
  image,
  jobTitle,
  affiliation = 'codescriet',
  worksFor,
  sameAs = [],
  knowsAbout = [],
  alumniOf,
  breadcrumbName,
}: {
  profileUrl: string;
  personName: string;
  description: string;
  image?: string;
  jobTitle?: string;
  /** Display name of the org affiliating this person (defaults to codescriet). */
  affiliation?: string;
  /** When set, used as the Person's `worksFor` org (e.g. an alum's current employer). */
  worksFor?: { name: string; url?: string };
  sameAs?: string[];
  /** Topics/expertise — surfaces in Google entity matches. */
  knowsAbout?: string[];
  /** For alumni: the educational institution they graduated from. */
  alumniOf?: { name: string; type?: 'CollegeOrUniversity' | 'EducationalOrganization' };
  breadcrumbName?: string;
}) {
  const affiliationOrg = {
    '@type': 'Organization',
    name: affiliation,
    url: 'https://codescriet.dev',
  } as const;

  const worksForOrg = worksFor
    ? {
      '@type': 'Organization',
      name: worksFor.name,
      ...(worksFor.url ? { url: worksFor.url } : {}),
    }
    : affiliationOrg;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: profileUrl,
    name: breadcrumbName || `${personName} | ${affiliation}`,
    mainEntity: {
      '@type': 'Person',
      name: personName,
      url: profileUrl,
      description,
      ...(image ? { image } : {}),
      ...(jobTitle ? { jobTitle } : {}),
      affiliation: affiliationOrg,
      worksFor: worksForOrg,
      ...(sameAs.length > 0 ? { sameAs } : {}),
      ...(knowsAbout.length > 0 ? { knowsAbout } : {}),
      ...(alumniOf
        ? {
          alumniOf: {
            '@type': alumniOf.type || 'CollegeOrUniversity',
            name: alumniOf.name,
          },
        }
        : {}),
    },
  };

  return <SchemaMarkup schema={schema} />;
}

/**
 * Event schema for event detail pages
 * Enables rich results and event listings in Google
 */
export function EventSchema({
  name,
  description,
  startDate,
  endDate,
  eventImage,
  eventStatus = 'EventScheduled',
  organizer = 'CodeScriet',
  location = 'Online/SCRIET Campus',
  url,
  slug,
}: {
  name: string;
  description: string;
  startDate?: string; // ISO format: 2026-02-15T10:00:00Z
  endDate?: string;
  eventImage: string;
  eventStatus?: 'EventScheduled' | 'EventCancelled' | 'EventPostponed' | 'EventRescheduled';
  organizer?: string;
  location?: string;
  url?: string;
  slug?: string;
}) {
  const eventUrl = url || `https://codescriet.dev/events/${slug}`;
  const baseUrl = 'https://codescriet.dev';

  // Use current time if dates not provided
  const start = startDate || new Date().toISOString();
  const end = endDate || new Date(new Date(start).getTime() + 2 * 60 * 60 * 1000).toISOString();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    description,
    url: eventUrl,
    image: eventImage,
    startDate: start,
    endDate: end,
    eventStatus: `https://schema.org/${eventStatus}`,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    organizer: {
      '@type': 'Organization',
      name: organizer,
      url: baseUrl,
    },
    location: {
      '@type': 'Place',
      name: location,
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'IN',
      },
    },
  };

  return <SchemaMarkup schema={schema} />;
}

/**
 * Achievement/Article schema for achievement pages
 * Shows up in Google with rich snippets
 */
export function AchievementSchema({
  title,
  description,
  image,
  datePublished,
  dateModified,
  author = 'CodeScriet',
  url,
  slug,
}: {
  title: string;
  description: string;
  image: string;
  datePublished?: string; // ISO format - optional
  dateModified?: string; // ISO format - optional
  author?: string;
  url?: string;
  slug?: string;
}) {
  const articleUrl = url || `https://codescriet.dev/achievements/${slug}`;
  const publishDate = datePublished || new Date().toISOString();
  const modifiedDate = dateModified || new Date().toISOString();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle', // NewsArticle is better for achievements than BlogPosting
    headline: title,
    description,
    image,
    datePublished: publishDate,
    dateModified: modifiedDate,
    author: {
      '@type': 'Organization',
      name: author,
      url: 'https://codescriet.dev',
    },
    publisher: {
      '@type': 'Organization',
      name: author,
      logo: {
        '@type': 'ImageObject',
        url: 'https://codescriet.dev/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
  };

  return <SchemaMarkup schema={schema} />;
}

/**
 * BreadcrumbList schema for navigation hierarchy
 * Improves site navigation in search results
 */
export function BreadcrumbSchema({
  items,
}: {
  items: Array<{ name: string; url: string }>;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return <SchemaMarkup schema={schema} />;
}

/**
 * FAQPage schema for frequently asked questions
 * Creates FAQ rich results in Google
 */
export function FAQPageSchema({
  items,
}: {
  items: Array<{ question: string; answer: string }>;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return <SchemaMarkup schema={schema} />;
}

/**
 * ImageObject schema for better image SEO
 * Use when you have high-quality images to highlight
 */
export function ImageObjectSchema({
  url,
  name,
  description,
  width,
  height,
}: {
  url: string;
  name: string;
  description?: string;
  width?: number;
  height?: number;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    url,
    name,
    description,
    ...(width && { width }),
    ...(height && { height }),
  };

  return <SchemaMarkup schema={schema} />;
}

/**
 * Announcement/Blog schema for announcement pages
 * Shows up in Google with rich snippets
 */
export function AnnouncementSchema({
  title,
  description,
  image,
  datePublished,
  dateModified,
  author = 'CodeScriet',
  url,
  slug,
}: {
  title: string;
  description: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  url?: string;
  slug?: string;
}) {
  const articleUrl = url || `https://codescriet.dev/announcements/${slug}`;
  const publishDate = datePublished || new Date().toISOString();
  const modifiedDate = dateModified || new Date().toISOString();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    image: image || 'https://codescriet.dev/logo.png',
    datePublished: publishDate,
    dateModified: modifiedDate,
    author: {
      '@type': 'Organization',
      name: author,
      url: 'https://codescriet.dev',
    },
    publisher: {
      '@type': 'Organization',
      name: 'CodeScriet',
      logo: {
        '@type': 'ImageObject',
        url: 'https://codescriet.dev/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
  };

  return <SchemaMarkup schema={schema} />;
}

/**
 * WebSite schema for the main site
 * Helps Google understand site structure and enables sitelinks search box
 */
export function WebSiteSchema({
  name = 'CodeScriet',
  url = 'https://codescriet.dev',
  description = 'CodeScriet - The Official Coding Club of SCRIET, CCS University',
}: {
  name?: string;
  url?: string;
  description?: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url,
    description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${url}/events?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return <SchemaMarkup schema={schema} />;
}
