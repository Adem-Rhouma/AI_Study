/**
 * The only place in the codebase that knows what a provider's wire format looks like.
 * Everything above this module speaks ChatMessage[] and gets a ChatCompletion back, so adding a
 * provider means adding a branch here rather than touching routes, services or the client.
 */

export type ProviderAdapter = 'openai_compatible' | 'anthropic' | 'ollama';

export const PROVIDER_ADAPTERS: ProviderAdapter[] = ['openai_compatible', 'anthropic', 'ollama'];

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ProviderSettings = {
  adapter: ProviderAdapter;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export type ChatCompletion = {
  text: string;
  model: string;
  tokensPrompt: number;
  tokensCompletion: number;
};

export type ProviderFailure = 'auth' | 'rate_limited' | 'timeout' | 'unreachable' | 'bad_response' | 'upstream';

/** Kind decides the user-facing wording; the message never carries key material. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderFailure,
    message: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const DEFAULT_BASE_URL: Record<ProviderAdapter, string> = {
  openai_compatible: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://localhost:11434'
};

const ANTHROPIC_VERSION = '2023-06-01';

export function endpointFor(settings: ProviderSettings): string {
  const base = (settings.baseUrl || DEFAULT_BASE_URL[settings.adapter]).replace(/\/+$/, '');
  if (settings.adapter === 'ollama') return `${base}/api/chat`;
  if (settings.adapter === 'anthropic') return `${base}/messages`;
  return `${base}/chat/completions`;
}

function headersFor(settings: ProviderSettings): Record<string, string> {
  if (settings.adapter === 'anthropic') {
    return { 'content-type': 'application/json', 'x-api-key': settings.apiKey, 'anthropic-version': ANTHROPIC_VERSION };
  }
  if (settings.adapter === 'ollama') {
    // A local Ollama has no key; sending an empty Authorization header invites a 401.
    return { 'content-type': 'application/json' };
  }
  return { 'content-type': 'application/json', authorization: `Bearer ${settings.apiKey}` };
}

function bodyFor(settings: ProviderSettings, messages: ChatMessage[]): Record<string, unknown> {
  const temperature = Math.min(1, Math.max(0, settings.temperature));
  const maxTokens = Math.min(8000, Math.max(1, Math.round(settings.maxTokens)));

  if (settings.adapter === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    return {
      model: settings.model,
      ...(system ? { system } : {}),
      messages: coalesceTurns(messages.filter((m) => m.role !== 'system')),
      max_tokens: maxTokens,
      temperature
    };
  }
  if (settings.adapter === 'ollama') {
    return {
      model: settings.model,
      messages: coalesceTurns(messages),
      stream: false,
      options: { temperature, num_predict: maxTokens }
    };
  }
  return { model: settings.model, messages: coalesceTurns(messages), temperature, max_tokens: maxTokens, stream: false };
}

/** Anthropic rejects consecutive turns of the same role; merging keeps the text intact. */
function coalesceTurns(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role && message.role !== 'system') {
      previous.content = `${previous.content}\n\n${message.content}`;
      continue;
    }
    merged.push({ ...message });
  }
  return merged;
}

function textPart(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function countTokens(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Each adapter reports the answer somewhere different; an unexpected shape is a failure, not a blank reply. */
function extractText(adapter: ProviderAdapter, payload: Record<string, unknown>): string {
  if (adapter === 'anthropic') {
    const blocks = Array.isArray(payload.content) ? payload.content : [];
    return blocks
      .map((block) => (typeof block === 'object' && block !== null ? textPart((block as { text?: unknown }).text) : ''))
      .join('')
      .trim();
  }
  if (adapter === 'ollama') {
    const message = payload.message as { content?: unknown } | undefined;
    return textPart(message?.content).trim();
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined;
  return textPart(first?.message?.content || first?.text).trim();
}

function extractUsage(adapter: ProviderAdapter, payload: Record<string, unknown>): { prompt: number; completion: number } {
  const usage = (payload.usage ?? {}) as Record<string, unknown>;
  if (adapter === 'anthropic') {
    return { prompt: countTokens(usage.input_tokens), completion: countTokens(usage.output_tokens) };
  }
  if (adapter === 'ollama') {
    // Ollama reports its counts at the top level, and only after the run finishes.
    return { prompt: countTokens(payload.prompt_eval_count), completion: countTokens(payload.eval_count) };
  }
  return { prompt: countTokens(usage.prompt_tokens), completion: countTokens(usage.completion_tokens) };
}

function failureKind(status: number): ProviderFailure {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream';
  return 'bad_response';
}

export async function completeChat(settings: ProviderSettings, messages: ChatMessage[]): Promise<ChatCompletion> {
  if (!settings.model) throw new ProviderError('bad_response', 'That provider has no model configured.');
  if (settings.adapter !== 'ollama' && !settings.apiKey) {
    throw new ProviderError('auth', 'That provider has no API key stored.');
  }

  const url = endpointFor(settings);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, settings.timeoutMs));
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: headersFor(settings),
      body: JSON.stringify(bodyFor(settings, messages)),
      signal: controller.signal
    });
  } catch {
    throw controller.signal.aborted
      ? new ProviderError('timeout', `The provider did not answer within ${Math.round(settings.timeoutMs / 1000)}s.`)
      : new ProviderError('unreachable', `Cannot reach the provider at ${url}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // The upstream body can echo request details, so it is never forwarded to a learner.
    throw new ProviderError(failureKind(response.status), `The provider responded with HTTP ${response.status}.`);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ProviderError('bad_response', 'The provider returned a response that is not JSON.');
  }

  const text = extractText(settings.adapter, payload);
  if (!text) throw new ProviderError('bad_response', 'The provider returned an empty answer.');
  const usage = extractUsage(settings.adapter, payload);
  return {
    text,
    model: textPart(payload.model) || settings.model,
    tokensPrompt: usage.prompt,
    tokensCompletion: usage.completion
  };
}
