/**
 * `ied ai` — opt-in, AI-augmented features backed by the Anthropic Claude API.
 *
 * These are clearly separated from the core scanner: they only run when the
 * user invokes them, they require an API key, and they make network calls. The
 * rest of IED (scan, rules, baseline, …) works fully offline with no key and
 * never imports the AI SDK — see ../ai/client.ts for the lazy import boundary.
 *
 *   ied ai explain <file> [--rule IED-S001] [--model ...] [--api-key ...]
 *   ied ai generate-rule --from-description "..." [--language ts] [--output rule.js]
 */

import * as fs from 'fs';
import { Command } from 'commander';
import {
  registerAllRules,
  registerPlugins,
  Analyzer,
  loadConfig,
  type Diagnostic,
  type ResolvedConfig
} from '@ied/core';
import {
  resolveAiSettings,
  createAiClient,
  MissingApiKeyError,
  type AiClient,
  type AiCliOverrides
} from '../ai/client';
import { explainFinding, type ExplainInput } from '../ai/explain';
import { generateRule } from '../ai/generate-rule';

const AI_BANNER =
  '⚡ AI feature — this sends data to the Anthropic API over the network. ' +
  'It is opt-in; the core scanner never does this.';

interface CommonAiOptions {
  apiKey?: string;
  model?: string;
}

/** Resolve settings + build a live client, or print guidance and exit. */
async function clientOrExit(opts: CommonAiOptions): Promise<{ client: AiClient; config: ResolvedConfig }> {
  const config = loadConfig(process.cwd());
  const overrides: AiCliOverrides = { apiKey: opts.apiKey, model: opts.model };
  const settings = resolveAiSettings(config, overrides);
  try {
    const client = await createAiClient(settings);
    process.stderr.write(`${AI_BANNER}\n  model: ${settings.model}\n\n`);
    return { client, config };
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      process.stderr.write(err.message + '\n');
      process.exit(2);
    }
    process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
    process.exit(2);
  }
  // Unreachable — process.exit above never returns.
  throw new Error('unreachable');
}

/** A few lines of source around a finding, for prompt context. */
function codeWindow(lines: string[], row: number, radius = 3): string {
  const start = Math.max(0, row - radius);
  const end = Math.min(lines.length, row + radius + 1);
  const width = String(end).length;
  const out: string[] = [];
  for (let i = start; i < end; i++) {
    const marker = i === row ? '>' : ' ';
    out.push(`${marker} ${String(i + 1).padStart(width)} | ${lines[i]}`);
  }
  return out.join('\n');
}

function explainSubcommand(): Command {
  const cmd = new Command('explain');
  cmd
    .description('Explain findings in a file in plain language (what / why / how to fix)')
    .argument('<file>', 'source file to scan and explain')
    .option('--rule <id>', 'only explain findings for this rule id')
    .option('--max <n>', 'explain at most N findings', '5')
    .option('--model <model>', 'Claude model id (default claude-opus-4-8 or config)')
    .option('--api-key <key>', 'Anthropic API key (else ANTHROPIC_API_KEY / config)')
    .action(async (file: string, opts: CommonAiOptions & { rule?: string; max: string }) => {
      const { client, config } = await clientOrExit(opts);

      registerAllRules();
      registerPlugins(config);

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch (err) {
        process.stderr.write(`Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(2);
        return;
      }

      const analyzer = new Analyzer(config);
      let result;
      try {
        result = await analyzer.analyzeFile({ filePath: file, content });
      } finally {
        analyzer.dispose();
      }

      let findings: Diagnostic[] = result.diagnostics;
      if (opts.rule) findings = findings.filter((d) => d.ruleId === opts.rule);
      const limit = Math.max(1, parseInt(opts.max, 10) || 5);
      const total = findings.length;
      findings = findings.slice(0, limit);

      if (total === 0) {
        process.stdout.write('No findings to explain.\n');
        return;
      }
      process.stdout.write(`Explaining ${findings.length} of ${total} finding(s) in ${file}:\n\n`);

      const lines = content.split('\n');
      for (const d of findings) {
        const input: ExplainInput = {
          ruleId: d.ruleId,
          ruleName: d.ruleName,
          message: d.message,
          severity: d.severity,
          category: d.category,
          language: result.language,
          filePath: d.filePath,
          line: d.range.start.row + 1,
          codeContext: codeWindow(lines, d.range.start.row)
        };
        try {
          const ex = await explainFinding(client, input);
          process.stdout.write(`── ${d.ruleId} ${d.ruleName}  (${d.filePath}:${input.line})\n`);
          process.stdout.write(`What:      ${ex.what}\n`);
          if (ex.why) process.stdout.write(`Why:       ${ex.why}\n`);
          if (ex.howToFix) process.stdout.write(`How to fix: ${ex.howToFix}\n`);
          if (ex.suggestedCode) {
            process.stdout.write(`Suggested:\n${indent(ex.suggestedCode)}\n`);
          }
          process.stdout.write('\n');
        } catch (err) {
          process.stderr.write(
            `  (failed to explain ${d.ruleId}: ${err instanceof Error ? err.message : String(err)})\n`
          );
        }
      }
    });
  return cmd;
}

function generateRuleSubcommand(): Command {
  const cmd = new Command('generate-rule');
  cmd
    .description('Generate an IED rule plugin from a natural-language description')
    .requiredOption('--from-description <text>', 'what the rule should detect')
    .option('--language <lang>', 'target language hint (e.g. typescript, python)')
    .option('--id <ruleId>', 'rule id to assign (e.g. ACME-001)')
    .option('--output <file>', 'write the generated plugin module to a file')
    .option('--model <model>', 'Claude model id (default claude-opus-4-8 or config)')
    .option('--api-key <key>', 'Anthropic API key (else ANTHROPIC_API_KEY / config)')
    .action(
      async (
        opts: CommonAiOptions & {
          fromDescription: string;
          language?: string;
          id?: string;
          output?: string;
        }
      ) => {
        const { client } = await clientOrExit(opts);

        const generated = await generateRule(client, {
          description: opts.fromDescription,
          language: opts.language,
          ruleId: opts.id
        });

        if (generated.degraded) {
          process.stderr.write(
            'Warning: could not parse a structured response; showing the raw model output.\n\n'
          );
        }

        if (opts.output) {
          fs.writeFileSync(opts.output, generated.code.endsWith('\n') ? generated.code : generated.code + '\n');
          process.stdout.write(`Wrote generated plugin to ${opts.output}\n`);
          process.stdout.write('Add it to .iedrc.json:  { "plugins": ["./' + opts.output + '"] }\n');
        } else {
          process.stdout.write(generated.code + '\n');
        }

        if (generated.query) {
          process.stderr.write(`\nTree-sitter query:\n${indent(generated.query)}\n`);
        }
        if (generated.notes) {
          process.stderr.write(`\nNotes:\n${indent(generated.notes)}\n`);
        }
      }
    );
  return cmd;
}

function indent(text: string, pad = '    '): string {
  return text
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

export function aiCommand(): Command {
  const cmd = new Command('ai');
  cmd.description('AI-augmented features (opt-in; require an Anthropic API key)');
  cmd.addCommand(explainSubcommand());
  cmd.addCommand(generateRuleSubcommand());
  return cmd;
}
