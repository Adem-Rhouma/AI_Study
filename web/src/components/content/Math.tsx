import { useMemo } from 'react';
import katex from 'katex';
import { cn } from '../../lib/cn';

/**
 * KaTeX is rendered to a trusted HTML string here (content is authored in-house, never user input).
 * The KaTeX stylesheet is loaded once in main.tsx; these classes never restyle KaTeX internals.
 */
export function TeX({
  latex,
  display = false,
  label,
  className
}: {
  latex: string;
  display?: boolean;
  label?: string;
  className?: string;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        strict: 'ignore',
        output: 'htmlAndMathml',
        trust: false
      });
    } catch {
      return null;
    }
  }, [latex, display]);

  if (html === null) {
    return (
      <code className={cn('rounded-[4px] bg-sunken px-1 py-0.5 font-mono text-[0.9em]', className)}>{latex}</code>
    );
  }

  if (!display) {
    return (
      <span
        className={cn('math-inline', className)}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className={cn('math-block', className)}>
      {/* eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {label && <span className="math-label mt-2 block">{label}</span>}
    </div>
  );
}
