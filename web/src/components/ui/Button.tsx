import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent border-transparent hover:bg-accent-hover active:bg-[var(--accent-active)]',
  secondary:
    'bg-raised text-ink border-line-strong hover:bg-sunken active:border-[var(--border-strong)]',
  ghost: 'bg-transparent text-ink-secondary border-transparent hover:bg-sunken hover:text-ink',
  danger: 'bg-danger text-white border-transparent hover:brightness-110 active:brightness-95'
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption gap-1.5',
  md: 'h-10 px-4 text-[15px] gap-2',
  lg: 'h-12 px-6 text-body gap-2.5'
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
};

/** Every button carries hover, focus-visible, active, disabled and loading states by construction. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, iconLeft, iconRight, block, className, children, disabled, ...rest },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex items-center justify-center rounded-input border font-medium',
        'transition-colors duration-150 select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className
      )}
      {...rest}
    >
      {/* Keeping the children in the layout while spinning locks the width, so buttons never jump. */}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {iconLeft}
        {children}
        {iconRight}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Loader2 size={16} className="animate-spin" aria-hidden />
        </span>
      )}
    </button>
  );
});

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', tone = 'default', className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid place-items-center rounded-input border border-transparent text-ink-secondary',
        'hover:bg-sunken hover:text-ink active:bg-[var(--bg-sunken)] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'danger' && 'text-danger hover:bg-danger-soft',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export function buttonClass({
  variant = 'secondary',
  size = 'md',
  block,
  className
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  return cn(
    'relative inline-flex items-center justify-center gap-2 rounded-input border font-medium no-underline',
    'transition-colors duration-150 select-none',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className
  );
}

/** Same visual language as Button for in-app navigation. */
export function LinkButton({
  variant,
  size,
  block,
  className,
  children,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return (
    <Link className={buttonClass({ variant, size, block, className })} {...rest}>
      {children}
    </Link>
  );
}

/** Same visual language as Button for external destinations; always opens safely. */
export function AnchorButton({
  variant,
  size,
  block,
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return (
    <a
      target={rest.href?.startsWith('http') ? '_blank' : undefined}
      rel={rest.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    >
      {children}
    </a>
  );
}
