import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface InlineMarkdownProps {
  children: string;
  className?: string;
}

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const URL_BASE = 'https://codescriet.dev';

function sanitizeUrl(raw: string | undefined, allowedProtocols: Set<string>): string | null {
  if (!raw) {
    return null;
  }

  const value = raw.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith('#') || value.startsWith('/')) {
    return value;
  }

  try {
    const parsed = new URL(value, URL_BASE);
    if (!allowedProtocols.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function getSafeLinkHref(raw: string | undefined): string | null {
  return sanitizeUrl(raw, SAFE_LINK_PROTOCOLS);
}

export function InlineMarkdown({ children, className = '' }: InlineMarkdownProps) {
  const inlineComponents: Components = {
    p: ({ children }) => <span>{children}</span>,
    strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="line-through text-gray-500">{children}</del>,
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
          className="text-amber-600 hover:text-amber-700 underline underline-offset-2"
        >
          {children}
        </a>
      );
    },
    code: ({ children }) => (
      <code className="bg-amber-100/50 text-amber-700 px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
    ul: ({ children }) => <span>{children}</span>,
    ol: ({ children }) => <span>{children}</span>,
    li: ({ children }) => <span>{children} </span>,
    blockquote: ({ children }) => <span className="italic text-gray-600">"{children}"</span>,
    h1: ({ children }) => <span className="font-bold">{children}</span>,
    h2: ({ children }) => <span className="font-bold">{children}</span>,
    h3: ({ children }) => <span className="font-semibold">{children}</span>,
    h4: ({ children }) => <span className="font-semibold">{children}</span>,
    h5: ({ children }) => <span className="font-medium">{children}</span>,
    h6: ({ children }) => <span className="font-medium">{children}</span>,
  };

  return (
    <span className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={inlineComponents}>
        {children}
      </ReactMarkdown>
    </span>
  );
}
