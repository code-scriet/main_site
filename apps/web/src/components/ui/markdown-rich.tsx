// RichContent lives in its OWN module so the heavy raw-HTML machinery
// (rehype-raw → parse5, plus the client DOMPurify pass) is code-split away from
// the common `Markdown`/`InlineMarkdown` components in markdown.tsx. Only the two
// profile pages that render server-sanitized HTML rich-text (team + network
// bio/vision/story/…) import this, so the SEO detail pages that use plain
// `Markdown` no longer pull ~65KB gz of parse5/DOMPurify into their chunk.
//
// Behavior is unchanged from the previous in-markdown.tsx RichContent: raw HTML
// is rendered (rehype-raw) but only after a client-side DOMPurify sanitize pass,
// on top of the server-side sanitizeHtml applied at storage time.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import DOMPurify from 'dompurify';
import type { Components } from 'react-markdown';
import { useMemo } from 'react';
import { getSafeLinkHref, getSafeImageSrc } from './markdown';

interface RichContentProps {
  children: string;
  className?: string;
  /** Allow raw HTML to be rendered (content is DOMPurify-sanitized first). */
  allowHtml?: boolean;
}

/** Safe DOMPurify config: an allowlist of formatting tags/attrs, no scripts/handlers. */
const configureDOMPurify = () => ({
  ALLOWED_TAGS: [
    'p', 'br', 'span', 'div',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark',
    'sup', 'sub', 'small',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'img',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr',
    'details', 'summary',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style',
    'href', 'target', 'rel', 'title',
    'src', 'alt', 'width', 'height', 'loading',
    'colspan', 'rowspan',
  ],
  FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'svg', 'math'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  KEEP_CONTENT: true,
});

/**
 * RichContent — Markdown with optional raw-HTML support. Uses DOMPurify for a
 * client-side sanitize layer; the server already sanitizes content at storage.
 */
export function RichContent({ children, className = '', allowHtml = false }: RichContentProps) {
  const sanitizedContent = useMemo(() => {
    if (!children) return '';
    if (!allowHtml) return children;
    return DOMPurify.sanitize(children, configureDOMPurify());
  }, [children, allowHtml]);

  const components: Components = {
    h1: ({ children }) => (
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-8 mb-4 first:mt-0 pb-2 border-b border-gray-200">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-6 mb-3 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mt-5 mb-2">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-base sm:text-lg font-semibold text-gray-800 mt-4 mb-2">
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="text-sm sm:text-base font-semibold text-gray-800 mt-3 mb-1">
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="text-sm font-semibold text-gray-700 mt-2 mb-1">
        {children}
      </h6>
    ),
    p: ({ children }) => (
      <p className="text-gray-700 leading-relaxed mb-4 last:mb-0">
        {children}
      </p>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-gray-900">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic text-gray-800">{children}</em>
    ),
    del: ({ children }) => (
      <del className="line-through text-gray-500">{children}</del>
    ),
    a: ({ href, children }) => {
      const safeHref = getSafeLinkHref(href);
      if (!safeHref) {
        return <span className="text-gray-500">{children}</span>;
      }
      const external = safeHref.startsWith('http://') || safeHref.startsWith('https://');
      return (
        <a
          href={safeHref}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className="text-amber-600 hover:text-amber-700 underline underline-offset-2 transition-colors"
        >
          {children}
        </a>
      );
    },
    ul: ({ children }) => (
      <ul className="list-disc list-outside ml-6 mb-4 space-y-1.5 text-gray-700">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-outside ml-6 mb-4 space-y-1.5 text-gray-700">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed pl-1">{children}</li>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-amber-400 bg-amber-50/50 pl-4 py-3 my-4 italic text-gray-700 rounded-r-lg">
        {children}
      </blockquote>
    ),
    code: ({ className, children, ...props }) => {
      const isCodeBlock = className?.includes('language-');
      if (isCodeBlock) {
        return (
          <code
            className={`block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono ${className || ''}`}
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code className="bg-gray-100 text-amber-700 px-1.5 py-0.5 rounded text-sm font-mono">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="mb-4 overflow-x-auto rounded-lg">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-amber-50">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-gray-200 bg-white">{children}</tbody>
    ),
    tr: ({ children }) => (
      <tr className="hover:bg-gray-50 transition-colors">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-3 text-sm text-gray-700">{children}</td>
    ),
    hr: () => (
      <hr className="my-6 border-t border-gray-200" />
    ),
    img: ({ src, alt }) => {
      const safeSrc = getSafeImageSrc(src);
      if (!safeSrc) {
        return null;
      }
      return (
        <img
          src={safeSrc}
          alt={alt || ''}
          className="rounded-lg max-w-full h-auto my-4 shadow-md"
          loading="lazy"
        />
      );
    },
    input: ({ type, checked, disabled }) => {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            className="mr-2 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            readOnly
          />
        );
      }
      return <input type={type} />;
    },
  };

  return (
    <div className={`prose prose-amber max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowHtml ? [rehypeRaw] : []}
        components={components}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
}
