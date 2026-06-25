import * as vscode from 'vscode';
import { Metrics } from '../metrics';
import { DiagnosticProvider } from '../providers/diagnostic-provider';

export class StatusBar {
  private item: vscode.StatusBarItem;
  constructor(private metrics: Metrics, private diagnostics: DiagnosticProvider) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'invisibleErrors.showDashboard';
    this.refresh();
    this.item.show();
  }

  refresh(): void {
    const { error, warning, info } = this.metrics.totalsBySeverity();
    const score = this.metrics.qualityScore();
    const total = error + warning + info || this.diagnostics.allIssues().length;
    const icon = error > 0 ? '$(error)' : warning > 0 ? '$(warning)' : '$(check)';
    this.item.text = `${icon} Invisible: ${total} issues · score ${score}`;
    this.item.tooltip = `Errors: ${error}  Warnings: ${warning}  Info: ${info}\nClick to open dashboard.`;
  }

  setBusy(message: string): void { this.item.text = `$(sync~spin) Invisible: ${message}`; }

  dispose(): void { this.item.dispose(); }
}
