// LSP integration test: spawn the built server over stdio, drive a minimal
// LSP session (initialize -> initialized -> didOpen), and assert that
// publishDiagnostics arrives containing IED-Q001 and IED-S001.
// Run: node test/integration.test.mjs
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverBin = path.join(here, '..', 'bin', 'ied-lsp.js');
const TIMEOUT_MS = 10000;

function encode(msg) {
  const json = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
}

const child = spawn('node', [serverBin, '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });

let buffer = Buffer.alloc(0);
const notifications = [];
const handlers = [];

function pump() {
  // Parse as many complete LSP messages as are buffered.
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const len = Number(m[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + len) return; // wait for more
    const body = buffer.slice(start, start + len).toString('utf8');
    buffer = buffer.slice(start + len);
    try {
      const msg = JSON.parse(body);
      notifications.push(msg);
      for (const h of handlers) h(msg);
    } catch {
      /* ignore parse errors */
    }
  }
}

child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  pump();
});
child.stderr.on('data', () => {
  /* server logs; ignore */
});

function send(msg) {
  child.stdin.write(encode(msg));
}

function waitFor(predicate, label) {
  return new Promise((resolve, reject) => {
    const existing = notifications.find(predicate);
    if (existing) return resolve(existing);
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), TIMEOUT_MS);
    handlers.push((msg) => {
      if (predicate(msg)) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

async function main() {
  const root = pathToFileURL(path.join(here, '..')).toString();

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { processId: process.pid, rootUri: root, capabilities: {}, workspaceFolders: [{ uri: root, name: 'lsp' }] }
  });
  await waitFor((m) => m.id === 1 && m.result, 'initialize result');

  send({ jsonrpc: '2.0', method: 'initialized', params: {} });

  const docUri = pathToFileURL(path.join(here, '..', 'sample.ts')).toString();
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: docUri,
        languageId: 'typescript',
        version: 1,
        text: 'console.log("x");\nconst k = "AKIAIOSFODNN7EXAMPLE12";\n'
      }
    }
  });

  const diag = await waitFor(
    (m) => m.method === 'textDocument/publishDiagnostics' && m.params?.uri === docUri && m.params.diagnostics.length > 0,
    'publishDiagnostics'
  );

  const codes = diag.params.diagnostics.map((d) => d.code);
  const ok = codes.includes('IED-Q001') && codes.includes('IED-S001');

  child.kill();
  if (!ok) {
    console.error('  FAIL - expected IED-Q001 and IED-S001, got:', codes.join(', '));
    process.exit(1);
  }
  console.log('  ok   - LSP publishes diagnostics on didOpen:', codes.join(', '));
  console.log('\n  1 passed, 0 failed\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('  FAIL -', err.message);
  child.kill();
  process.exit(1);
});
