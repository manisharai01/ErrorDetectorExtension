/**
 * The SDK contract. Everything in IED depends on these types.
 *
 * A rule is a plain object with metadata and a `run(context)` function that
 * inspects a Tree-sitter syntax tree and calls `context.report(...)` for each
 * finding. There is intentionally no visitor framework or plugin loader — a
 * rule is just a function with access to a query helper.
 */

import type Parser from 'web-tree-sitter';

/**
 * web-tree-sitter 0.22 ships as `export = Parser` (a class merged with a
 * namespace), so its members are reached as `Parser.Xxx` rather than named
 * imports. Re-export the few we use under friendly names so rules can import
 * them from this module instead of depending on web-tree-sitter directly.
 */
export type TSNode = Parser.SyntaxNode;
export type Tree = Parser.Tree;
export type QueryMatch = Parser.QueryMatch;
export type Point = Parser.Point;

/** Languages IED can analyze. `"*"` in a rule's `languages` means "all". */
export type Language =
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'vue'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin';

export enum Severity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
  Hint = 'hint'
}

export type RuleCategory =
  | 'logic'
  | 'security'
  | 'quality'
  | 'framework'
  | 'performance'
  | 'concurrency'
  | 'type-safety'
  | 'resource';

/** Zero-based row/column, matching Tree-sitter's `Point`. */
export interface Position {
  row: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

/** A single text replacement, used by auto-fixes. Offsets are byte indices. */
export interface TextEdit {
  startIndex: number;
  endIndex: number;
  newText: string;
}

/**
 * What a rule emits. `ruleId`, `severity`, and `category` are filled in from
 * rule metadata by the engine if the rule omits them, so a rule's `report`
 * call can be terse.
 */
export interface RuleDiagnostic {
  ruleId?: string;
  message: string;
  severity?: Severity;
  range: Range;
  /** Optional related locations (e.g. the source of a tainted value). */
  related?: Array<{ message: string; range: Range }>;
  /** A pre-computed fix for this specific finding, if the rule produced one. */
  fix?: TextEdit[] | null;
  /** Optional data bag for reporters / baseline fingerprinting. */
  data?: Record<string, unknown>;
}

/**
 * A fully-resolved diagnostic as returned by the analyzer. Every optional
 * field from `RuleDiagnostic` is now populated, plus file context.
 */
export interface Diagnostic {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  severity: Severity;
  message: string;
  filePath: string;
  range: Range;
  related?: Array<{ message: string; range: Range }>;
  fix?: TextEdit[] | null;
  /** Stable hash used by the baseline system to match findings across runs. */
  fingerprint: string;
  data?: Record<string, unknown>;
}

/** Per-rule config the user supplies (the `options` bag from .iedrc). */
export type RuleConfig = Record<string, unknown>;

export interface RuleContext {
  /** The parsed Tree-sitter tree for this file. */
  tree: Tree;
  /** Raw source text. */
  sourceCode: string;
  filePath: string;
  language: Language;
  /**
   * Run a Tree-sitter query (S-expression pattern) against the tree and get
   * matches back. Compiled queries are cached per (language, pattern).
   */
  query: (pattern: string) => QueryMatch[];
  /** Emit a finding. */
  report: (diagnostic: RuleDiagnostic) => void;
  /** User-provided options for this rule (the `options` object), never null. */
  config: RuleConfig;
  /**
   * True when the file looks like a test (`*.test.*`, `*.spec.*`, or under a
   * test directory). Rules like console-log relax for tests.
   */
  isTestFile: boolean;
  /** Check whether a finding on this row was suppressed via an inline comment. */
  isSuppressed: (row: number, ruleId: string) => boolean;
  /** Convenience: 1-based line text for a given zero-based row. */
  lineAt: (row: number) => string;
}

export interface Rule {
  /** Stable identifier, e.g. "IED-S001". */
  id: string;
  /** Human-readable kebab name, e.g. "hardcoded-secret". */
  name: string;
  category: RuleCategory;
  /** Default severity; user config can override. */
  severity: Severity;
  /** Languages this rule supports. `['*' as Language]`-style not used; use the helper below. */
  languages: Language[];
  /** One-line description shown in `ied rules list`. */
  description: string;
  /** Longer markdown explanation with examples, shown on hover. */
  docs: string;
  /** Analysis entry point. */
  run: (context: RuleContext) => void;
  /**
   * Optional auto-fix. Given a diagnostic this rule produced, return the edits
   * that resolve it, or null if it can't be auto-fixed.
   */
  fix?: (diagnostic: Diagnostic, sourceCode: string) => TextEdit[] | null;
}

/** Sentinel used in `languages` to mean "every language". */
export const ALL_LANGUAGES: Language[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'vue',
  'python',
  'go',
  'rust',
  'java',
  'kotlin'
];

/** True if `rule` applies to `language`. */
export function ruleAppliesTo(rule: Rule, language: Language): boolean {
  return rule.languages.includes(language);
}

/** Helper for rules: extract the node of a named capture from a match. */
export function capture(match: QueryMatch, name: string): TSNode | undefined {
  return match.captures.find((c) => c.name === name)?.node;
}

/** Convert a Tree-sitter node to a Range. */
export function nodeRange(node: TSNode): Range {
  return {
    start: { row: node.startPosition.row, column: node.startPosition.column },
    end: { row: node.endPosition.row, column: node.endPosition.column }
  };
}
