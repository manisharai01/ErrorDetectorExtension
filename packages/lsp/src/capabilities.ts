/** Declared server capabilities returned from onInitialize. */
import {
  TextDocumentSyncKind,
  CodeActionKind,
  type ServerCapabilities
} from 'vscode-languageserver/node';

export function serverCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Incremental,
      save: { includeText: false }
    },
    codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
    hoverProvider: true
  };
}
