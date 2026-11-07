import { useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(code: string, language?: string): string {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      /* fall through to plain rendering rather than breaking a lesson */
    }
  }
  return escapeHtml(code);
}

/** Dark in both themes by design; the header carries the language and a real copy action. */
export function CodeBlock({
  code,
  language,
  filename,
  caption,
  highlightLines,
  className
}: {
  code: string;
  language?: string;
  filename?: string;
  caption?: string;
  highlightLines?: number[];
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => highlight(code.replace(/\n$/, ''), language), [code, language]);
  const highlighted = new Set(highlightLines ?? []);
  const lines = html.split('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className={cn('code-block', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="truncate font-mono text-[12px] text-[#9aa3ad]">
          {filename ?? (language ? language : 'code')}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-input px-2 py-1 text-[12px] text-[#c6ccd3] transition-colors hover:bg-white/10"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code className={language ? `language-${language} hljs` : 'hljs'}>
          {highlighted.size > 0 ? (
            lines.map((line, index) => (
              <span
                key={index}
                className={cn('block', highlighted.has(index + 1) && '-mx-4 bg-white/10 px-4')}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: line || ' ' }}
              />
            ))
          ) : (
            <span
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </code>
      </pre>
      {caption && <figcaption className="border-t border-white/10 px-4 py-2 text-[12px] text-[#9aa3ad]">{caption}</figcaption>}
    </figure>
  );
}
