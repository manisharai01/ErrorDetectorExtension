import * as vscode from 'vscode';
import { toHtml } from '@ied/core';
import { Metrics } from '../metrics';
import { DiagnosticProvider } from '../providers/diagnostic-provider';

export class DashboardPanel {
  private static current: DashboardPanel | undefined;

  static show(ctx: vscode.ExtensionContext, metrics: Metrics, diagnostics: DiagnosticProvider): void {
    if (this.current) {
      this.current.panel.reveal(vscode.ViewColumn.Active);
      this.current.update();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'invisibleErrors.dashboard',
      'Invisible Errors — Dashboard',
      vscode.ViewColumn.Active,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    this.current = new DashboardPanel(panel, metrics, diagnostics);
    panel.onDidDispose(() => { this.current = undefined; }, null, ctx.subscriptions);
  }

  private constructor(
    private panel: vscode.WebviewPanel,
    private metrics: Metrics,
    private diagnostics: DiagnosticProvider
  ) { this.update(); }

  update(): void {
    this.panel.webview.html = toHtml(this.diagnostics.allIssues(), { score: this.metrics.qualityScore() });
  }
}
