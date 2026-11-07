import * as vscode from 'vscode';
import { registry, Severity, PROJECT_RULES } from '@ied/core';
import { DiagnosticProvider } from './diagnostic-provider';

/**
 * Renders rule metadata, the diagnostic message, category, docs, and any
 * related locations inside a Markdown hover. Covers per-file findings and the
 * whole-program ones from "Check Project" (`IED-X…`).
 */
export class HoverProvider implements vscode.HoverProvider {
  private sources: DiagnosticProvider[];

  constructor(...sources: DiagnosticProvider[]) {
    this.sources = sources;
  }

  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const issues = this.sources.flatMap(s => s.issuesFor(doc.uri.fsPath));
    const hits = issues.filter(d =>
      pos.line >= d.range.start.row && pos.line <= d.range.end.row
    );
    if (hits.length === 0) return;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    hits.forEach((hit, idx) => {
      const rule = registry.get(hit.ruleId);
      if (idx > 0) md.appendMarkdown('\n\n---\n\n');

      const sevIcon = hit.severity === Severity.Error ? '$(error)'
        : hit.severity === Severity.Warning ? '$(warning)'
        : hit.severity === Severity.Hint ? '$(lightbulb)'
        : '$(info)';
      md.appendMarkdown(`${sevIcon} **${hit.ruleName ?? hit.ruleId}** \`${hit.ruleId}\``);
      md.appendMarkdown('\n\n');
      md.appendMarkdown(`${hit.message}\n\n`);
      md.appendMarkdown(`*Category:* \`${hit.category}\`\n\n`);

      if (rule?.docs) {
        md.appendMarkdown(`${rule.docs}\n\n`);
      } else {
        const projectRule = PROJECT_RULES.find(r => r.id === hit.ruleId);
        if (projectRule) md.appendMarkdown(`${projectRule.description}\n\n`);
      }

      if (hit.related && hit.related.length > 0) {
        md.appendMarkdown('\n**Related**\n');
        for (const r of hit.related) {
          md.appendMarkdown(`- \`line ${r.range.start.row + 1}\` — ${r.message}\n`);
        }
      }
    });

    return new vscode.Hover(md);
  }
}
