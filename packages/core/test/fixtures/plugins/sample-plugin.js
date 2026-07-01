// A local IED rule plugin used by the plugin-loader test.
// Default-exports an array of Rule objects (the marketplace contract).
const bannedCall = {
  id: 'PLUGIN-001',
  name: 'no-dangerous-call',
  category: 'security',
  severity: 'error',
  languages: ['javascript', 'typescript'],
  description: 'Disallow calls to dangerouslyDoThing().',
  docs: 'Custom org rule loaded from a plugin.',
  run(ctx) {
    const matches = ctx.query(`
      (call_expression
        function: (identifier) @fn
        (#eq? @fn "dangerouslyDoThing")) @call
    `);
    for (const m of matches) {
      const call = m.captures.find((c) => c.name === 'call');
      if (!call) continue;
      const n = call.node;
      ctx.report({
        message: 'Call to dangerouslyDoThing() is banned by org policy.',
        severity: 'error',
        range: { start: n.startPosition, end: n.endPosition }
      });
    }
  }
};

module.exports = [bannedCall];
