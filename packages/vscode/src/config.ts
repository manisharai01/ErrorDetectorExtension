import * as vscode from 'vscode';
import { resolveConfig, ResolvedConfig, RuleSetting } from '@ied/core';

/**
 * Runtime config: a fully-resolved @ied/core config plus the VS Code runtime
 * flags that drive when/how analysis is triggered.
 */
export interface ExtensionConfig extends ResolvedConfig {
  enable: boolean;
  runOnSave: boolean;
  runOnType: boolean;
  debounceMs: number;
  maxFileSize: number;
}

export function loadConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('invisibleErrors');
  const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  const rawRules = cfg.get<Record<string, 'off' | 'info' | 'warning' | 'error'>>('rules', {});
  const rules: Record<string, RuleSetting> = {};
  for (const [id, sev] of Object.entries(rawRules)) rules[id] = sev;

  const exclude = cfg.get<string[]>('exclude', []);
  const resolved = resolveConfig({ rules, exclude }, rootDir);

  return {
    ...resolved,
    enable: cfg.get<boolean>('enable', true),
    runOnSave: cfg.get<boolean>('runOnSave', true),
    runOnType: cfg.get<boolean>('runOnType', true),
    debounceMs: cfg.get<number>('debounceMs', 400),
    maxFileSize: cfg.get<number>('maxFileSize', 1000000)
  };
}

export function onConfigChange(cb: (config: ExtensionConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('invisibleErrors')) cb(loadConfig());
  });
}
