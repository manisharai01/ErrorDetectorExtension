/**
 * @ied/core — public API.
 *
 * The standalone analysis engine: Tree-sitter parsing, a rule registry, the
 * analyzer, config resolution, caching, and suppressions. Consumed by both
 * @ied/cli and @ied/vscode. No VS Code or CLI dependencies live here.
 */

// ── Rule SDK contract & helpers ──────────────────────────────────────────────
export {
  Severity,
  ALL_LANGUAGES,
  ruleAppliesTo,
  capture,
  nodeRange
} from './rules/types';
export type {
  Language,
  RuleCategory,
  Position,
  Range,
  TextEdit,
  RuleDiagnostic,
  Diagnostic,
  RuleConfig,
  RuleContext,
  Rule,
  TSNode,
  Tree,
  QueryMatch,
  Point
} from './rules/types';

// ── Registry ─────────────────────────────────────────────────────────────────
export { RuleRegistry, registry } from './rules/registry';
export { BUILTIN_RULES, registerAllRules } from './rules/index';

// ── Parser ───────────────────────────────────────────────────────────────────
export { ParserManager, extractVueScript } from './engine/parser';
export type { ParseResult, GrammarName } from './engine/parser';

// ── Grammar profiles (cross-language node-type abstraction for rules) ─────────
export { profileFor, GRAMMAR_PROFILES } from './engine/grammar-profile';
export type { GrammarProfile } from './engine/grammar-profile';

// ── Cross-file project analysis ───────────────────────────────────────────────
export { findUnusedExports } from './engine/project-graph';
export type { UnusedExport, ProjectFile } from './engine/project-graph';

// ── Scoring ───────────────────────────────────────────────────────────────────
export { scoreFindings } from './engine/scoring';
export type { FindingCounts } from './engine/scoring';

// ── Policy engine (governance) ────────────────────────────────────────────────
export {
  resolvePolicy,
  repoConfigAsLayer,
  applyPolicy,
  evaluateThresholds
} from './config/policy';
export type {
  Policy,
  PolicyRuleSetting,
  PolicyThresholds,
  PolicyViolation,
  PolicyLayer,
  ResolvedPolicy,
  GateInput,
  GateResult
} from './config/policy';

// ── Analyzer ─────────────────────────────────────────────────────────────────
export {
  Analyzer,
  analyzeSource,
  languageFromPath,
  looksLikeTestFile,
  fingerprint
} from './engine/analyzer';
export type {
  FileInput,
  FileResult,
  AnalyzeSourceArgs
} from './engine/analyzer';

// ── Baseline ─────────────────────────────────────────────────────────────────
export {
  generateBaseline,
  writeBaseline,
  loadBaseline,
  filterAgainstBaseline
} from './engine/baseline';
export type { Baseline } from './engine/baseline';

// ── Worker pool ──────────────────────────────────────────────────────────────
export { WorkerPool } from './engine/worker-pool';
export type { PoolInput } from './engine/worker-pool';

// ── Cache ────────────────────────────────────────────────────────────────────
export { DiskCache, cacheKey, RULE_VERSION } from './engine/cache';
export type { CacheEntry } from './engine/cache';

// ── Suppressions ─────────────────────────────────────────────────────────────
export { parseSuppressions, isSuppressed } from './engine/suppressions';
export type { Suppressions } from './engine/suppressions';

// ── Config ───────────────────────────────────────────────────────────────────
export {
  resolveConfig,
  loadConfig,
  defaultResolvedConfig,
  toSeverity,
  DEFAULT_INCLUDE,
  DEFAULT_EXCLUDE
} from './config/resolve';
export type {
  IEDConfig,
  ResolvedConfig,
  RuleSetting,
  ConfigSeverity
} from './config/types';

// ── Reporters ────────────────────────────────────────────────────────────────
export {
  toJson,
  toSarif,
  toHtml,
  toJUnit,
  summarize,
  groupByFile,
  qualityScore
} from './reporters/index';
export type { Summary, HtmlOptions } from './reporters/index';

// ── Utilities ────────────────────────────────────────────────────────────────
export { IgnoreMatcher } from './utils/ignore';
