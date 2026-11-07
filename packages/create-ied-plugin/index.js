#!/usr/bin/env node
/**
 * create-ied-plugin — scaffold a new Invisible Errors Detector rule plugin.
 *
 *   npx create-ied-plugin ied-rules-acme
 *
 * Produces a ready-to-publish npm package that default-exports an array of
 * Rule objects. Add it to a project's `.iedrc.json` "plugins" array and the
 * engine loads its rules alongside the built-ins.
 */
const fs = require('fs');
const path = require('path');

const name = process.argv[2];
if (!name) {
  console.error('Usage: create-ied-plugin <package-name>');
  process.exit(1);
}

const dir = path.resolve(process.cwd(), name);
if (fs.existsSync(dir)) {
  console.error(`Refusing to overwrite existing directory: ${dir}`);
  process.exit(1);
}

const files = {
  'package.json': JSON.stringify(
    {
      name,
      version: '0.1.0',
      description: 'An Invisible Errors Detector rule plugin.',
      main: 'index.js',
      keywords: ['ied', 'ied-plugin', 'static-analysis'],
      peerDependencies: { '@ied/core': '*' }
    },
    null,
    2
  ),

  'index.js': `// IED rule plugin: default-export an array of Rule objects.
// A rule is a plain object — no framework. See @ied/core's Rule type.
//
// Severity strings: "error" | "warning" | "info" | "hint".
// Categories: logic | security | quality | framework | performance |
//             concurrency | type-safety | resource.

/** @type {import('@ied/core').Rule} */
const noDeprecatedGetUser = {
  id: 'ACME-001',
  name: 'no-deprecated-get-user',
  category: 'quality',
  severity: 'warning',
  languages: ['javascript', 'typescript'],
  description: 'Use UserService.findUser() instead of the deprecated getUser().',
  docs: 'getUser() is deprecated; migrate to findUser().',
  // Node types this rule reads via ctx.nodesOfType — the engine collects every
  // rule's types in ONE traversal of the file, so declaring them keeps scans fast.
  nodeTypes: () => ['call_expression'],
  run(ctx) {
    // A member call \`X.getUser(...)\`. (ctx.query(...) also accepts Tree-sitter
    // query patterns, at the cost of its own pass over the tree.)
    for (const call of ctx.nodesOfType('call_expression')) {
      const fn = call.childForFieldName('function');
      if (!fn || fn.type !== 'member_expression') continue;
      if (fn.childForFieldName('property')?.text !== 'getUser') continue;
      ctx.report({
        message: 'getUser() is deprecated — use findUser().',
        severity: 'warning',
        range: { start: call.startPosition, end: call.endPosition }
      });
    }
  }
};

module.exports = [noDeprecatedGetUser];
`,

  'README.md': `# ${name}

An [Invisible Errors Detector](https://example.invalid/ied) rule plugin.

## Use it

\`\`\`jsonc
// .iedrc.json
{
  "plugins": ["${name}"]   // or a local path: "./rules/${name}.js"
}
\`\`\`

The plugin default-exports an array of \`Rule\` objects; the engine registers
them alongside the built-in rules. Run \`ied rules\` to confirm they loaded.
`
};

fs.mkdirSync(dir, { recursive: true });
for (const [rel, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, rel), content, 'utf8');
}

console.log(`Created IED plugin scaffold at ${dir}`);
console.log('Next: implement your rules in index.js, then add the package to .iedrc.json "plugins".');
