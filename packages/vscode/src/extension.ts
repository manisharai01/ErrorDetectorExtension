import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import {
  registerAllRules,
  Analyzer,
  Severity,
  Diagnostic,
  toJson,
  toHtml,
  toSarif
} from '@ied/core';

import { loadConfig, onConfigChange, ExtensionConfig } from './config';
import { Metrics } from './metrics';
import { DiagnosticProvider } from './providers/diagnostic-provider';
import { CodeActionProvider } from './providers/code-action-provider';
import { HoverProvider } from './providers/hover-provider';
import { IssueTreeProvider } from './views/tree-provider';
import { StatusBar } from './views/status-bar';
import { DashboardPanel } from './views/webview-panel';

const SUPPORTED_LANGS = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'vue'];

let activeAnalyzer: Analyzer | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  registerAllRules();

  let config: ExtensionConfig = loadConfig();
  let analyzer = new Analyzer(config);
  activeAnalyzer = analyzer;

  const metrics = new Metrics();
  const diagnostics = new DiagnosticProvider();
  const treeProvider = new IssueTreeProvider(diagnostics);
  const statusBar = new StatusBar(metrics, diagnostics);

  let cancelToken: vscode.CancellationTokenSource | undefined;
  const debounceTimers = new Map<string, NodeJS.Timeout>();

  context.subscriptions.push(
    diagnostics,
    statusBar,
    vscode.window.registerTreeDataProvider('invisibleErrors.issues', treeProvider),
    vscode.languages.registerCodeActionsProvider(SUPPORTED_LANGS, new CodeActionProvider(metrics, diagnostics)),
    vscode.languages.registerHoverProvider(SUPPORTED_LANGS, new HoverProvider(diagnostics))
  );

  const analyzeDoc = async (doc: vscode.TextDocument, _token?: vscode.CancellationToken): Promise<Diagnostic[]> => {
    if (!config.enable) return [];
    if (!SUPPORTED_LANGS.includes(doc.languageId)) return [];
    const text = doc.getText();
    if (text.length > config.maxFileSize) return [];

    const r = await analyzer.analyzeFile({ filePath: doc.fileName, content: text });

    const errors = r.diagnostics.filter(d => d.severity === Severity.Error).length;
    const warnings = r.diagnostics.filter(d => d.severity === Severity.Warning).length;
    const infos = r.diagnostics.filter(d => d.severity === Severity.Info).length;

    diagnostics.set(doc.fileName, r.diagnostics);
    metrics.recordFile({
      filePath: doc.fileName,
      loc: doc.lineCount,
      durationMs: r.durationMs,
      issueCount: r.diagnostics.length,
      errors, warnings, infos
    });
    treeProvider.refresh();
    statusBar.refresh();
    return r.diagnostics;
  };

  const scheduleAnalyze = (doc: vscode.TextDocument) => {
    if (!config.runOnType) return;
    const key = doc.fileName;
    const prev = debounceTimers.get(key);
    if (prev) clearTimeout(prev);
    debounceTimers.set(key, setTimeout(() => {
      debounceTimers.delete(key);
      analyzeDoc(doc).catch(() => { /* swallow */ });
    }, config.debounceMs));
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(d => { analyzeDoc(d).catch(() => undefined); }),
    vscode.workspace.onDidSaveTextDocument(d => { if (config.runOnSave) analyzeDoc(d).catch(() => undefined); }),
    vscode.workspace.onDidChangeTextDocument(e => scheduleAnalyze(e.document)),
    vscode.workspace.onDidCloseTextDocument(d => diagnostics.clear(d.fileName)),
    onConfigChange((c) => {
      config = c;
      analyzer.dispose();
      analyzer = new Analyzer(config);
      activeAnalyzer = analyzer;
    })
  );

  // Analyse already-open editors on activation.
  for (const doc of vscode.workspace.textDocuments) analyzeDoc(doc).catch(() => undefined);

  context.subscriptions.push(
    vscode.commands.registerCommand('invisibleErrors.analyzeFile', async () => {
      const ed = vscode.window.activeTextEditor;
      if (ed) await analyzeDoc(ed.document);
    }),
    vscode.commands.registerCommand('invisibleErrors.analyzeWorkspace', async () => {
      cancelToken?.cancel();
      cancelToken = new vscode.CancellationTokenSource();
      const tk = cancelToken.token;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Invisible Errors: analysing workspace…', cancellable: true },
        async (progress, progressToken) => {
          progressToken.onCancellationRequested(() => cancelToken?.cancel());
          const files = await vscode.workspace.findFiles(
            '**/*.{js,jsx,ts,tsx,vue}',
            '{**/node_modules/**,**/dist/**,**/out/**,**/build/**}'
          );
          let i = 0;
          for (const uri of files) {
            if (tk.isCancellationRequested) return;
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              await analyzeDoc(doc, tk);
            } catch { /* skip unreadable */ }
            i++;
            progress.report({ message: `${i}/${files.length}`, increment: 100 / files.length });
          }
        }
      );
      DashboardPanel.show(context, metrics, diagnostics);
    }),
    vscode.commands.registerCommand('invisibleErrors.cancelAnalysis', () => cancelToken?.cancel()),
    vscode.commands.registerCommand('invisibleErrors.clearCache', () => {
      metrics.clear();
      diagnostics.clear();
      treeProvider.refresh();
      statusBar.refresh();
      vscode.window.showInformationMessage('Invisible Errors: cache cleared.');
    }),
    vscode.commands.registerCommand('invisibleErrors.showDashboard', () => DashboardPanel.show(context, metrics, diagnostics)),
    vscode.commands.registerCommand('invisibleErrors.exportReport', async () => {
      const choice = await vscode.window.showQuickPick(['JSON', 'HTML', 'SARIF'], { placeHolder: 'Select report format' });
      if (!choice) return;
      const issues = diagnostics.allIssues();
      const ext = choice === 'JSON' ? 'json' : choice === 'HTML' ? 'html' : 'sarif';
      const content = choice === 'JSON' ? toJson(issues)
        : choice === 'HTML' ? toHtml(issues, { score: metrics.qualityScore() })
        : toSarif(issues);
      const target = await vscode.window.showSaveDialog({ filters: { Reports: [ext] }, saveLabel: `Save ${choice} report` });
      if (!target) return;
      await fs.promises.writeFile(target.fsPath, content, 'utf8');
      vscode.window.showInformationMessage(`Invisible Errors report saved to ${path.basename(target.fsPath)}.`);
    }),
    vscode.commands.registerCommand('invisibleErrors.recordAutoFix', () => { metrics.recordAutoFix(); statusBar.refresh(); })
  );
}

export async function deactivate(): Promise<void> {
  activeAnalyzer?.dispose();
  activeAnalyzer = undefined;
}
