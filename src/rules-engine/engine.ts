import * as ts from 'typescript';
import { Issue, ProjectContext, Rule, RuleContext, Severity, SourceLocation } from './types';
import { registry } from './registry';
import { parseSuppressions } from '../utils/suppressions';

export interface EngineOptions {
  ruleSeverities: Record<string, Severity>;
  anyTypeThreshold: number;
  allowConsoleInCli: boolean;
}

export interface EngineRunInput {
  filePath: string;
  sourceText: string;
  ast: ts.SourceFile;
  language: 'js' | 'jsx' | 'ts' | 'tsx' | 'vue';
  isTestFile: boolean;
  projectContext: ProjectContext;
  rules?: Rule[];
}

export class RulesEngine {
  constructor(private options: EngineOptions) {}

  setOptions(o: EngineOptions): void { this.options = o; }
  getOptions(): EngineOptions { return this.options; }

  run(input: EngineRunInput): Issue[] {
    const collected: Issue[] = [];
    const suppressions = parseSuppressions(input.sourceText);

    const rules = (input.rules ?? registry.all()).filter(r => this.severityFor(r) !== 'off');

    for (const rule of rules) {
      const sev = this.severityFor(rule);
      const ctx: RuleContext = {
        filePath: input.filePath,
        sourceText: input.sourceText,
        ast: input.ast,
        language: input.language,
        isTestFile: input.isTestFile,
        projectContext: input.projectContext,
        report: (raw) => {
          if (suppressions.isSuppressed(raw.location.startLine, rule.meta.id)) return;
          collected.push({
            ...raw,
            ruleId: rule.meta.id,
            filePath: input.filePath,
            severity: (raw.severity ?? sev) as Issue['severity']
          });
        },
        isSuppressed: (line, id) => suppressions.isSuppressed(line, id)
      };
      try {
        rule.run(ctx);
      } catch (err) {
        // Rule crashes should never break the whole analysis.
        // Surface as info-level so users know something failed.
        collected.push({
          ruleId: rule.meta.id,
          message: `Rule ${rule.meta.id} crashed: ${(err as Error).message}`,
          severity: 'info',
          filePath: input.filePath,
          location: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 }
        });
      }
    }
    return collected;
  }

  private severityFor(r: Rule): Severity {
    return this.options.ruleSeverities[r.meta.id] ?? r.meta.defaultSeverity;
  }
}

export function locOf(node: ts.Node, sf: ts.SourceFile): SourceLocation {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const end = sf.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startCol: start.character + 1,
    endLine: end.line + 1,
    endCol: end.character + 1
  };
}

export function visit(node: ts.Node, cb: (n: ts.Node) => void | boolean): void {
  const stop = cb(node);
  if (stop === false) return;
  ts.forEachChild(node, child => visit(child, cb));
}
