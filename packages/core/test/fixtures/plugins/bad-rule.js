// Plugin whose array contains a malformed rule (missing run/category/etc.) and
// one valid rule. The loader should reject the bad one and keep the good one.
const valid = {
  id: 'PLUGIN-003',
  name: 'ok-rule',
  category: 'quality',
  severity: 'hint',
  languages: ['javascript'],
  description: 'A valid rule that should still load.',
  docs: '',
  run() {}
};

const broken = { id: 'PLUGIN-BAD', name: 'broken' }; // no run, no category, ...

module.exports = [broken, valid];
