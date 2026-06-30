/**
 * @ied/lsp — Language Server exposing the Invisible Errors Detector core engine
 * over LSP, for any LSP-capable editor (Neovim, Sublime, JetBrains, VS Code).
 *
 * Usage:
 *   ied-lsp --stdio          (default — communicate over stdin/stdout)
 *   ied-lsp --socket=PORT    (listen on a TCP socket)
 */
import * as net from 'net';
import { fileURLToPath } from 'url';
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  type Connection,
  type InitializeParams,
  type InitializeResult
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { IedSession } from './handlers/config';
import { serverCapabilities } from './capabilities';
import { createDiagnosticsRunner } from './handlers/diagnostics';
import { provideCodeActions } from './handlers/code-action';
import { provideHover } from './handlers/hover';

function rootFromParams(params: InitializeParams): string {
  const folder = params.workspaceFolders?.[0]?.uri;
  if (folder) {
    try {
      return fileURLToPath(folder);
    } catch {
      /* fall through */
    }
  }
  if (params.rootUri) {
    try {
      return fileURLToPath(params.rootUri);
    } catch {
      /* fall through */
    }
  }
  return params.rootPath ?? process.cwd();
}

function startServer(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  let session: IedSession | undefined;
  let diagnostics: ReturnType<typeof createDiagnosticsRunner> | undefined;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    session = new IedSession(rootFromParams(params));
    diagnostics = createDiagnosticsRunner(connection, session);
    connection.console.info(`ied-lsp: initialized at ${session.rootDir}`);
    return { capabilities: serverCapabilities() };
  });

  connection.onDidChangeConfiguration(() => {
    session?.reload();
    for (const doc of documents.all()) diagnostics?.schedule(doc);
  });

  documents.onDidOpen((e) => void diagnostics?.analyzeNow(e.document));
  documents.onDidChangeContent((e) => diagnostics?.schedule(e.document));
  documents.onDidSave((e) => void diagnostics?.analyzeNow(e.document));
  documents.onDidClose((e) => diagnostics?.clear(e.document.uri));

  connection.onCodeAction(async (params) =>
    session ? provideCodeActions(params, documents, session) : []
  );
  connection.onHover(async (params) =>
    session ? provideHover(params, documents, session) : null
  );

  documents.listen(connection);
  connection.listen();
}

// ── Transport selection ──────────────────────────────────────────────────────
const socketArg = process.argv.find((a) => a.startsWith('--socket'));
if (socketArg) {
  const port = Number(socketArg.split('=')[1] ?? '0');
  net
    .createServer((socket) => startServer(createConnection(socket, socket)))
    .listen(port, () => {
      process.stderr.write(`ied-lsp: listening on socket port ${port}\n`);
    });
} else {
  // Default: stdio.
  startServer(createConnection(ProposedFeatures.all));
}
