/**
 * AI "explain a finding" — turns a terse diagnostic into a plain-language
 * what / why / how-to-fix, optionally with a concrete code suggestion.
 *
 * Pure logic: takes an `AiClient` (real or mock) plus the finding and its code
 * context, builds the prompt, and parses the model's JSON reply. No SDK, no
 * network here — see ./client.ts for the live client.
 */

import type { AiClient } from './client';
import { extractJsonObject } from './json';

export interface ExplainInput {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: string;
  category: string;
  language: string;
  filePath: string;
  /** The flagged line plus a little surrounding context. */
  codeContext: string;
  /** 1-based line number of the finding, for reference in the prompt. */
  line: number;
}

export interface Explanation {
  /** One or two sentences: what the finding is. */
  what: string;
  /** Why it matters / what can go wrong. */
  why: string;
  /** Concrete steps to fix it. */
  howToFix: string;
  /** Optional corrected code snippet, or null if not applicable. */
  suggestedCode: string | null;
  /** True when the structured JSON failed to parse and `what` holds raw text. */
  degraded?: boolean;
}

const SYSTEM = [
  'You are a senior software engineer helping a teammate understand a static-analysis finding.',
  'Be precise, concrete, and brief. Assume the reader is a competent developer.',
  'Always respond with a SINGLE JSON object and nothing else — no prose, no markdown fences.',
  'The JSON must have exactly these keys:',
  '  "what": string — one or two sentences naming the problem.',
  '  "why": string — why it matters / what can go wrong in practice.',
  '  "howToFix": string — concrete, actionable steps to resolve it.',
  '  "suggestedCode": string | null — a corrected snippet if one is clearly applicable, else null.',
  'Do not invent details about code you cannot see. If the fix depends on context, say so in howToFix.'
].join('\n');

export function buildExplainPrompt(input: ExplainInput): string {
  return [
    `Rule: ${input.ruleId} (${input.ruleName})`,
    `Category: ${input.category}    Severity: ${input.severity}    Language: ${input.language}`,
    `File: ${input.filePath}:${input.line}`,
    `Message: ${input.message}`,
    '',
    'Code context:',
    '```' + input.language,
    input.codeContext,
    '```',
    '',
    'Explain this finding as the JSON object described in the system prompt.'
  ].join('\n');
}

/** Run an explanation request against the given client. */
export async function explainFinding(client: AiClient, input: ExplainInput): Promise<Explanation> {
  const { text } = await client.complete({
    system: SYSTEM,
    user: buildExplainPrompt(input),
    maxTokens: 1024
  });
  return parseExplanation(text);
}

/**
 * Tolerant parse: accept a bare JSON object, or one wrapped in ```json fences,
 * or fall back to treating the whole reply as the `what` text.
 */
export function parseExplanation(text: string): Explanation {
  const json = extractJsonObject(text);
  if (json) {
    try {
      const obj = JSON.parse(json) as Partial<Explanation>;
      return {
        what: str(obj.what) || '(no explanation returned)',
        why: str(obj.why),
        howToFix: str(obj.howToFix),
        suggestedCode: typeof obj.suggestedCode === 'string' && obj.suggestedCode.trim() ? obj.suggestedCode : null
      };
    } catch {
      /* fall through to degraded */
    }
  }
  return {
    what: text.trim() || '(no explanation returned)',
    why: '',
    howToFix: '',
    suggestedCode: null,
    degraded: true
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
