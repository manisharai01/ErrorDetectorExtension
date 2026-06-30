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
