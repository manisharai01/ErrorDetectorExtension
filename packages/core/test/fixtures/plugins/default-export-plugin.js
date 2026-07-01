// Plugin that uses the `{ default: [...] }` export shape (ESM-interop style).
const rule = {
  id: 'PLUGIN-002',
  name: 'no-foo-identifier',
  category: 'quality',
  severity: 'info',
  languages: ['javascript', 'typescript'],
  description: 'Flag any identifier literally named foo.',
  docs: 'Demo rule for the default-export plugin shape.',
  run(ctx) {
    const matches = ctx.query('(identifier) @id');
    for (const m of matches) {
      const id = m.captures.find((c) => c.name === 'id');
      if (id && id.node.text === 'foo') {
        ctx.report({
          message: 'Identifier "foo" is banned.',
          severity: 'info',
          range: { start: id.node.startPosition, end: id.node.endPosition }
        });
      }
    }
  }
};

module.exports = { default: [rule] };
