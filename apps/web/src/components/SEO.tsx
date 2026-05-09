import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  /** Descriptive alt text for og:image / twitter:image. Falls back to the page title. */
  imageAlt?: string;
  url?: string;
  type?: 'website' | 'article' | 'profile';
  noIndex?: boolean;
}

const BASE_URL = 'https://codescriet.dev';
const DEFAULT_TITLE = 'codescriet - Official Coding Club of SCRIET';
const DEFAULT_DESCRIPTION = 'The official coding club of SCRIET, CCS University Meerut. Join code.scriet for DSA, competitive programming, hackathons, and tech events.';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.jpg`;

/**
 * SEO Component - Updates document head meta tags dynamically
 * This is a lightweight alternative to react-helmet for React 19
 */
export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  imageAlt,
  url,
  type = 'website',
  noIndex = false,
}: SEOProps) {
  // Title is used verbatim if it already mentions "codescriet" — avoids
  // double-suffixing pages like "Lakshya Aarya — President, codescriet".
  const fullTitle = title
    ? (/(codescriet|code\.scriet)/i.test(title) ? title : `${title} | codescriet`)
    : DEFAULT_TITLE;
  const fullImageAlt = imageAlt || (title ? title : 'codescriet');
  const fullUrl = (() => {
    if (url) {
      return url.startsWith('http') ? url : `${BASE_URL}${url}`;
    }

    if (typeof window !== 'undefined') {
      return `${BASE_URL}${window.location.pathname}`;
    }

    return BASE_URL;
  })();

  useEffect(() => {
    // Update document title
    document.title = fullTitle;

    // Helper function to update or create meta tags
    const updateMetaTag = (selector: string, attribute: string, value: string) => {
      let element = document.querySelector(selector) as HTMLMetaElement | null;
      if (element) {
        element.setAttribute(attribute === 'content' ? 'content' : attribute, value);
      } else {
        element = document.createElement('meta');
        if (selector.includes('property=')) {
          const property = selector.match(/property="([^"]+)"/)?.[1];
          if (property) element.setAttribute('property', property);
        } else if (selector.includes('name=')) {
          const name = selector.match(/name="([^"]+)"/)?.[1];
          if (name) element.setAttribute('name', name);
        }
        element.setAttribute('content', value);
        document.head.appendChild(element);
      }
    };

    // Helper function to update link tags
    const updateLinkTag = (rel: string, href: string) => {
      let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (element) {
        element.href = href;
      } else {
        element = document.createElement('link');
        element.rel = rel;
        element.href = href;
        document.head.appendChild(element);
      }
    };

    // Update basic meta tags
    updateMetaTag('meta[name="title"]', 'content', fullTitle);
    updateMetaTag('meta[name="description"]', 'content', description);

    // Update robots meta
    updateMetaTag('meta[name="robots"]', 'content', noIndex ? 'noindex, nofollow' : 'index, follow');

    // Update canonical URL
    updateLinkTag('canonical', fullUrl);

    // Update Open Graph tags
    updateMetaTag('meta[property="og:title"]', 'content', fullTitle);
    updateMetaTag('meta[property="og:description"]', 'content', description);
    updateMetaTag('meta[property="og:url"]', 'content', fullUrl);
    updateMetaTag('meta[property="og:image"]', 'content', image);
    updateMetaTag('meta[property="og:image:alt"]', 'content', fullImageAlt);
    updateMetaTag('meta[property="og:type"]', 'content', type);

    // Update Twitter tags
    updateMetaTag('meta[name="twitter:title"]', 'content', fullTitle);
    updateMetaTag('meta[name="twitter:description"]', 'content', description);
    updateMetaTag('meta[name="twitter:url"]', 'content', fullUrl);
    updateMetaTag('meta[name="twitter:image"]', 'content', image);
    updateMetaTag('meta[name="twitter:image:alt"]', 'content', fullImageAlt);

    // Cleanup function to reset to defaults when component unmounts
    return () => {
      document.title = DEFAULT_TITLE;
      updateMetaTag('meta[name="title"]', 'content', DEFAULT_TITLE);
      updateMetaTag('meta[name="description"]', 'content', DEFAULT_DESCRIPTION);
      updateMetaTag('meta[name="robots"]', 'content', 'index, follow');
      updateLinkTag('canonical', BASE_URL);
      updateMetaTag('meta[property="og:title"]', 'content', DEFAULT_TITLE);
      updateMetaTag('meta[property="og:description"]', 'content', DEFAULT_DESCRIPTION);
      updateMetaTag('meta[property="og:url"]', 'content', BASE_URL);
      updateMetaTag('meta[property="og:image"]', 'content', DEFAULT_IMAGE);
      updateMetaTag('meta[property="og:type"]', 'content', 'website');
      updateMetaTag('meta[name="twitter:title"]', 'content', DEFAULT_TITLE);
      updateMetaTag('meta[name="twitter:description"]', 'content', DEFAULT_DESCRIPTION);
      updateMetaTag('meta[name="twitter:url"]', 'content', BASE_URL);
      updateMetaTag('meta[name="twitter:image"]', 'content', DEFAULT_IMAGE);
    };
  }, [fullTitle, description, image, fullImageAlt, fullUrl, type, noIndex]);

  return null;
}

export default SEO;
