/**
 * Inline analysis runner — used by the AnalyzerPool when worker_threads
 * cannot be spawned (or for unit tests). Executes the rules engine
 * synchronously in-process.
 */
import { Issue, Severity } from '../rules-engine/types';
import { RulesEngine } from '../rules-engine/engine';
import { registerAllRules } from '../rules';
import { detectLanguage } from '../parser';
import { parseTypeScript } from '../parser/ts-parser';
import { parseJavaScript } from '../parser/js-parser';
import { parseVue } from '../parser/vue-parser';
import type { AnalyzeRequest } from '../core/analyzer-pool';

registerAllRules();

export function runAnalysisInline(req: AnalyzeRequest): Issue[] {
  const lang = req.language ?? detectLanguage(req.filePath);
  if (!lang) return [];

  let parsed;
  if (lang === 'ts' || lang === 'tsx') parsed = parseTypeScript(req.filePath, req.sourceText, lang === 'tsx');
  else if (lang === 'js' || lang === 'jsx') parsed = parseJavaScript(req.filePath, req.sourceText, lang === 'jsx');
  else if (lang === 'vue') parsed = parseVue(req.filePath, req.sourceText);
  if (!parsed) return [];

  const engine = new RulesEngine({
    ruleSeverities: req.ruleSeverities as Record<string, Severity>,
    anyTypeThreshold: req.options.anyTypeThreshold,
    allowConsoleInCli: req.options.allowConsoleInCli
  });

  return engine.run({
    filePath: req.filePath,
    sourceText: parsed.sourceText,
    ast: parsed.ast,
    language: parsed.language,
    isTestFile: req.isTestFile,
    projectContext: {
      exports: new Map(), imports: new Map(), callGraph: new Map(),
      fileHashes: new Map(), hasReact: false, hasVue: false
    }
  });
}
