import * as vscode from 'vscode';
import { Severity } from '../rules-engine/types';

export interface PerfConfig {
  parallelAnalysis: boolean;
  maxWorkers: number;
  cacheSize: number;
}

export interface ResolvedConfig {
  enable: boolean;
  runOnSave: boolean;
  runOnType: boolean;
  debounceMs: number;
  maxFileSize: number;
  rules: Record<string, Severity>;
  exclude: string[];
  performance: PerfConfig;
  anyTypeThreshold: number;
  allowConsoleInCli: boolean;
}

const SECTION = 'invisibleErrors';

export function loadConfig(scope?: vscode.ConfigurationScope): ResolvedConfig {
  const c = vscode.workspace.getConfiguration(SECTION, scope);
  return {
    enable: c.get<boolean>('enable', true),
    runOnSave: c.get<boolean>('runOnSave', true),
    runOnType: c.get<boolean>('runOnType', true),
    debounceMs: c.get<number>('debounceMs', 400),
    maxFileSize: c.get<number>('maxFileSize', 1_000_000),
    rules: c.get<Record<string, Severity>>('rules', {}),
    exclude: c.get<string[]>('exclude', []),
    performance: c.get<PerfConfig>('performance', { parallelAnalysis: true, maxWorkers: 4, cacheSize: 200 }),
    anyTypeThreshold: c.get<number>('anyTypeThreshold', 5),
    allowConsoleInCli: c.get<boolean>('allowConsoleInCli', true)
  };
}

export function onConfigChange(cb: (cfg: ResolvedConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(SECTION)) cb(loadConfig());
  });
}
