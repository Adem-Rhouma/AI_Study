/**
 * Every control the Content Studio can show, chosen from the field description the server published.
 * Nothing here names a table or a content type, so a new column is a server-side change only.
 */

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { api } from '../../api/client';
import { keys } from '../../api/keys';
import type { AdminFieldSpec, RefOption } from '../../api/types';
import { Button, CheckboxField, Field, IconButton, Input, Select, Textarea } from '../ui';

export type FieldScope = Record<string, string | null | undefined>;

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** The value a freshly added row starts from, so a required select is never left empty. */
export function emptyFieldValue(spec: AdminFieldSpec): unknown {
  if (spec.default !== null && spec.default !== undefined) return spec.default;
  switch (spec.type) {
    case 'boolean':
      return false;
    case 'select':
      return spec.options?.[0] ?? null;
    case 'string-list':
      return [];
    case 'json':
      return {};
    case 'number':
    case 'date':
    case 'ref':
      return null;
    default:
      return '';
  }
}

export function emptyItem(fields: AdminFieldSpec[]): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const field of fields) item[field.key] = emptyFieldValue(field);
  return item;
}

export function FieldControl({
  spec,
  value,
  onChange,
  error,
  scope,
  disabled
}: {
  spec: AdminFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string | null;
  scope?: FieldScope;
  disabled?: boolean;
}) {
  const id = useId();

  if (spec.type === 'boolean') {
    return (
      <CheckboxField
        className="pt-1"
        checked={value === true}
        disabled={disabled}
        onCheckedChange={onChange}
        label={spec.label}
        description={spec.hint ?? undefined}
      />
    );
  }

  const control =
    spec.type === 'textarea' ? (
      <Textarea
        id={id}
        rows={spec.max && spec.max > 2000 ? 6 : 3}
        maxLength={spec.max ?? undefined}
        value={text(value)}
        invalid={Boolean(error)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    ) : spec.type === 'string-list' ? (
      <StringListControl label={spec.label} values={Array.isArray(value) ? (value as unknown[]) : []} onChange={onChange} max={spec.max} disabled={disabled} />
    ) : spec.type === 'json' ? (
      <JsonControl id={id} value={value} onChange={onChange} disabled={disabled} />
    ) : spec.type === 'select' ? (
      <Select
        id={id}
        value={text(value)}
        invalid={Boolean(error)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">—</option>
        {(spec.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    ) : spec.type === 'ref' ? (
      <RefControl id={id} spec={spec} value={value} onChange={onChange} scope={scope} disabled={disabled} />
    ) : spec.type === 'number' ? (
      <NumberControl spec={spec} value={value} onChange={onChange} disabled={disabled} id={id} />
    ) : (
      <Input
        id={id}
        type={spec.type === 'date' ? 'date' : spec.type === 'url' ? 'url' : 'text'}
        value={text(value)}
        maxLength={spec.max ?? undefined}
        invalid={Boolean(error)}
        disabled={disabled}
        placeholder={spec.type === 'slug' ? 'kebab-case' : undefined}
        spellCheck={spec.type === 'text'}
        onChange={(event) => onChange(event.target.value === '' && (spec.type === 'url' || spec.type === 'date') ? null : event.target.value)}
      />
    );

  return (
    <Field
      label={spec.label}
      // A list has no single control to point at; each row names itself instead.
      htmlFor={spec.type === 'string-list' ? undefined : id}
      required={spec.required}
      hint={spec.hint}
      error={error ?? undefined}
    >
      {control}
    </Field>
  );
}

/**
 * Numbers are held as the text that was typed; the server coerces them back, so a half-typed value
 * can never reach the document as `NaN`.
 */
function NumberControl({
  spec,
  value,
  onChange,
  id,
  disabled
}: {
  spec: AdminFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      step={spec.integer ? 1 : 'any'}
      min={spec.min ?? undefined}
      max={spec.max ?? undefined}
      value={text(value)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
    />
  );
}

/** JSON is edited as text and only becomes a value again when the document is submitted. */
function JsonControl({
  id,
  value,
  onChange,
  disabled
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <Textarea
      id={id}
      rows={5}
      value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
      spellCheck={false}
      disabled={disabled}
      className="font-mono text-caption"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function StringListControl({
  label,
  values,
  onChange,
  max,
  disabled
}: {
  label: string;
  values: unknown[];
  onChange: (values: unknown[]) => void;
  max: number | null;
  disabled?: boolean;
}) {
  const items = values.map((entry) => (entry === null || entry === undefined ? '' : String(entry)));

  function replace(index: number, next: string) {
    const copy = [...items];
    copy[index] = next;
    onChange(copy);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    const [row] = copy.splice(index, 1);
    copy.splice(target, 0, row!);
    onChange(copy);
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-caption text-ink-muted">Nothing listed yet.</p>}
      {items.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            aria-label={`${label} item ${index + 1}`}
            value={entry}
            maxLength={max ?? 500}
            disabled={disabled}
            onChange={(event) => replace(index, event.target.value)}
          />
          <IconButton label="Move up" size="sm" disabled={disabled || index === 0} onClick={() => move(index, -1)}>
            <ArrowUp size={14} aria-hidden />
          </IconButton>
          <IconButton label="Move down" size="sm" disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)}>
            <ArrowDown size={14} aria-hidden />
          </IconButton>
          <IconButton label={`Remove ${label.toLowerCase()} item ${index + 1}`} size="sm" tone="danger" disabled={disabled} onClick={() => onChange(items.filter((_, position) => position !== index))}>
            <X size={14} aria-hidden />
          </IconButton>
        </div>
      ))}
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange([...items, ''])} iconLeft={<Plus size={14} aria-hidden />}>
        Add {label.toLowerCase()} item
      </Button>
    </div>
  );
}

/**
 * A foreign key the writer picks by name. The server sends only `{value, label}` pairs, so the
 * browser never learns a table name, and the value it writes back is the slug the server resolves.
 */
function RefControl({
  id,
  spec,
  value,
  onChange,
  scope,
  disabled
}: {
  id: string;
  spec: AdminFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  scope?: FieldScope;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const target = spec.target;
  // Modules only exist inside a course, so that picker waits for the course beside it.
  const needsCourse = target === 'course_modules';
  const course = scope?.course ?? null;
  const blocked = needsCourse && (course === null || course === '');

  const options = useQuery({
    queryKey: keys.adminRefs(target ?? '', course, filter),
    queryFn: () => api.get<{ options: RefOption[] }>('/admin/refs/' + target, { course: course ?? undefined, q: filter }),
    enabled: Boolean(target) && !blocked,
    placeholderData: (previous) => previous
  });

  const current = text(value);
  const list = options.data?.options ?? [];
  const choices = current !== '' && !list.some((option) => option.value === current) ? [{ value: current, label: current }, ...list] : list;

  if (blocked) {
    return <p className="rounded-input border border-line bg-sunken px-3 py-2 text-caption text-ink-muted">Choose the course first.</p>;
  }

  return (
    <div className="space-y-2">
      <Select
        id={id}
        value={current}
        disabled={disabled || options.isLoading}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">—</option>
        {choices.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Input
        type="search"
        aria-label={`Search ${spec.label.toLowerCase()}`}
        placeholder={`Search ${spec.label.toLowerCase()}…`}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {options.isError && <p className="text-caption text-danger">The list of {spec.label.toLowerCase()} could not be loaded.</p>}
    </div>
  );
}
