/**
 * Regenerate docs/RULES.md from the rule registry, so the catalogue in the docs
 * always matches what the engine ships. Run after `npm run build`:
 *
 *   npm run docs:rules
 */
const fs = require('fs');
const path = require('path');
const { registerAllRules, registry, PROJECT_RULES, ALL_LANGUAGES } = require('../packages/core/dist');

registerAllRules();

const LANGUAGE_LABEL = {
  javascript: 'JS',
  typescript: 'TS',
  jsx: 'JSX',
  tsx: 'TSX',
  vue: 'Vue',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  cpp: 'C++',
  php: 'PHP',
  csharp: 'C#',
  ruby: 'Ruby',
  dart: 'Dart'
};

function languages(langs) {
  if (ALL_LANGUAGES.every((l) => langs.includes(l))) return 'all';
  const js = ['javascript', 'typescript', 'jsx', 'tsx', 'vue'];
  const rest = langs.filter((l) => !js.includes(l)).map((l) => LANGUAGE_LABEL[l]);
  const jsPart = js.every((l) => langs.includes(l))
    ? ['JS/TS/Vue']
    : langs.filter((l) => js.includes(l)).map((l) => LANGUAGE_LABEL[l]);
  return [...jsPart, ...rest].join(', ');
}

const cell = (s) => String(s).replace(/\|/g, '\\|');
const rules = registry.all();
const lines = [
  '# Rule catalogue',
  '',
  `${rules.length} per-file rules and ${PROJECT_RULES.length} whole-program checks.`,
  'Generated from the registry by `npm run docs:rules` — do not edit by hand.',
  '',
  'Configure any rule in `.iedrc.json` (`"rules": { "IED-Q003": "off" }`) or',
  'suppress one occurrence with `// ied-disable-next-line <id> — reason`.',
  '',
  '## Per-file rules',
  '',
  '| ID | Name | Category | Severity | Languages | What it finds |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rules.map(
    (r) =>
      `| ${r.id} | ${r.name} | ${r.category} | ${r.severity} | ${languages(r.languages)} | ${cell(r.description)}${r.fix ? ' *(quick fix)*' : ''} |`
  ),
  '',
  '## Whole-program checks (`ied project`, VS Code "Check Project")',
  '',
  '| ID | Name | Category | Severity | What it finds |',
  '| --- | --- | --- | --- | --- |',
  ...PROJECT_RULES.map((r) => `| ${r.id} | ${r.name} | ${r.category} | ${r.severity} | ${cell(r.description)} |`),
  ''
];

const out = path.join(__dirname, '..', 'docs', 'RULES.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\n'));
console.log(`wrote ${path.relative(process.cwd(), out)} (${rules.length} rules + ${PROJECT_RULES.length} project checks)`);
