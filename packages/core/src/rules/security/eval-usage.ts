/**
 * IED-S002 — eval-usage
 *
 * Flags direct use of `eval(...)` and `new Function(...)`, both of which
 * execute arbitrary code and defeat Content-Security-Policy protections.
 * Ported from the legacy `security/eval-usage` rule.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const evalUsageRule: Rule = {
  id: 'IED-S002',
  name: 'eval-usage',
  category: 'security',
  severity: Severity.Error,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Use of eval() or new Function() executes arbitrary code.',
  docs: [
    '# eval-usage (IED-S002)',
    '',
    'Dynamic code execution via `eval` or `new Function` opens injection and',
    'CSP risks. Refactor to avoid evaluating strings as code.',
    '',
    '```js',
    'eval(userInput);        // flagged',
    'new Function("return " + x); // flagged',
    '```'
  ].join('\n'),

  nodeTypes: () => ['call_expression', 'new_expression'],

  run(ctx: RuleContext): void {
    const reported = new Set<TSNode>();

    const flag = (node: TSNode, message: string): void => {
      if (reported.has(node)) return;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-S002')) return;
      reported.add(node);
      ctx.report({
        message,
        severity: Severity.Error,
        range: nodeRange(node),
        data: {}
      });
    };

    // eval(...)
    for (const node of ctx.nodesOfType('call_expression')) {
      const fn = node.childForFieldName('function');
      if (fn && fn.type === 'identifier' && fn.text === 'eval') {
        flag(node, 'Avoid eval() — it executes arbitrary code.');
      }
    }

    // new Function(...)
    for (const node of ctx.nodesOfType('new_expression')) {
      const ctor = node.childForFieldName('constructor');
      if (ctor && ctor.type === 'identifier' && ctor.text === 'Function') {
        flag(node, 'Avoid new Function(...) — it is equivalent to eval().');
      }
    }
  }
};
