/**
 * Bundle the extension for packaging (`npm run package`).
 *
 * The extension depends on the @ied/core and @ied/lsp workspace packages, which
 * a .vsix cannot pull from npm, so everything is bundled with esbuild:
 *
 *   dist/extension.js  — the extension (only `vscode` stays external)
 *   dist/server.js     — the @ied/lsp server, for the `invisibleErrors.useLsp` mode
 *   grammars/*.wasm    — the Tree-sitter runtime + grammars, copied from
 *                        @ied/core (the parser finds them by walking up from dist/)
 *
 * During development (F5) `tsc -b` writes unbundled files to the same dist/
 * paths and the grammars are found in packages/core/grammars instead.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');

async function main() {
  const common = {
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: false,
    minify: true,
    logLevel: 'warning'
  };
  await esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'src', 'extension.ts')],
    outfile: path.join(root, 'dist', 'extension.js'),
    external: ['vscode']
  });
  await esbuild.build({
    ...common,
    entryPoints: [path.join(root, '..', 'lsp', 'src', 'server.ts')],
    outfile: path.join(root, 'dist', 'server.js')
  });

  const from = path.join(root, '..', 'core', 'grammars');
  const to = path.join(root, 'grammars');
  fs.mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const f of fs.readdirSync(from)) {
    if (!f.endsWith('.wasm')) continue;
    fs.copyFileSync(path.join(from, f), path.join(to, f));
    copied++;
  }
  console.log(`bundle: dist/extension.js, dist/server.js, ${copied} grammar files -> grammars/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
