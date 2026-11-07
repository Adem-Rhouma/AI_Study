import { memo, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { cn } from '../../lib/cn';

/**
 * Content convention: `topic:<slug>` links to a curriculum topic and renders as an in-app link with
 * the dotted concept-link underline. Anything else external opens in a new tab with noopener.
 */
function Anchor(props: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown; children?: ReactNode }) {
  const { href, children, ...rest } = props;
  if (href?.startsWith('topic:')) {
    const slug = href.slice('topic:'.length);
    return (
      <Link to={`/explore/${slug}`} data-topic-link="" {...(rest as object)}>
        {children}
      </Link>
    );
  }
  const external = href !== undefined && /^https?:/i.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...(rest as object)}
    >
      {children}
    </a>
  );
}

export type MarkdownProps = {
  source: string;
  className?: string;
  /** Headings get ids (rehype-slug) so lesson blocks can be deep-linked. */
  withIds?: boolean;
};

/**
 * Single Markdown renderer for all prose in the product. Math goes through KaTeX and code through
 * highlight.js; the KaTeX stylesheet is imported once in main.tsx and is never restyled here.
 */
export const Markdown = memo(function Markdown({ source, className, withIds = true }: MarkdownProps) {
  return (
    <div className={cn('prose', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight, ...(withIds ? [rehypeSlug] : [])]}
        components={{
          a: Anchor as never,
          pre: ({ children }) => (
            <div className="code-block">
              <pre>{children}</pre>
            </div>
          ),
          code: ({ className: codeClass, children, ...rest }) => {
            const inline = !codeClass?.includes('language-');
            if (inline) {
              return (
                <code className="rounded-[4px] bg-sunken px-1 py-0.5 font-mono text-[0.9em]" {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code className={cn(codeClass, 'font-mono')} {...rest}>
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
