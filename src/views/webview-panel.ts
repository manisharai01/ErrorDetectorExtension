import * as vscode from 'vscode';
import { Metrics } from '../core/metrics';
import { DiagnosticProvider } from '../providers/diagnostic-provider';
import { toHtml } from '../reporters/html-reporter';

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
    const html = toHtml(this.diagnostics.allIssues(), this.metrics);
    this.panel.webview.html = html;
  }
}
