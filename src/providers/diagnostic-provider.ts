import * as vscode from 'vscode';
import { Issue } from '../rules-engine/types';

export class DiagnosticProvider {
  private collection: vscode.DiagnosticCollection;
  private byFile = new Map<string, Issue[]>();
  /** Hide issues whose confidence is below this. 0 = show everything. */
  private confidenceThreshold = 0.7;
  /** When true, ignores `confidenceThreshold` and shows everything. */
  private showLowConfidence = false;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('invisibleErrors');
  }

  setConfidenceThreshold(t: number): void {
    this.confidenceThreshold = Math.max(0, Math.min(1, t));
    this.refreshAll();
  }

  setShowLowConfidence(v: boolean): void {
    this.showLowConfidence = v;
    this.refreshAll();
  }

  set(filePath: string, issues: Issue[]): void {
    this.byFile.set(filePath, issues);
    this.publish(filePath);
  }

  private publish(filePath: string): void {
    const issues = this.byFile.get(filePath) ?? [];
    const visible = this.showLowConfidence
      ? issues
      : issues.filter(i => (i.confidence ?? 1) >= this.confidenceThreshold);
    this.collection.set(vscode.Uri.file(filePath), visible.map(toDiagnostic));
  }

  private refreshAll(): void {
    for (const file of this.byFile.keys()) this.publish(file);
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

  allIssues(): Issue[] {
    const all: Issue[] = [];
    for (const list of this.byFile.values()) all.push(...list);
    return all;
  }

  issuesFor(filePath: string): Issue[] { return this.byFile.get(filePath) ?? []; }

  dispose(): void { this.collection.dispose(); }
}

function toDiagnostic(i: Issue): vscode.Diagnostic {
  const range = new vscode.Range(
    Math.max(0, i.location.startLine - 1), Math.max(0, i.location.startCol - 1),
    Math.max(0, i.location.endLine - 1),   Math.max(0, i.location.endCol - 1)
  );
  const sev = i.severity === 'error' ? vscode.DiagnosticSeverity.Error
    : i.severity === 'warning' ? vscode.DiagnosticSeverity.Warning
    : vscode.DiagnosticSeverity.Information;
  const d = new vscode.Diagnostic(range, i.message, sev);
  d.source = 'invisible-errors';
  d.code = i.ruleId;
  if (i.trace && i.trace.length > 0) {
    d.relatedInformation = i.trace.map(step => new vscode.DiagnosticRelatedInformation(
      new vscode.Location(
        vscode.Uri.file(step.filePath),
        new vscode.Range(
          Math.max(0, step.location.startLine - 1), Math.max(0, step.location.startCol - 1),
          Math.max(0, step.location.endLine - 1),   Math.max(0, step.location.endCol - 1)
        )
      ),
      step.description
    ));
  }
  return d;
}
