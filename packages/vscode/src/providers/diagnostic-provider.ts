import * as vscode from 'vscode';
import { Diagnostic, Severity } from '@ied/core';

export class DiagnosticProvider {
  private collection: vscode.DiagnosticCollection;
  private byFile = new Map<string, Diagnostic[]>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('invisibleErrors');
  }

  set(filePath: string, diags: Diagnostic[]): void {
    this.byFile.set(filePath, diags);
    this.collection.set(vscode.Uri.file(filePath), diags.map(d => this.toDiagnostic(d)));
  }

  clear(filePath?: string): void {
    if (filePath) {
      this.byFile.delete(filePath);
      this.collection.delete(vscode.Uri.file(filePath));
    } else {
      this.byFile.clear();
      this.collection.clear();
    }
  }

  allIssues(): Diagnostic[] {
    const all: Diagnostic[] = [];
    for (const list of this.byFile.values()) all.push(...list);
    return all;
  }

  issuesFor(filePath: string): Diagnostic[] { return this.byFile.get(filePath) ?? []; }

  dispose(): void { this.collection.dispose(); }

  private toDiagnostic(d: Diagnostic): vscode.Diagnostic {
    const range = new vscode.Range(
      d.range.start.row, d.range.start.column,
      d.range.end.row, d.range.end.column
    );
    const sev = d.severity === Severity.Error ? vscode.DiagnosticSeverity.Error
      : d.severity === Severity.Warning ? vscode.DiagnosticSeverity.Warning
      : d.severity === Severity.Hint ? vscode.DiagnosticSeverity.Hint
      : vscode.DiagnosticSeverity.Information;
    const diag = new vscode.Diagnostic(range, d.message, sev);
    diag.source = 'invisible-errors';
    diag.code = d.ruleId;
    if (d.related && d.related.length > 0) {
      diag.relatedInformation = d.related.map(r => new vscode.DiagnosticRelatedInformation(
        new vscode.Location(
          vscode.Uri.file(d.filePath),
          new vscode.Range(r.range.start.row, r.range.start.column, r.range.end.row, r.range.end.column)
        ),
        r.message
      ));
    }
    return diag;
  }
}
