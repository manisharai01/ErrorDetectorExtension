/**
 * AI client plumbing for the opt-in `ied ai` features.
 *
 * Everything Anthropic-specific is isolated here behind a tiny `AiClient`
 * interface so the explain/generate logic depends only on `complete(...)` and
 * can be unit-tested with a mock — no network, no SDK. The real client is built
 * with a LAZY dynamic import of `@anthropic-ai/sdk`, so merely loading the CLI
 * (or running a normal `ied scan`) never pulls the SDK in or touches the
 * network. The core engine has no AI code at all.
 */

import type { ResolvedConfig } from '@ied/core';

/** Default Claude model when the user hasn't configured one. */
export const DEFAULT_AI_MODEL = 'claude-opus-4-8';

export interface AiCompletion {
  text: string;
  stopReason: string | null;
}

export interface AiCompleteRequest {
  system: string;
  user: string;
  maxTokens: number;
}

/** The narrow surface the AI features need. Mockable in tests. */
export interface AiClient {
  readonly model: string;
  complete(req: AiCompleteRequest): Promise<AiCompletion>;
}

export interface AiSettings {
  apiKey: string | null;
  model: string;
  /** Whether the user explicitly turned AI on in config (informational). */
  enabledInConfig: boolean;
}

export interface AiCliOverrides {
  apiKey?: string;
  model?: string;
}

/**
 * Resolve the API key and model from (in priority order): explicit CLI flag,
 * the `ai` block in `.iedrc.json`, then environment variables. The key is never
 * required to load the CLI — only to actually run an AI command.
 */
export function resolveAiSettings(config: ResolvedConfig, overrides: AiCliOverrides = {}): AiSettings {
  const ai = config.ai ?? {};
  const apiKey =
    overrides.apiKey ??
    ai.apiKey ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.IED_AI_API_KEY ??
    null;
  const model = overrides.model ?? ai.model ?? process.env.IED_AI_MODEL ?? DEFAULT_AI_MODEL;
  return { apiKey, model, enabledInConfig: ai.enabled === true };
}

/** Thrown when an AI command is invoked without a resolvable API key. */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'AI features are opt-in and require an Anthropic API key.\n' +
        'Set ANTHROPIC_API_KEY in your environment, pass --api-key, or add\n' +
        '  { "ai": { "apiKey": "sk-ant-..." } }\n' +
        'to .iedrc.json. The core scanner works fully without this.'
    );
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Build a real Claude-backed client. Dynamically imports the SDK so it is only
 * loaded when an AI command actually runs. Throws MissingApiKeyError if no key
 * was resolved, and a clear error if the SDK isn't installed.
 */
export async function createAiClient(settings: AiSettings): Promise<AiClient> {
  if (!settings.apiKey) throw new MissingApiKeyError();

  let AnthropicCtor: typeof import('@anthropic-ai/sdk').default;
  try {
    const mod = await import('@anthropic-ai/sdk');
    AnthropicCtor = mod.default;
  } catch {
    throw new Error(
      "The '@anthropic-ai/sdk' package is required for AI features. Install it with:\n" +
        '  npm install @anthropic-ai/sdk'
    );
  }

  const anthropic = new AnthropicCtor({ apiKey: settings.apiKey });
  const model = settings.model;

  return {
    model,
    async complete(req: AiCompleteRequest): Promise<AiCompletion> {
      const message = await anthropic.messages.create({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }]
      });
      const text = message.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('');
      return { text, stopReason: message.stop_reason ?? null };
    }
  };
}
