/**
 * Shared rule + diagnostic types.
 * Kept dependency-free so workers can import without pulling in `vscode`.
 */

export type Severity = 'off' | 'info' | 'warning' | 'error';

export interface SourceLocation {
  startLine: number;   // 1-based
  startCol: number;    // 1-based
  endLine: number;
  endCol: number;
}

/** A single hop in a cross-file data-flow trace. */
export interface TraceStep {
  filePath: string;
  location: SourceLocation;
  description: string;     // "value originates from req.body.name"
}

/** Rich, senior-engineer style explanation attached to an issue. */
export interface Explanation {
  summary: string;         // one-line plain-English summary
  whyItMatters: string;    // real-world consequence
  suggestedFix: string;    // actionable steps
  example?: { bad: string; good: string };
}

export interface Issue {
  ruleId: string;
  message: string;
  severity: Exclude<Severity, 'off'>;
  filePath: string;
  location: SourceLocation;
  suggestion?: string;
  fixable?: boolean;
  /** 0..1 — how confident the rule is. >=0.7 shown by default. */
  confidence?: number;
  /** Cross-file trace, if the issue was discovered via data-flow. */
  trace?: TraceStep[];
  /** Rich human-readable explanation surfaced in hover. */
  explanation?: Explanation;
  data?: Record<string, unknown>;
}

export interface RuleMeta {
  id: string;
  name: string;
  description: string;
  category: 'logic' | 'code-smell' | 'security' | 'framework' | 'typescript' | 'performance' | 'heuristics' | 'data-flow';
  defaultSeverity: Exclude<Severity, 'off'>;
  fixable?: boolean;
  /** Default confidence when a rule does not specify one per issue. */
  defaultConfidence?: number;
}

export interface RuleContext {
  filePath: string;
  sourceText: string;
  ast: any;            // ts.SourceFile (typed as any to avoid pulling TS into shared types)
  language: 'js' | 'jsx' | 'ts' | 'tsx' | 'vue';
  isTestFile: boolean;
  projectContext: ProjectContext;
  report(issue: Omit<Issue, 'filePath' | 'ruleId'>): void;
  isSuppressed(line: number, ruleId: string): boolean;
}

export interface ProjectContext {
  exports: Map<string, Set<string>>;       // filePath -> exported symbol names
  imports: Map<string, Set<string>>;       // filePath -> imported symbol "module#name"
  callGraph: Map<string, Set<string>>;     // qualified function id -> callees
  fileHashes: Map<string, string>;
  hasReact: boolean;
  hasVue: boolean;
  /** Optional reference to the richer ProjectGraph; populated at workspace level. */
  graph?: unknown;
}

export interface Rule {
  meta: RuleMeta;
  run(ctx: RuleContext): void;
}
