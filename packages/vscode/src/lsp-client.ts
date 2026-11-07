/**
 * Optional LSP-client mode. When `invisibleErrors.useLsp` is enabled, the
 * extension launches the @ied/lsp server (stdio) and lets it provide
 * diagnostics, code actions, and hovers — instead of analyzing in-process.
 * Used for parity testing and for sharing one engine with other editors.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions
} from 'vscode-languageclient/node';
import { DOCUMENT_SELECTOR } from './languages';

let client: LanguageClient | undefined;

/**
 * The server entry: the copy bundled into the packaged extension
 * (`dist/server.js`), or the @ied/lsp workspace package when running from the
 * monorepo (F5).
 */
function serverModulePath(context: vscode.ExtensionContext): string {
  const bundled = context.asAbsolutePath(path.join('dist', 'server.js'));
  return fs.existsSync(bundled) ? bundled : require.resolve('@ied/lsp');
}

export function startLspClient(context: vscode.ExtensionContext): void {
  const serverModule = serverModulePath(context);
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio, args: ['--stdio'] },
    debug: { module: serverModule, transport: TransportKind.stdio, args: ['--stdio'] }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [...DOCUMENT_SELECTOR]
  };

  client = new LanguageClient(
    'invisibleErrorsLsp',
    'Invisible Errors (LSP)',
    serverOptions,
    clientOptions
  );
  void client.start();
  context.subscriptions.push({ dispose: () => void client?.stop() });
}

export async function stopLspClient(): Promise<void> {
  await client?.stop();
  client = undefined;
}
