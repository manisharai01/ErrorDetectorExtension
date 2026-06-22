import * as vscode from 'vscode';
import * as path from 'path';
import { DiagnosticProvider } from './diagnostic-provider';
import { registry } from '../rules-engine/registry';

/**
 * Renders the rich `Explanation` block + cross-file `trace` (if present)
 * inside a Markdown hover. Falls back to the legacy short layout for
 * issues that don't carry an explanation.
 */
export class HoverProvider implements vscode.HoverProvider {
  constructor(private diagnostics: DiagnosticProvider) {}

  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const issues = this.diagnostics.issuesFor(doc.uri.fsPath);
    const hits = issues.filter(i =>
      pos.line + 1 >= i.location.startLine &&
      pos.line + 1 <= i.location.endLine
    );
    if (hits.length === 0) return;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    hits.forEach((hit, idx) => {
      const rule = registry.get(hit.ruleId);
      if (idx > 0) md.appendMarkdown('\n\n---\n\n');

      const sevIcon = hit.severity === 'error' ? '$(error)' : hit.severity === 'warning' ? '$(warning)' : '$(info)';
      md.appendMarkdown(`${sevIcon} **${rule?.meta.name ?? hit.ruleId}** \`${hit.ruleId}\``);
      if (typeof hit.confidence === 'number') {
        md.appendMarkdown(`  ·  *confidence ${(hit.confidence * 100).toFixed(0)}%*`);
      }
      md.appendMarkdown('\n\n');
      md.appendMarkdown(`${hit.message}\n\n`);

      if (hit.explanation) {
        md.appendMarkdown(`> ${hit.explanation.summary}\n\n`);
        md.appendMarkdown(`**Why it matters.** ${hit.explanation.whyItMatters}\n\n`);
        md.appendMarkdown(`**Suggested fix.** ${hit.explanation.suggestedFix}\n\n`);
        if (hit.explanation.example) {
          md.appendMarkdown('```js\n// before\n' + hit.explanation.example.bad + '\n\n// after\n' + hit.explanation.example.good + '\n```\n');
        }
      } else if (hit.suggestion) {
        md.appendMarkdown(`💡 *${hit.suggestion}*\n\n`);
      }

      if (hit.trace && hit.trace.length > 0) {
        md.appendMarkdown('\n**Data-flow trace**\n');
        for (const step of hit.trace) {
          const file = path.basename(step.filePath);
          md.appendMarkdown(`- \`${file}:${step.location.startLine}\` — ${step.description}\n`);
        }
      }

      if (rule && !hit.explanation) md.appendMarkdown(`\n<sub>${rule.meta.description}</sub>`);
    });

    return new vscode.Hover(md);
  }
}
