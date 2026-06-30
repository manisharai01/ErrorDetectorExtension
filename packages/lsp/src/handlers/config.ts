/**
 * Shared analysis session: owns the resolved config and the Analyzer, reloads
 * them when the workspace configuration changes, and decides which documents
 * are in scope (by file extension via the core's language detection).
 */
import { fileURLToPath } from 'url';
import {
  Analyzer,
  loadConfig,
  registerAllRules,
  languageFromPath,
  type ResolvedConfig
} from '@ied/core';

export class IedSession {
  readonly rootDir: string;
  private config: ResolvedConfig;
  private analyzer: Analyzer;

  constructor(rootDir: string) {
    registerAllRules();
    this.rootDir = rootDir;
    this.config = loadConfig(rootDir);
    this.analyzer = new Analyzer(this.config);
  }

  /** Re-read .iedrc and rebuild the analyzer (on workspace/didChangeConfiguration). */
  reload(): void {
    this.config = loadConfig(this.rootDir);
    this.analyzer.dispose();
    this.analyzer = new Analyzer(this.config);
  }

  get current(): Analyzer {
    return this.analyzer;
  }

  /** True when the document's path maps to a supported language. */
  supports(uri: string): boolean {
    try {
      return languageFromPath(fileURLToPath(uri)) !== null;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.analyzer.dispose();
  }
}
