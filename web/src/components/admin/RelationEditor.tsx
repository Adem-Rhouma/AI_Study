import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { AdminFieldSpec } from '../../api/types';
import { Button, IconButton } from '../ui';
import { emptyItem, FieldControl, type FieldScope } from './FieldControl';

/**
 * A child table — lesson blocks, exercise options, prerequisites, collection items — edited in the
 * same document as its parent. The order on screen is the order the server stores, because these
 * tables are read back in it.
 */
export function RelationEditor({
  label,
  fields,
  items,
  onChange,
  scope,
  disabled
}: {
  label: string;
  fields: AdminFieldSpec[];
  items: Record<string, unknown>[];
  onChange: (items: Record<string, unknown>[]) => void;
  scope?: FieldScope;
  disabled?: boolean;
}) {
  function replace(index: number, next: Record<string, unknown>) {
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

  /** The first text-ish field names the row, so a long list stays navigable. */
  const summaryField = fields.find((field) => ['text', 'slug', 'ref', 'date'].includes(field.type)) ?? fields[0];

  return (
    <section className="rounded-card border border-line bg-sunken/50 p-3.5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="eyebrow text-caption font-semibold text-ink-secondary">
          {label}
          <span className="ml-2 tnum text-ink-muted">{items.length}</span>
        </h4>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange([...items, emptyItem(fields)])} iconLeft={<Plus size={14} aria-hidden />}>
          Add to {label.toLowerCase()}
        </Button>
      </header>

      {items.length === 0 ? (
        <p className="text-caption text-ink-muted">Nothing here yet.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="rounded-card border border-line bg-raised p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-caption text-ink-muted">
                  <span className="tnum mr-1.5 font-semibold text-ink-secondary">{index + 1}.</span>
                  {summaryField ? String(item[summaryField.key] ?? '') || 'empty' : ''}
                </p>
                <span className="flex shrink-0 items-center gap-1">
                  <IconButton label={`Move ${label} up`} size="sm" disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp size={14} aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Move ${label} down`}
                    size="sm"
                    disabled={disabled || index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Remove ${label} ${index + 1}`}
                    size="sm"
                    tone="danger"
                    disabled={disabled}
                    onClick={() => onChange(items.filter((_, position) => position !== index))}
                  >
                    <Trash2 size={14} aria-hidden />
                  </IconButton>
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.key} className={field.type === 'textarea' || field.type === 'json' ? 'sm:col-span-2' : undefined}>
                    <FieldControl
                      spec={field}
                      value={item[field.key]}
                      scope={scope}
                      disabled={disabled}
                      onChange={(value) => replace(index, { ...item, [field.key]: value })}
                    />
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
