// Renders a hiring message body with Markdown + a safe HTML subset.
//
// Lives in its own module so the raw-HTML machinery (rehype-raw → parse5 + the
// client DOMPurify pass) is code-split into the lazy hiring routes only — it is
// NOT pulled into the always-loaded dashboard/notification chunk that shares the
// lighter MarkdownMessage renderer.
//
// Defense in depth: the server already sanitizes on save (sanitizeMarkdown
// allowlist); this re-sanitizes with DOMPurify before rendering raw HTML, then
// vets link/img URLs again via getSafeLinkHref/getSafeImageSrc.
//
// Styling mirrors MarkdownMessage's dashboard tokens so messages read
// consistently across the tab and the admin history.

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import DOMPurify from 'dompurify';
import { useMemo } from 'react';
import { getSafeLinkHref, getSafeImageSrc } from '@/components/ui/markdown';

const PURIFY_CONFIG = {
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
    'class', 'id',
    'href', 'target', 'rel', 'title',
    'src', 'alt', 'width', 'height', 'loading',
    'colspan', 'rowspan',
  ],
  FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'svg', 'math'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  KEEP_CONTENT: true,
};

function isExternal(link: string): boolean {
  return /^https?:\/\//i.test(link) || link.startsWith('//');
}

const mdComponents: Components = {
  p: ({ children }) => <p className="mb-2.5 text-[13.5px] leading-relaxed text-[var(--ds-text-2)] last:mb-0">{children}</p>,
  a: ({ href, children }) => {
    const h = getSafeLinkHref(href);
    if (!h) return <span>{children}</span>;
    const ext = isExternal(h);
    return (
      <a
        href={h}
        target={ext ? '_blank' : undefined}
        rel={ext ? 'noopener noreferrer' : undefined}
        className="break-words font-medium text-[var(--accent,#c2410c)] underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => {
    const safeSrc = getSafeImageSrc(src);
    if (!safeSrc) return null;
    return <img src={safeSrc} alt={alt || ''} className="my-2 h-auto max-w-full rounded-[6px]" loading="lazy" />;
  },
  strong: ({ children }) => <strong className="font-semibold text-[var(--ds-text-1)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-[var(--ds-text-3)] line-through">{children}</del>,
  ul: ({ children }) => <ul className="mb-2.5 ml-5 list-disc space-y-1 text-[13.5px] text-[var(--ds-text-2)]">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2.5 ml-5 list-decimal space-y-1 text-[13.5px] text-[var(--ds-text-2)]">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="mb-1.5 mt-3 text-[15px] font-semibold text-[var(--ds-text-1)] first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1.5 mt-3 text-[14px] font-semibold text-[var(--ds-text-1)] first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-2.5 text-[13.5px] font-semibold text-[var(--ds-text-1)] first:mt-0">{children}</h4>,
  code: ({ children }) => <code className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--ds-text-1)]">{children}</code>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-[8px] bg-[var(--surface-soft)] p-3 text-[12px]">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-[var(--accent,#c2410c)] pl-3 italic text-[var(--ds-text-3)]">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-[var(--border-subtle)] px-2 py-1 text-left font-semibold text-[var(--ds-text-1)]">{children}</th>,
  td: ({ children }) => <td className="border border-[var(--border-subtle)] px-2 py-1 text-[var(--ds-text-2)]">{children}</td>,
  hr: () => <hr className="my-3 border-[var(--border-subtle)]" />,
};

export function MessageBody({ children, className }: { children: string; className?: string }) {
  const sanitized = useMemo(() => (children ? DOMPurify.sanitize(children, PURIFY_CONFIG) : ''), [children]);
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
        {sanitized}
      </ReactMarkdown>
    </div>
  );
}
