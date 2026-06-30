/**
 * Diagnostics: analyze a document (debounced 400ms, matching the VS Code
 * extension) and publish LSP diagnostics. Maps core `Diagnostic` (0-based
 * row/column, string severity) to the LSP shape.
 */
import { fileURLToPath } from 'url';
import {
  DiagnosticSeverity,
  type Connection,
  type Diagnostic as LspDiagnostic,
  type Range
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic } from '@ied/core';
import type { IedSession } from './config';

const DEBOUNCE_MS = 400;

function toLspSeverity(s: string): DiagnosticSeverity {
  switch (s) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warning':
      return DiagnosticSeverity.Warning;
    case 'hint':
      return DiagnosticSeverity.Hint;
    default:
      return DiagnosticSeverity.Information;
  }
}

function toLspRange(d: Diagnostic): Range {
  return {
    start: { line: d.range.start.row, character: d.range.start.column },
    end: { line: d.range.end.row, character: d.range.end.column }
  };
}

export interface DiagnosticsRunner {
  /** Debounced analyze + publish. */
  schedule(doc: TextDocument): void;
  /** Analyze + publish immediately (open/save). */
  analyzeNow(doc: TextDocument): Promise<void>;
  /** Cancel any pending run and clear published diagnostics for a URI. */
  clear(uri: string): void;
}

export function createDiagnosticsRunner(connection: Connection, session: IedSession): DiagnosticsRunner {
  const timers = new Map<string, NodeJS.Timeout>();

  async function analyzeNow(doc: TextDocument): Promise<void> {
    if (!session.supports(doc.uri)) return;
    try {
      const result = await session.current.analyzeFile({
        filePath: fileURLToPath(doc.uri),
        content: doc.getText()
      });
      const diagnostics: LspDiagnostic[] = result.diagnostics.map((d) => ({
        range: toLspRange(d),
        severity: toLspSeverity(d.severity),
        code: d.ruleId,
        source: 'ied',
        message: d.message
      }));
      connection.sendDiagnostics({ uri: doc.uri, diagnostics });
    } catch (err) {
      connection.console.error(`ied: analysis failed for ${doc.uri}: ${(err as Error).message}`);
    }
  }

  return {
    analyzeNow,
    schedule(doc: TextDocument): void {
      const key = doc.uri;
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void analyzeNow(doc);
        }, DEBOUNCE_MS)
      );
    },
    clear(uri: string): void {
      const t = timers.get(uri);
      if (t) {
        clearTimeout(t);
        timers.delete(uri);
      }
      connection.sendDiagnostics({ uri, diagnostics: [] });
    }
  };
}
