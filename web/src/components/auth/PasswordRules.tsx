import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * The same three rules the server enforces in `registerSchema` (server/src/modules/auth/auth.repo.ts):
 * ten characters, a letter and a number. Change one side and this table has to change with it.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 10 characters', test: (value: string) => value.length >= 10 },
  { id: 'letter', label: 'Contains a letter', test: (value: string) => /[a-zA-Z]/.test(value) },
  { id: 'number', label: 'Contains a number', test: (value: string) => /[0-9]/.test(value) }
] as const;

export function isStrongEnough(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

export function PasswordRules({ value }: { value: string }) {
  const state = useMemo(() => PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(value) })), [value]);
  return (
    <ul aria-label="Password requirements" className="space-y-1">
      {state.map((rule) => (
        <li key={rule.id} className="flex items-center gap-1.5 text-caption">
          <span className={cn(rule.met ? 'text-success' : value ? 'text-warning' : 'text-ink-muted')}>
            {rule.met ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
          </span>
          <span className={rule.met ? 'text-ink-secondary' : 'text-ink-muted'}>{rule.label}</span>
        </li>
      ))}
    </ul>
  );
}
