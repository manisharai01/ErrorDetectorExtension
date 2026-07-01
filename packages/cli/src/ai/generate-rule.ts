/**
 * AI "generate a rule from a description" — turns a natural-language request
 * ("flag any use of console.warn in production code") into a ready-to-load IED
 * rule plugin: a Tree-sitter query plus a JS module matching the plugin
 * contract the loader expects (default-exports an array of Rule objects).
 *
 * Pure logic: takes an `AiClient` (real or mock), builds the prompt, parses the
 * reply. No SDK / network here — see ./client.ts.
 */

import type { AiClient } from './client';
import { extractJsonObject } from './json';

export interface GenerateRuleInput {
  description: string;
  /** Optional target language hint, e.g. "typescript", "python". */
  language?: string;
  /** Optional id to assign the generated rule (e.g. "ACME-001"). */
  ruleId?: string;
}

export interface GeneratedRule {
  /** A complete CommonJS plugin module (module.exports = [rule]). */
  code: string;
  /** The Tree-sitter query the rule is built around, pulled out for review. */
  query: string;
  /** Short prose notes: caveats, false-positive risks, how to test. */
  notes: string;
  degraded?: boolean;
}

const SYSTEM = [
  'You generate rules for the Invisible Errors Detector (IED), a Tree-sitter-based static analyzer.',
  '',
  'A rule is a plain object — there is no framework. The plugin contract is:',
  '',
  '  module.exports = [ /* one or more Rule objects */ ];',
  '',
  'A Rule object has these fields:',
  '  id:          string  — stable id, e.g. "ACME-001"',
  '  name:        string  — kebab-case, e.g. "no-console-warn"',
  '  category:    one of "logic"|"security"|"quality"|"framework"|"performance"|"concurrency"|"type-safety"|"resource"',
  '  severity:    one of "error"|"warning"|"info"|"hint"',
  '  languages:   string[] from "javascript"|"typescript"|"jsx"|"tsx"|"vue"|"python"|"go"|"rust"|"java"|"kotlin"|"swift"|"c"|"cpp"|"php"',
  '  description: string  — one line',
  '  docs:        string  — short markdown explanation',
  '  run(ctx):    function — the analysis entry point',
  '',
  'Inside run(ctx) you have:',
  '  ctx.query(pattern)  — run a Tree-sitter S-expression query; returns matches.',
  '                        Each match has `.captures`, an array of { name, node }.',
  '  ctx.report({ message, severity, range })  — emit a finding.',
  '                        range is { start: {row, column}, end: {row, column} } (0-based).',
  '                        A captured node gives you node.startPosition / node.endPosition.',
  '  ctx.isTestFile, ctx.isSuppressed(row, id), ctx.language, ctx.sourceCode, ctx.lineAt(row).',
  '',
  'Example rule body:',
  '  run(ctx) {',
  '    const matches = ctx.query(`(call_expression function: (identifier) @fn (#eq? @fn "eval")) @call`);',
  '    for (const m of matches) {',
  '      const call = m.captures.find((c) => c.name === "call");',
  '      if (!call) continue;',
  '      const n = call.node;',
  '      ctx.report({ message: "Avoid eval().", severity: "warning",',
  '                   range: { start: n.startPosition, end: n.endPosition } });',
  '    }',
  '  }',
  '',
  'Respond with a SINGLE JSON object and nothing else (no markdown fences) with exactly these keys:',
  '  "code":  string — the complete CommonJS plugin module, ready to save as index.js.',
  '  "query": string — just the Tree-sitter query used, for human review.',
  '  "notes": string — caveats, false-positive risks, and how to test it.',
  'The code MUST be valid JavaScript and MUST default-export an array via module.exports.'
].join('\n');

export function buildGeneratePrompt(input: GenerateRuleInput): string {
  const lines = [`Write an IED rule for this request:`, '', input.description, ''];
  if (input.language) lines.push(`Target language: ${input.language}.`);
  if (input.ruleId) lines.push(`Use the rule id: ${input.ruleId}.`);
  lines.push('Return the JSON object described in the system prompt.');
  return lines.join('\n');
}

export async function generateRule(client: AiClient, input: GenerateRuleInput): Promise<GeneratedRule> {
  const { text } = await client.complete({
    system: SYSTEM,
    user: buildGeneratePrompt(input),
    maxTokens: 2048
  });
  return parseGeneratedRule(text);
}

export function parseGeneratedRule(text: string): GeneratedRule {
  const json = extractJsonObject(text);
  if (json) {
    try {
      const obj = JSON.parse(json) as Partial<GeneratedRule>;
      if (typeof obj.code === 'string' && obj.code.trim()) {
        return {
          code: obj.code,
          query: typeof obj.query === 'string' ? obj.query : '',
          notes: typeof obj.notes === 'string' ? obj.notes : ''
        };
      }
    } catch {
      /* fall through to degraded */
    }
  }
  // Degraded: hand back the raw reply so the user still sees the model output.
  return { code: text.trim(), query: '', notes: '', degraded: true };
}
