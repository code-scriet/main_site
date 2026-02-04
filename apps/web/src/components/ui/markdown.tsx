import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * InlineMarkdown component for rendering markdown in single-line contexts
 * like card descriptions, short descriptions, etc.
 * Strips block-level elements and renders inline content only.
 */
export function InlineMarkdown({ children, className = '' }: MarkdownProps) {
  const inlineComponents: Components = {
    // Convert paragraphs to spans for inline rendering
    p: ({ children }) => <span>{children}</span>,
    // Strong/Bold
    strong: ({ children }) => (
      <strong className="font-semibold text-gray-800">{children}</strong>
    ),
    // Emphasis/Italic
    em: ({ children }) => (
      <em className="italic">{children}</em>
    ),
    // Strikethrough
    del: ({ children }) => (
      <del className="line-through text-gray-500">{children}</del>
    ),
    // Links
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-600 hover:text-amber-700 underline underline-offset-2"
      >
        {children}
      </a>
    ),
    // Inline code
    code: ({ children }) => (
      <code className="bg-amber-100/50 text-amber-700 px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
    // Block elements converted to inline
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={inlineComponents}
      >
        {children}
      </ReactMarkdown>
    </span>
  );
}

/**
 * Markdown component with full GFM (GitHub Flavored Markdown) support
 * Supports: tables, strikethrough, task lists, autolinks, code blocks, etc.
 */
export function Markdown({ children, className = '' }: MarkdownProps) {
  const components: Components = {
    // Headings
    h1: ({ children }) => (
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-6 mb-4 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-5 mb-3 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mt-4 mb-2">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-base sm:text-lg font-semibold text-gray-800 mt-3 mb-2">
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

    // Paragraphs
    p: ({ children }) => (
      <p className="text-gray-700 leading-relaxed mb-4 last:mb-0">
        {children}
      </p>
    ),

    // Strong/Bold
    strong: ({ children }) => (
      <strong className="font-semibold text-gray-900">{children}</strong>
    ),

    // Emphasis/Italic
    em: ({ children }) => (
      <em className="italic text-gray-800">{children}</em>
    ),

    // Strikethrough (GFM)
    del: ({ children }) => (
      <del className="line-through text-gray-500">{children}</del>
    ),

    // Links
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-600 hover:text-amber-700 underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    ),

    // Unordered Lists
    ul: ({ children }) => (
      <ul className="list-disc list-outside ml-6 mb-4 space-y-1 text-gray-700">
        {children}
      </ul>
    ),

    // Ordered Lists
    ol: ({ children }) => (
      <ol className="list-decimal list-outside ml-6 mb-4 space-y-1 text-gray-700">
        {children}
      </ol>
    ),

    // List Items
    li: ({ children }) => (
      <li className="leading-relaxed pl-1">{children}</li>
    ),

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-amber-400 bg-amber-50 pl-4 py-2 my-4 italic text-gray-700">
        {children}
      </blockquote>
    ),

    // Inline Code
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

    // Code Blocks (pre)
    pre: ({ children }) => (
      <pre className="mb-4 overflow-x-auto rounded-lg">
        {children}
      </pre>
    ),

    // Tables (GFM)
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

    // Horizontal Rule
    hr: () => (
      <hr className="my-6 border-t border-gray-200" />
    ),

    // Images
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt || ''}
        className="rounded-lg max-w-full h-auto my-4 shadow-md"
        loading="lazy"
      />
    ),

    // Task List Items (GFM) - handled via input checkbox
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
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
