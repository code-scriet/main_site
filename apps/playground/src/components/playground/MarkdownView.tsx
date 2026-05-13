import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownViewProps {
  source?: string | null;
  className?: string;
}

export function MarkdownView({ source, className }: MarkdownViewProps) {
  if (!source?.trim()) {
    return (
      <p className={cn('text-sm leading-6 text-zinc-500 dark:text-zinc-400', className)}>
        No problem statement has been added yet.
      </p>
    );
  }

  return (
    <div className={cn('playground-markdown text-sm leading-6 text-zinc-700 dark:text-zinc-300', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-1 font-display text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-6 font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold text-zinc-900 dark:text-zinc-100">{children}</h3>,
          p: ({ children }) => <p className="mb-3">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-amber-400 bg-amber-400/10 px-3 py-2 text-zinc-700 dark:text-zinc-300">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[420px] border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">{children}</thead>,
          th: ({ children }) => <th className="border-b border-zinc-200 px-3 py-2 font-semibold dark:border-zinc-800">{children}</th>,
          td: ({ children }) => <td className="border-t border-zinc-200 px-3 py-2 align-top dark:border-zinc-800">{children}</td>,
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = codeClassName?.includes('language-');
            if (isBlock) {
              return (
                <code className={cn('block overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-[12.5px] leading-6 text-zinc-100', codeClassName)} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[12px] text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="mb-4 overflow-x-auto rounded bg-zinc-950 p-0">{children}</pre>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-medium text-amber-600 underline underline-offset-4 dark:text-amber-400">
              {children}
            </a>
          ),
          hr: () => <hr className="my-5 border-zinc-200 dark:border-zinc-800" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
