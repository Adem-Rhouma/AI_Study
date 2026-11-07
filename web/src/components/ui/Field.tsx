import type { ComponentProps, ReactNode } from 'react';
import { forwardRef, useId } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Switch from '@radix-ui/react-switch';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

const CONTROL =
  'w-full rounded-input border bg-raised px-3 py-2 text-body text-ink placeholder:text-ink-muted ' +
  'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60';

function controlClass(invalid: boolean, className?: string) {
  return cn(
    CONTROL,
    invalid
      ? 'border-danger focus-visible:outline-danger'
      : 'border-line hover:border-[var(--border-strong)]',
    className
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-caption font-medium text-ink-secondary">
        <span>
          {label}
          {required && <span className="ml-1 text-danger" aria-hidden>*</span>}
        </span>
        {hint && !error && <span className="text-ink-muted">{hint}</span>}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = ComponentProps<'input'> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...rest },
  ref
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={controlClass(invalid, className)} {...rest} />;
});

export type TextareaProps = ComponentProps<'textarea'> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, rows = 4, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(controlClass(invalid, 'resize-y leading-relaxed'), className)}
      {...rest}
    />
  );
});

export type SelectProps = ComponentProps<'select'> & { invalid?: boolean };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid = false, children, ...rest },
  ref
) {
  return (
    <span className="relative block">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlClass(invalid, 'appearance-none pr-9'), className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
    </span>
  );
});

export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Search…',
  className,
  ariaLabel = 'Search'
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <span className={cn('relative block', className)}>
      <label htmlFor={id} className="sr-only">
        {ariaLabel}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(CONTROL, 'border-line pl-3 hover:border-[var(--border-strong)] [&::-webkit-search-cancel-button]:appearance-none')}
      />
    </span>
  );
}

export function CheckboxField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', disabled && 'cursor-not-allowed opacity-60', className)}>
      <Checkbox.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-[4px] border border-line-strong bg-raised data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <Checkbox.Indicator>
          <Check size={13} strokeWidth={3} className="text-on-accent" aria-hidden />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span className="min-w-0">
        <span className="block text-body text-ink">{label}</span>
        {description && <span className="block text-caption text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}

export function SwitchField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  // Radix renders a <button role="switch">, and a wrapping <label> would not name it: the text has
  // to be referenced explicitly or a screen reader announces only "switch, off".
  const uid = useId();
  const rootId = `switch-${uid}`;
  const textId = `switch-text-${uid}`;
  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-60', className)}>
      <label htmlFor={rootId} className="min-w-0 cursor-pointer">
        <span id={textId} className="block text-body text-ink">
          {label}
        </span>
        {description && <span className="block text-caption text-ink-muted">{description}</span>}
      </label>
      <Switch.Root
        id={rootId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-labelledby={textId}
        className="relative h-6 w-11 shrink-0 rounded-pill border border-line bg-sunken transition-colors duration-150 data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-pill bg-raised shadow-1 transition-transform duration-150 will-change-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}

/** Server-side validation errors are keyed by field; this renders anything not shown inline. */
export function FormErrors({ details, shown = [] }: { details?: Record<string, string>; shown?: string[] }) {
  const rest = Object.entries(details ?? {}).filter(([key]) => !shown.includes(key));
  if (rest.length === 0) return null;
  return (
    <ul role="alert" className="space-y-1 rounded-input border border-danger/40 bg-danger-soft px-3 py-2 text-caption text-danger">
      {rest.map(([key, message]) => (
        <li key={key}>
          <span className="font-medium">{key}</span>: {message}
        </li>
      ))}
    </ul>
  );
}
