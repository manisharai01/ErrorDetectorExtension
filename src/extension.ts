import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { loadConfig, onConfigChange, ResolvedConfig } from './core/config';
import { CacheManager } from './core/cache-manager';
import { Metrics } from './core/metrics';
import { AnalyzerPool } from './core/analyzer-pool';

import { detectLanguage } from './parser';
import { ContextBuilder } from './rules-engine/context-builder';
import { registerAllRules } from './rules';
import { Issue } from './rules-engine/types';

import { DiagnosticProvider } from './providers/diagnostic-provider';
import { CodeActionProvider } from './providers/code-action-provider';
import { HoverProvider } from './providers/hover-provider';
import { IssueTreeProvider } from './views/tree-provider';
import { StatusBar } from './views/status-bar';
import { DashboardPanel } from './views/webview-panel';

import { toJson } from './reporters/json-reporter';
import { toHtml } from './reporters/html-reporter';
import { toSarif } from './reporters/sarif-reporter';
import { IgnoreMatcher } from './utils/ignore';

const SUPPORTED_LANGS = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'vue'];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  registerAllRules();

  let config = loadConfig();
  const cache = new CacheManager(config.performance.cacheSize);
  const metrics = new Metrics();
  const diagnostics = new DiagnosticProvider();
  const contextBuilder = new ContextBuilder();
  const treeProvider = new IssueTreeProvider(diagnostics);
  const statusBar = new StatusBar(metrics, diagnostics);

  let pool = new AnalyzerPool(config.performance.maxWorkers);
  let cancelToken: vscode.CancellationTokenSource | undefined;
  const debounceTimers = new Map<string, NodeJS.Timeout>();

  context.subscriptions.push(
    diagnostics,
    statusBar,
    vscode.window.registerTreeDataProvider('invisibleErrors.issues', treeProvider),
    vscode.languages.registerCodeActionsProvider(SUPPORTED_LANGS, new CodeActionProvider(metrics)),
    vscode.languages.registerHoverProvider(SUPPORTED_LANGS, new HoverProvider(diagnostics))
  );

  const analyzeDoc = async (doc: vscode.TextDocument, token?: vscode.CancellationToken): Promise<Issue[]> => {
    if (!config.enable) return [];
    if (!SUPPORTED_LANGS.includes(doc.languageId)) return [];
    const lang = detectLanguage(doc.fileName);
    if (!lang) return [];
    if (doc.getText().length > config.maxFileSize) return [];

    const isExcluded = config.exclude.some(g => match(g, doc.fileName));
    if (isExcluded) return [];

    const text = doc.getText();
    const cached = cache.get(doc.fileName, text);
    if (cached) {
      diagnostics.set(doc.fileName, cached);
      treeProvider.refresh();
      statusBar.refresh();
      return cached;
    }
    const start = Date.now();
    const issues = await pool.analyze({
      filePath: doc.fileName,
      sourceText: text,
      language: lang,
      isTestFile: /\.(test|spec)\.[mc]?[jt]sx?$/.test(doc.fileName) || /[\\/](?:test|tests|__tests__)[\\/]/.test(doc.fileName),
      ruleSeverities: config.rules,
      options: { anyTypeThreshold: config.anyTypeThreshold, allowConsoleInCli: config.allowConsoleInCli }
    }, token);

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const infos = issues.filter(i => i.severity === 'info').length;

    diagnostics.set(doc.fileName, issues);
    cache.set(doc.fileName, text, issues);
    metrics.recordFile({
      filePath: doc.fileName,
      loc: text.split('\n').length,
      durationMs: Date.now() - start,
      issueCount: issues.length,
      errors, warnings, infos
    });
    treeProvider.refresh();
    statusBar.refresh();
    return issues;
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
    vscode.workspace.onDidOpenTextDocument(d => analyzeDoc(d)),
    vscode.workspace.onDidSaveTextDocument(d => { if (config.runOnSave) analyzeDoc(d); }),
    vscode.workspace.onDidChangeTextDocument(e => scheduleAnalyze(e.document)),
    vscode.workspace.onDidCloseTextDocument(d => diagnostics.clear(d.fileName)),
    onConfigChange(async (c) => {
      config = c;
      cache.resize(c.performance.cacheSize);
      await pool.dispose();
      pool = new AnalyzerPool(c.performance.maxWorkers);
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
          const folders = vscode.workspace.workspaceFolders ?? [];
          for (const f of folders) {
            const ignore = IgnoreMatcher.fromFiles(f.uri.fsPath);
            const files = await vscode.workspace.findFiles(
              new vscode.RelativePattern(f, '**/*.{js,jsx,ts,tsx,vue,mjs,cjs}'),
              '{**/node_modules/**,**/dist/**,**/out/**,**/build/**}'
            );
            let i = 0;
            for (const uri of files) {
              if (tk.isCancellationRequested) return;
              const rel = path.relative(f.uri.fsPath, uri.fsPath);
              if (ignore.isIgnored(rel)) continue;
              if (config.exclude.some(g => match(g, uri.fsPath))) continue;
              try {
                const doc = await vscode.workspace.openTextDocument(uri);
                await analyzeDoc(doc, tk);
              } catch { /* skip unreadable */ }
              i++;
              progress.report({ message: `${i}/${files.length}`, increment: 100 / files.length });
            }
          }
          // cross-file passes
          for (const [file] of contextBuilder.context().fileHashes) {
            // No-op: hook for future cross-file rule emission.
            void file;
          }
        }
      );
      DashboardPanel.show(context, metrics, diagnostics);
    }),
    vscode.commands.registerCommand('invisibleErrors.cancelAnalysis', () => cancelToken?.cancel()),
    vscode.commands.registerCommand('invisibleErrors.clearCache', () => {
      cache.clear();
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
      const content = choice === 'JSON' ? toJson(issues) : choice === 'HTML' ? toHtml(issues, metrics) : toSarif(issues);
      const target = await vscode.window.showSaveDialog({ filters: { Reports: [ext] }, saveLabel: `Save ${choice} report` });
      if (!target) return;
      await fs.promises.writeFile(target.fsPath, content, 'utf8');
      vscode.window.showInformationMessage(`Invisible Errors report saved to ${path.basename(target.fsPath)}.`);
    }),
    vscode.commands.registerCommand('invisibleErrors.recordAutoFix', () => { metrics.recordAutoFix(); statusBar.refresh(); })
  );
}

export async function deactivate(): Promise<void> {
  // pool disposal handled by VS Code's subscription teardown of registered disposables;
  // explicit pool reference isn't held across activations.
}

function match(glob: string, file: string): boolean {
  const re = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '::DS::').replace(/\*/g, '[^/\\\\]*').replace(/::DS::/g, '.*').replace(/\?/g, '.') + '$');
  return re.test(file.replace(/\\/g, '/'));
}
