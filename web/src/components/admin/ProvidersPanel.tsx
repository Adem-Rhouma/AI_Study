import { useState, type FormEvent } from 'react';
import { Pencil, Plug, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { keys } from '../../api/keys';
import type { ProviderConfig, ProviderDraft, ProviderTestResult } from '../../api/types';
import { useSession } from '../../lib/session';
import {
  Button,
  Card,
  CheckboxField,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FormErrors,
  IconButton,
  InlineAlert,
  Input,
  Modal,
  Select,
  SkeletonRows
} from '../ui';
import { useToast } from '../ui/Toast';

/**
 * The learning assistant's provider list. The API key is write-only: the server stores it encrypted
 * and sends back only whether one exists plus a trailing fragment, so this screen can never show it.
 */

type NumericRule = { min: number; max: number; label: string; integer: boolean };

/** Mirrors providerSchema on the server, so a bad number is named before the request. */
const RULES: Record<'priority' | 'temperature' | 'maxTokens' | 'timeoutMs', NumericRule> = {
  priority: { min: 0, max: 100, label: 'Priority', integer: true },
  temperature: { min: 0, max: 2, label: 'Temperature', integer: false },
  maxTokens: { min: 64, max: 8000, label: 'Max tokens', integer: true },
  timeoutMs: { min: 1000, max: 120000, label: 'Timeout (ms)', integer: true }
};

type DraftForm = {
  name: string;
  adapter: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  isEnabled: boolean;
  priority: string;
  temperature: string;
  maxTokens: string;
  timeoutMs: string;
};

function toForm(provider: ProviderConfig | null, adapters: string[]): DraftForm {
  return {
    name: provider?.name ?? '',
    adapter: provider?.adapter ?? adapters[0] ?? 'openai_compatible',
    baseUrl: provider?.baseUrl ?? '',
    model: provider?.model ?? '',
    apiKey: '',
    isEnabled: provider?.isEnabled ?? false,
    priority: String(provider?.priority ?? 0),
    temperature: String(provider?.temperature ?? 0.3),
    maxTokens: String(provider?.maxTokens ?? 900),
    timeoutMs: String(provider?.timeoutMs ?? 30000)
  };
}

function validate(form: DraftForm, isNew: boolean): { errors: Record<string, string>; payload: ProviderDraft } {
  const errors: Record<string, string> = {};
  const require = (key: keyof DraftForm, message: string) => {
    if (!errors[key]) errors[key] = message;
  };

  const name = form.name.trim();
  if (name.length < 2 || name.length > 60) require('name', 'A name between 2 and 60 characters.');

  const numbers = {} as Record<'priority' | 'temperature' | 'maxTokens' | 'timeoutMs', number>;
  for (const key of Object.keys(RULES) as (keyof typeof RULES)[]) {
    const rule = RULES[key];
    const raw = form[key].trim();
    const value = raw === '' ? Number.NaN : Number(raw);
    if (Number.isNaN(value)) require(key, `${rule.label} needs a number.`);
    else if (rule.integer && !Number.isInteger(value)) require(key, `${rule.label} has to be a whole number.`);
    else if (value < rule.min || value > rule.max) require(key, `${rule.label} is between ${rule.min} and ${rule.max}.`);
    else numbers[key] = value;
  }

  if (form.model.trim() === '') require('model', 'The model this provider should be asked for.');
  if (isNew && form.apiKey.trim() === '') require('apiKey', 'A new provider needs an API key.');

  return {
    errors,
    payload: {
      name,
      adapter: form.adapter,
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      apiKey: form.apiKey.trim(),
      isEnabled: form.isEnabled,
      priority: numbers.priority ?? 0,
      temperature: numbers.temperature ?? 0.3,
      maxTokens: numbers.maxTokens ?? 900,
      timeoutMs: numbers.timeoutMs ?? 30000
    }
  };
}

export function ProvidersPanel({ adapters }: { adapters: string[] }) {
  const { session } = useSession();
  const isAdmin = session.user?.role === 'admin';
  const queryClient = useQueryClient();
  const toast = useToast();

  const providers = useQuery({
    queryKey: keys.adminProviders,
    queryFn: () => api.get<{ providers: ProviderConfig[] }>('/admin/providers')
  });

  const [editing, setEditing] = useState<ProviderConfig | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ProviderConfig | null>(null);
  const [tested, setTested] = useState<{ id: number; ok: boolean; detail: string } | null>(null);

  const test = useMutation({
    mutationFn: (id: number) => api.post<ProviderTestResult>(`/admin/providers/${id}/test`),
    onSuccess: (result, id) =>
      setTested({ id, ok: true, detail: `${result.model} answered in ${result.latencyMs} ms: “${result.excerpt}”` }),
    onError: (error, id) => setTested({ id, ok: false, detail: error instanceof Error ? error.message : 'The request failed.' })
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del<{ deleted: boolean }>(`/admin/providers/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.adminProviders });
      void queryClient.invalidateQueries({ queryKey: keys.adminOverview });
      setDeleting(null);
      toast.info('Provider removed.');
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'The provider was not removed.')
  });

  if (providers.error) return <ErrorState error={providers.error} onRetry={() => void providers.refetch()} />;
  if (!providers.data) return <SkeletonRows rows={4} />;

  const rows = providers.data.providers;

  return (
    <div className="space-y-4">
      <InlineAlert tone="info" title="How the key is handled">
        Keys are encrypted on the server and never sent back to this page. Saving with the key box empty keeps the stored key;
        typing a new one replaces it. Learner prompts are the only thing this platform sends to a provider — exercise statements,
        solutions and other people's data stay in the database.
      </InlineAlert>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-ink-secondary">
          Providers are tried in priority order, lowest number first. {rows.filter((row) => row.isEnabled).length} of {rows.length}{' '}
          enabled.
        </p>
        {isAdmin && (
          <Button variant="primary" onClick={() => setEditing('new')} iconLeft={<Plus size={15} aria-hidden />}>
            Add provider
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No provider is configured"
          description="The study assistant stays off until one is added here. Everything else on the platform works without it."
          action={isAdmin ? <Button variant="secondary" onClick={() => setEditing('new')}>Add provider</Button> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((provider) => (
            <li key={provider.id}>
              <Card variant="sunken" className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {provider.name}
                      <Chip tone={provider.isEnabled ? 'success' : 'neutral'}>{provider.isEnabled ? 'enabled' : 'off'}</Chip>
                      <Chip tone="neutral">{provider.adapter}</Chip>
                    </p>
                    <p className="mt-1 text-caption text-ink-secondary">
                      {provider.model}
                      {provider.baseUrl && <span className="ml-2 break-all text-ink-muted">{provider.baseUrl}</span>}
                    </p>
                    <p className="mt-1 text-caption text-ink-muted">
                      {provider.keyStored ? (
                        <>Key stored{provider.keyHint ? ` · ends ${provider.keyHint}` : ''}</>
                      ) : (
                        'No key stored'
                      )}{' '}
                      · priority {provider.priority} · {provider.temperature} temp · {provider.maxTokens} tokens · {provider.timeoutMs} ms
                      timeout
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={test.isPending && tested?.id === provider.id}
                        onClick={() => {
                          setTested(null);
                          test.mutate(provider.id);
                        }}
                        iconLeft={<Plug size={14} aria-hidden />}
                      >
                        Test
                      </Button>
                      <IconButton label={`Edit ${provider.name}`} size="sm" onClick={() => setEditing(provider)}>
                        <Pencil size={14} aria-hidden />
                      </IconButton>
                      <IconButton label={`Delete ${provider.name}`} size="sm" tone="danger" onClick={() => setDeleting(provider)}>
                        <Trash2 size={14} aria-hidden />
                      </IconButton>
                    </div>
                  )}
                </div>
                {tested?.id === provider.id && (
                  <InlineAlert tone={tested.ok ? 'success' : 'danger'} title={tested.ok ? 'It answered' : 'No usable reply'}>
                    {tested.detail}
                  </InlineAlert>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {!isAdmin && (
        <p className="text-caption text-ink-muted">
          Authors can see the provider list to know what the assistant is running on; only administrators change it.
        </p>
      )}

      <Modal
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        size="md"
        title={editing === 'new' ? 'Add a provider' : `Editing ${editing?.name}`}
        description="Nothing is sent to this provider until it is enabled and a learner opens the assistant."
      >
        {editing !== null && (
          <ProviderForm
            key={editing === 'new' ? 'new' : editing.id}
            adapters={adapters}
            provider={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove ${deleting?.name ?? ''}?`}
        body="Learners lose the assistant if no other provider is enabled. The stored key is deleted with the row."
        confirmLabel="Remove provider"
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

function ProviderForm({
  adapters,
  provider,
  onDone
}: {
  adapters: string[];
  provider: ProviderConfig | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<DraftForm>(() => toForm(provider, adapters));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (payload: ProviderDraft) =>
      provider === null
        ? api.post<ProviderConfig>('/admin/providers', payload)
        : api.put<ProviderConfig>(`/admin/providers/${provider.id}`, payload),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: keys.adminProviders });
      void queryClient.invalidateQueries({ queryKey: keys.adminOverview });
      toast.info(`${saved.name} saved.`);
      onDone();
    }
  });

  const set = (key: keyof DraftForm) => (value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validate(form, provider === null);
    setErrors(checked.errors);
    if (Object.keys(checked.errors).length > 0) return;
    save.mutate(checked.payload);
  }

  const serverDetails = save.error instanceof ApiError ? (save.error.details ?? {}) : {};

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {save.isError && (
        <InlineAlert tone="danger" title="Not saved">
          {save.error instanceof Error ? save.error.message : 'The server refused this provider.'}
        </InlineAlert>
      )}
      <FormErrors details={serverDetails} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="provider-name" required error={errors.name ?? serverDetails.name ?? null}>
          <Input
            id="provider-name"
            value={form.name}
            invalid={Boolean(errors.name)}
            onChange={(event) => set('name')(event.target.value)}
            placeholder="primary"
          />
        </Field>
        <Field label="Wire format" htmlFor="provider-adapter" hint="Only the formats this install can speak.">
          <Select id="provider-adapter" value={form.adapter} onChange={(event) => set('adapter')(event.target.value)}>
            {adapters.map((adapter) => (
              <option key={adapter} value={adapter}>
                {adapter}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Model" htmlFor="provider-model" required error={errors.model ?? serverDetails.model ?? null}>
          <Input id="provider-model" value={form.model} invalid={Boolean(errors.model)} onChange={(event) => set('model')(event.target.value)} placeholder="gpt-4o-mini" />
        </Field>
        <Field
          label="Base URL"
          htmlFor="provider-base-url"
          hint="Blank uses the vendor's own endpoint. Set it for anything self-hosted or proxied."
          error={errors.baseUrl ?? serverDetails.baseUrl ?? null}
        >
          <Input id="provider-base-url" value={form.baseUrl} onChange={(event) => set('baseUrl')(event.target.value)} placeholder="https://api.example.com/v1" />
        </Field>
        <Field
          label="API key"
          htmlFor="provider-api-key"
          hint={provider === null ? 'Stored encrypted; never shown again.' : 'Leave blank to keep the stored key.'}
          required={provider === null}
          error={errors.apiKey ?? serverDetails.apiKey ?? null}
        >
          <Input
            id="provider-api-key"
            type="password"
            autoComplete="off"
            value={form.apiKey}
            invalid={Boolean(errors.apiKey)}
            onChange={(event) => set('apiKey')(event.target.value)}
            placeholder={provider?.keyStored ? `Stored · ends ${provider.keyHint ?? '····'}` : 'sk-…'}
          />
        </Field>
        <Field label="Priority" htmlFor="provider-priority" hint="Lowest number is tried first." error={errors.priority ?? serverDetails.priority ?? null}>
          <Input id="provider-priority" inputMode="numeric" value={form.priority} invalid={Boolean(errors.priority)} onChange={(event) => set('priority')(event.target.value)} />
        </Field>
        <Field label="Temperature" htmlFor="provider-temperature" error={errors.temperature ?? serverDetails.temperature ?? null}>
          <Input id="provider-temperature" inputMode="decimal" value={form.temperature} invalid={Boolean(errors.temperature)} onChange={(event) => set('temperature')(event.target.value)} />
        </Field>
        <Field label="Max tokens" htmlFor="provider-max-tokens" error={errors.maxTokens ?? serverDetails.maxTokens ?? null}>
          <Input id="provider-max-tokens" inputMode="numeric" value={form.maxTokens} invalid={Boolean(errors.maxTokens)} onChange={(event) => set('maxTokens')(event.target.value)} />
        </Field>
        <Field label="Timeout (ms)" htmlFor="provider-timeout" error={errors.timeoutMs ?? serverDetails.timeoutMs ?? null}>
          <Input id="provider-timeout" inputMode="numeric" value={form.timeoutMs} invalid={Boolean(errors.timeoutMs)} onChange={(event) => set('timeoutMs')(event.target.value)} />
        </Field>
      </div>

      <CheckboxField
        checked={form.isEnabled}
        onCheckedChange={set('isEnabled')}
        label="Use this provider"
        description="While it is off, the assistant never sends anything to it."
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {provider === null ? 'Add provider' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
