import * as vscode from 'vscode';
import { Metrics } from '../core/metrics';

/**
 * Code actions that auto-fix the most common Invisible Errors findings.
 *  - smell/console-log         -> remove the statement
 *  - smell/unused-parameters   -> rename parameter with leading underscore
 *  - logic/promise-swallowing  -> add `await` before the call
 *  - smell/duplicate-code      -> "Extract to helper" placeholder action
 */
export class CodeActionProvider implements vscode.CodeActionProvider {
  static providedCodeActionKinds = [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.RefactorExtract];

  constructor(private metrics: Metrics) {}

  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, ctx: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const d of ctx.diagnostics) {
      if (d.source !== 'invisible-errors') continue;
      const ruleId = String(d.code ?? '');
      switch (ruleId) {
        case 'smell/console-log':
          actions.push(this.removeLineAction(doc, d, 'Remove console.* call'));
          break;
        case 'smell/unused-parameters':
          actions.push(this.prefixUnderscoreAction(doc, d));
          break;
        case 'logic/promise-swallowing':
          actions.push(this.addAwaitAction(doc, d));
          break;
        case 'smell/duplicate-code':
          actions.push(this.extractHelperPlaceholder(doc, d));
          break;
      }
      if (ruleId) actions.push(this.suppressNextLineAction(doc, d));
    }
    return actions;
  }

  private removeLineAction(doc: vscode.TextDocument, d: vscode.Diagnostic, title: string): vscode.CodeAction {
    const a = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    a.diagnostics = [d];
    a.edit = new vscode.WorkspaceEdit();
    const line = doc.lineAt(d.range.start.line);
    a.edit.delete(doc.uri, line.rangeIncludingLineBreak);
    a.command = { command: 'invisibleErrors.recordAutoFix', title: 'record', arguments: [] };
    this.metrics.recordAutoFix();
    return a;
  }

  private prefixUnderscoreAction(doc: vscode.TextDocument, d: vscode.Diagnostic): vscode.CodeAction {
    const a = new vscode.CodeAction('Prefix unused parameter with "_"', vscode.CodeActionKind.QuickFix);
    a.diagnostics = [d];
    a.edit = new vscode.WorkspaceEdit();
    const text = doc.getText(d.range);
    a.edit.replace(doc.uri, d.range, '_' + text.split(/[:=,)\s]/)[0]);
    return a;
  }

  private addAwaitAction(doc: vscode.TextDocument, d: vscode.Diagnostic): vscode.CodeAction {
    const a = new vscode.CodeAction('Add `await`', vscode.CodeActionKind.QuickFix);
    a.diagnostics = [d];
    a.edit = new vscode.WorkspaceEdit();
    a.edit.insert(doc.uri, d.range.start, 'await ');
    return a;
  }

  private extractHelperPlaceholder(_doc: vscode.TextDocument, d: vscode.Diagnostic): vscode.CodeAction {
    const a = new vscode.CodeAction('Extract duplicated block to helper…', vscode.CodeActionKind.RefactorExtract);
    a.diagnostics = [d];
    a.command = { command: 'editor.action.codeAction', title: 'Extract', arguments: [{ kind: 'refactor.extract' }] };
    return a;
  }

  private suppressNextLineAction(doc: vscode.TextDocument, d: vscode.Diagnostic): vscode.CodeAction {
    const a = new vscode.CodeAction(`Suppress ${d.code} on this line`, vscode.CodeActionKind.QuickFix);
    a.diagnostics = [d];
    a.edit = new vscode.WorkspaceEdit();
    const startLine = d.range.start.line;
    const indentMatch = doc.lineAt(startLine).text.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0] : '';
    a.edit.insert(doc.uri, new vscode.Position(startLine, 0), `${indent}// invisible-ignore-next-line ${d.code}\n`);
    return a;
  }
}
