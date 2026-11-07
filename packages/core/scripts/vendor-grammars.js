/**
 * Vendor Tree-sitter grammar WASM files into packages/core/grammars/.
 *
 * Grammars are sourced from the `tree-sitter-wasms` package (prebuilt grammar
 * binaries) and the `web-tree-sitter` runtime. Idempotent — safe to run after
 * every `npm install`. The committed grammars/ dir means a clean checkout works
 * without running this, but CI / fresh clones can regenerate it.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..'); // packages/core
const grammarsDir = path.join(root, 'grammars');
fs.mkdirSync(grammarsDir, { recursive: true });

// Workspaces hoist deps to the repo root; also check the package-local copy.
function findFile(rel) {
  const candidates = [
    path.join(root, 'node_modules', rel),
    path.join(root, '..', '..', 'node_modules', rel)
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

const items = [
  ['tree-sitter-wasms/out/tree-sitter-javascript.wasm', 'tree-sitter-javascript.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-typescript.wasm', 'tree-sitter-typescript.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-tsx.wasm', 'tree-sitter-tsx.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-python.wasm', 'tree-sitter-python.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-go.wasm', 'tree-sitter-go.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-rust.wasm', 'tree-sitter-rust.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-java.wasm', 'tree-sitter-java.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-kotlin.wasm', 'tree-sitter-kotlin.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-swift.wasm', 'tree-sitter-swift.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-c.wasm', 'tree-sitter-c.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-cpp.wasm', 'tree-sitter-cpp.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-php.wasm', 'tree-sitter-php.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-c_sharp.wasm', 'tree-sitter-c_sharp.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-ruby.wasm', 'tree-sitter-ruby.wasm'],
  // Dart is handled separately below (the tree-sitter-wasms build is ABI 15).
  ['web-tree-sitter/tree-sitter.wasm', 'tree-sitter.wasm']
];

let copied = 0;
const missing = [];
for (const [rel, dest] of items) {
  const src = findFile(rel);
  if (!src) {
    missing.push(rel);
    continue;
  }
  fs.copyFileSync(src, path.join(grammarsDir, dest));
  copied++;
}

console.log(`vendor-grammars: ${copied}/${items.length} files -> ${grammarsDir}`);
if (missing.length) {
  console.warn('  missing (run `npm i` for tree-sitter-wasms & web-tree-sitter):');
  for (const m of missing) console.warn('   -', m);
}

// ── Dart ─────────────────────────────────────────────────────────────────────
// tree-sitter-wasms ships Dart as ABI 15, which web-tree-sitter 0.22 (ABI 13–14)
// cannot load. The `tree-sitter-dart` npm package ships an ABI 13 build that
// works. It is NOT a dependency (it has a binding.gyp, so installing it would
// trigger a native node-gyp build); instead it is fetched with `npm pack` when
// the vendored copy is missing, and pinned by hash.
const DART_PACKAGE = 'tree-sitter-dart@1.0.0';
const DART_SHA256 = '61085b9b4e9b50132f0c4e25d80adc34ef9aa1dcc8c41e99a04fd6fd5e590252';
const dartDest = path.join(grammarsDir, 'tree-sitter-dart.wasm');

function sha256(file) {
  return require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (fs.existsSync(dartDest) && sha256(dartDest) === DART_SHA256) {
  console.log('vendor-grammars: tree-sitter-dart.wasm present (hash ok)');
} else {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ied-dart-'));
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const tgz = execFileSync(npm, ['pack', DART_PACKAGE, '--silent'], { cwd: tmp, shell: process.platform === 'win32' })
      .toString()
      .trim()
      .split(/\r?\n/)
      .pop();
    execFileSync('tar', ['-xzf', tgz, 'package/tree-sitter-dart.wasm'], { cwd: tmp });
    const extracted = path.join(tmp, 'package', 'tree-sitter-dart.wasm');
    const got = sha256(extracted);
    if (got !== DART_SHA256) throw new Error(`hash mismatch (${got})`);
    fs.copyFileSync(extracted, dartDest);
    console.log(`vendor-grammars: tree-sitter-dart.wasm <- ${DART_PACKAGE}`);
  } catch (err) {
    console.warn(`  could not vendor Dart from ${DART_PACKAGE}: ${err.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
