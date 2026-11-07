// Editor coverage tests: every language the engine supports must reach the
// extension (activation, document selector, workspace scan). Plain Node — the
// module under test has no `vscode` import.
// Run: npm run build -w packages/vscode && node test/languages.test.cjs
const assert = require('assert');
const { ALL_LANGUAGES, SOURCE_EXTENSIONS } = require('@ied/core');
const {
  LANGUAGE_BY_ID,
  LANGUAGE_IDS,
  SOURCE_GLOB,
  DOCUMENT_SELECTOR,
  iedLanguageFor,
  excludeGlob
} = require('../dist/languages.js');
const manifest = require('../package.json');

let pass = 0,
  fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok   -', name);
    pass++;
  } catch (e) {
    console.error('  FAIL -', name, '\n        ', e.message);
    fail++;
  }
}

const doc = (fileName, languageId = 'plaintext', scheme = 'file') => ({ fileName, languageId, uri: { scheme } });

test('every engine language has a VS Code language id', () => {
  const covered = new Set(Object.values(LANGUAGE_BY_ID));
  const missing = ALL_LANGUAGES.filter((l) => !covered.has(l));
  assert.deepStrictEqual(missing, []);
});

test('the workspace-scan glob covers every analyzable extension', () => {
  for (const ext of SOURCE_EXTENSIONS) assert.ok(SOURCE_GLOB.includes(ext.slice(1)), `missing ${ext}`);
});

test('the manifest activates for every language id', () => {
  for (const id of LANGUAGE_IDS) {
    assert.ok(manifest.activationEvents.includes(`onLanguage:${id}`), `missing onLanguage:${id}`);
  }
  assert.ok(manifest.activationEvents.includes('onStartupFinished'));
});

test('the document selector matches by file pattern too (no language extension needed)', () => {
  assert.ok(DOCUMENT_SELECTOR.some((s) => s.pattern === SOURCE_GLOB));
});

test('files are recognised by extension even when VS Code calls them plaintext', () => {
  assert.strictEqual(iedLanguageFor(doc('/src/App.kt')), 'kotlin');
  assert.strictEqual(iedLanguageFor(doc('/lib/main.dart')), 'dart');
  assert.strictEqual(iedLanguageFor(doc('/x/Program.cs')), 'csharp');
  assert.strictEqual(iedLanguageFor(doc('/x/README.md', 'markdown')), null);
});

test('untitled editors fall back to the language id; non-file schemes are skipped', () => {
  assert.strictEqual(iedLanguageFor(doc('Untitled-1', 'ruby', 'untitled')), 'ruby');
  assert.strictEqual(iedLanguageFor(doc('/src/a.ts', 'typescript', 'git')), null);
});

test('exclude settings become a findFiles glob', () => {
  assert.strictEqual(excludeGlob([]), undefined);
  assert.strictEqual(excludeGlob(['**/node_modules/**']), '**/node_modules/**');
  assert.strictEqual(excludeGlob(['**/a/**', '**/b/**']), '{**/a/**,**/b/**}');
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
