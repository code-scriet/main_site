import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  noIndex?: boolean;
}

const BASE_URL = 'https://codescriet.dev';
const DEFAULT_TITLE = 'code.scriet | Official Coding Club of SCRIET, CCS University';
const DEFAULT_DESCRIPTION = 'code.scriet (codescriet) is the Official Coding Club of SCRIET, CCS University Meerut. Join India\'s most active college coding community for DSA, competitive programming, hackathons, web development, and tech events.';
const DEFAULT_IMAGE = `${BASE_URL}/logo.jpeg`;
const DEFAULT_KEYWORDS = 'code, codescriet, code scriet, scriet, SCRIET coding club, CCS University, programming club, DSA, competitive programming, hackathons';

/**
 * SEO Component - Updates document head meta tags dynamically
 * This is a lightweight alternative to react-helmet for React 19
 */
export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords = DEFAULT_KEYWORDS,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  noIndex = false,
}: SEOProps) {
  const fullTitle = title ? `${title} | code.scriet` : DEFAULT_TITLE;
  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;

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
    updateMetaTag('meta[name="keywords"]', 'content', keywords);

    // Update robots meta
    updateMetaTag('meta[name="robots"]', 'content', noIndex ? 'noindex, nofollow' : 'index, follow');

    // Update canonical URL
    updateLinkTag('canonical', fullUrl);

    // Update Open Graph tags
    updateMetaTag('meta[property="og:title"]', 'content', fullTitle);
    updateMetaTag('meta[property="og:description"]', 'content', description);
    updateMetaTag('meta[property="og:url"]', 'content', fullUrl);
    updateMetaTag('meta[property="og:image"]', 'content', image);
    updateMetaTag('meta[property="og:type"]', 'content', type);

    // Update Twitter tags
    updateMetaTag('meta[property="twitter:title"]', 'content', fullTitle);
    updateMetaTag('meta[property="twitter:description"]', 'content', description);
    updateMetaTag('meta[property="twitter:url"]', 'content', fullUrl);
    updateMetaTag('meta[property="twitter:image"]', 'content', image);

    // Cleanup function to reset to defaults when component unmounts
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [fullTitle, description, keywords, image, fullUrl, type, noIndex]);

  return null;
}

export default SEO;
