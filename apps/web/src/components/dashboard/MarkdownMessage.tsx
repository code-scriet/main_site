// Theme-aware Markdown renderer shared by the dashboard's message surfaces
// (notification detail dialog + the admin registrant-message composer preview).
// Extracted so both consumers stay in sync on styling + link sanitization.
//
// Security note: NO rehype-raw — raw HTML in the source markdown stays escaped
// text, never rendered as DOM. Don't add it.

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getSafeLinkHref, getSafeImageSrc } from '@/components/ui/markdown';

export function isExternal(link: string): boolean {
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
  // react-markdown would otherwise render an unvetted `<img src>` for
  // `![](url)`, which fires an auto GET the moment the message is opened
  // (tracking pixel / IP leak) and could point at a `javascript:`/`data:`
  // src. Vet it the same way ui/markdown.tsx does and render nothing for a
  // disallowed src.
  img: ({ src, alt }) => {
    const safeSrc = getSafeImageSrc(src);
    if (!safeSrc) return null;
    return (
      <img src={safeSrc} alt={alt || ''} className="my-2 h-auto max-w-full rounded-[6px]" loading="lazy" />
    );
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
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-[var(--accent,#c2410c)] pl-3 italic text-[var(--ds-text-3)]">{children}</blockquote>,
  hr: () => <hr className="my-3 border-[var(--border-subtle)]" />,
};

export function MarkdownMessage({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{children}</ReactMarkdown>
    </div>
  );
}
