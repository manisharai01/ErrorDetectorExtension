/**
 * Optional LSP-client mode. When `invisibleErrors.useLsp` is enabled, the
 * extension launches the @ied/lsp server (stdio) and lets it provide
 * diagnostics, code actions, and hovers — instead of analyzing in-process.
 * Used for parity testing and for sharing one engine with other editors.
 */
import * as vscode from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

const DOCUMENT_SELECTOR = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'vue',
  'python',
  'go'
].map((language) => ({ scheme: 'file', language }));

export function startLspClient(context: vscode.ExtensionContext): void {
  // Resolve the compiled server entry from the @ied/lsp package.
  const serverModule = require.resolve('@ied/lsp');
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio, args: ['--stdio'] },
    debug: { module: serverModule, transport: TransportKind.stdio, args: ['--stdio'] }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: DOCUMENT_SELECTOR
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
