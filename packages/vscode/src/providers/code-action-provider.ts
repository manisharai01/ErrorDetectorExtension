import * as vscode from 'vscode';
import { registry, suppressionComment, Diagnostic } from '@ied/core';
import { Metrics } from '../metrics';
import { iedLanguageFor } from '../languages';
import { DiagnosticProvider } from './diagnostic-provider';

/**
 * Code actions backed by @ied/core rule fixes. For each context diagnostic
 * flagged by this extension we offer the rule's own fix (if any) plus a
 * generic "suppress on this line" action.
 */
export class CodeActionProvider implements vscode.CodeActionProvider {
  static providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(private metrics: Metrics, private diagnostics: DiagnosticProvider) {}

  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, ctx: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const d of ctx.diagnostics) {
      if (d.source !== 'invisible-errors') continue;
      const ruleId = String(d.code ?? '');
      if (!ruleId) continue;

      const fixAction = this.buildFixAction(doc, d, ruleId);
      if (fixAction) actions.push(fixAction);

      actions.push(this.suppressNextLineAction(doc, d, ruleId));
    }
    return actions;
  }

  private buildFixAction(doc: vscode.TextDocument, d: vscode.Diagnostic, ruleId: string): vscode.CodeAction | undefined {
    const rule = registry.get(ruleId);
    if (!rule || !rule.fix) return undefined;

    const coreDiag = this.findCoreDiagnostic(doc.uri.fsPath, ruleId, d.range.start.line);
    if (!coreDiag) return undefined;

    const edits = rule.fix(coreDiag, doc.getText());
    if (!edits || edits.length === 0) return undefined;

    const title = rule.fixTitle?.(coreDiag) ?? `Fix ${ruleId}`;
    const a = new vscode.CodeAction(`${title} (${ruleId})`, vscode.CodeActionKind.QuickFix);
    a.diagnostics = [d];
    a.isPreferred = true;
    const edit = new vscode.WorkspaceEdit();
    for (const e of edits) {
      const start = doc.positionAt(e.startIndex);
      const end = doc.positionAt(e.endIndex);
      edit.replace(doc.uri, new vscode.Range(start, end), e.newText);
    }
    a.edit = edit;
    // Counted when the fix is applied (the command runs), not when it is offered.
    a.command = { command: 'invisibleErrors.recordAutoFix', title: 'record', arguments: [] };
    return a;
  }

  private findCoreDiagnostic(filePath: string, ruleId: string, startLine: number): Diagnostic | undefined {
    return this.diagnostics.issuesFor(filePath).find(
      d => d.ruleId === ruleId && d.range.start.row === startLine
    );
  }

  private suppressNextLineAction(doc: vscode.TextDocument, d: vscode.Diagnostic, ruleId: string): vscode.CodeAction {
    const a = new vscode.CodeAction(`Suppress ${ruleId} on this line`, vscode.CodeActionKind.QuickFix);
    a.diagnostics = [d];
    a.edit = new vscode.WorkspaceEdit();
    const startLine = d.range.start.line;
    const indentMatch = doc.lineAt(startLine).text.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0] : '';
    // The engine's own directive, in the file's comment syntax, with a reason
    // placeholder (a bare suppression is itself flagged by IED-Q013).
    const comment = suppressionComment(iedLanguageFor(doc), ruleId);
    a.edit.insert(doc.uri, new vscode.Position(startLine, 0), `${indent}${comment}\n`);
    return a;
  }
}
