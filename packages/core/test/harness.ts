/**
 * Tiny zero-dependency test harness for @ied/core.
 *
 * Tests register cases with `test(name, fn)` and run a single rule against a
 * snippet with `runRule(rule, language, code)`. A test file is just a module
 * that imports these and calls `test(...)`; the runner (test/run.ts) imports
 * every `*.test.ts`, then flushes the queue and reports pass/fail.
 */

import { ParserManager } from '../src/engine/parser';
import { analyzeSource } from '../src/engine/analyzer';
import { Severity, type Rule, type Language, type Diagnostic } from '../src/rules/types';

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const queue: TestCase[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  queue.push({ name, fn });
}

/** Used by the runner to drain registered cases. */
export function drain(): TestCase[] {
  return queue.splice(0, queue.length);
}

/** One shared parser manager across the whole test run (grammars load once). */
let sharedParser: ParserManager | null = null;
export function parser(): ParserManager {
  // ParserManager locates the vendored grammars/ dir itself (walks up from its
  // own compiled location), so no explicit path is needed here.
  if (!sharedParser) sharedParser = new ParserManager();
  return sharedParser;
}

export interface RunRuleOptions {
  isTestFile?: boolean;
  config?: Record<string, unknown>;
  filePath?: string;
}

/**
 * Run a single rule against a code snippet and return the resolved diagnostics.
 * Severity defaults to the rule's own; config defaults to `{}`.
 */
export async function runRule(
  rule: Rule,
  language: Language,
  code: string,
  opts: RunRuleOptions = {}
): Promise<Diagnostic[]> {
  return analyzeSource({
    rule,
    language,
    sourceCode: code,
    parser: parser(),
    filePath: opts.filePath ?? `test.${extFor(language)}`,
    isTestFile: opts.isTestFile ?? false,
    config: opts.config ?? {}
  });
}

function extFor(language: Language): string {
  switch (language) {
    case 'javascript': return 'js';
    case 'jsx': return 'jsx';
    case 'typescript': return 'ts';
    case 'tsx': return 'tsx';
    case 'vue': return 'vue';
    case 'python': return 'py';
    case 'go': return 'go';
  }
}

/** Re-export Severity so test files can assert against it conveniently. */
export { Severity };
