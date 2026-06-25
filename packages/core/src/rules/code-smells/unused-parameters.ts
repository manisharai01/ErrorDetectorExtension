/**
 * IED-Q006 — unused-parameters
 *
 * Flags function/method parameters that are never referenced in the body.
 * Parameters prefixed with `_` are intentionally ignored. Walks every function
 * node, extracts the parameter identifier names from `formal_parameters`, and
 * checks the body's identifiers for a use of each.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const FUNCTION_TYPES = new Set([
  'function_declaration',
  'arrow_function',
  'function_expression',
  'method_definition'
]);

interface Param {
  name: string;
  node: TSNode;
}

/**
 * Pull the named parameters out of a `formal_parameters` node. Handles plain
 * `identifier` params (JS) and TS `required_parameter` / `optional_parameter`
 * whose `pattern` field is an identifier. Destructured / rest params are
 * skipped because there is no single name to report on.
 */
function collectParams(formals: TSNode): Param[] {
  const out: Param[] = [];
  for (let i = 0; i < formals.namedChildCount; i++) {
    const child = formals.namedChild(i);
    if (!child) continue;
    if (child.type === 'identifier') {
      out.push({ name: child.text, node: child });
    } else if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
      const pattern = child.childForFieldName('pattern');
      if (pattern && pattern.type === 'identifier') {
        out.push({ name: pattern.text, node: pattern });
      }
    }
  }
  return out;
}

export const unusedParametersRule: Rule = {
  id: 'IED-Q006',
  name: 'unused-parameters',
  category: 'quality',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'A function parameter is declared but never used in the body.',
  docs: [
    '# unused-parameters (IED-Q006)',
    '',
    'Unused parameters add noise and can hide bugs. Prefix the parameter with',
    '`_` to mark it intentionally unused and silence this rule.',
    '',
    '```js',
    'function f(a, b) { return a; } // b is unused',
    'function g(_unused, b) { return b; } // ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (FUNCTION_TYPES.has(node.type)) {
        inspectFunction(node);
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    const inspectFunction = (fn: TSNode): void => {
      const formals = fn.childForFieldName('parameters');
      const body = fn.childForFieldName('body');
      if (!formals || !body) return;

      const params = collectParams(formals);
      if (params.length === 0) return;

      // Gather every identifier used inside the body (excluding the param decls,
      // which live in `parameters`, not `body`).
      const used = new Set<string>();
      for (const id of body.descendantsOfType('identifier')) {
        used.add(id.text);
      }
      // Shorthand object properties reference an identifier too.
      for (const id of body.descendantsOfType('shorthand_property_identifier')) {
        used.add(id.text);
      }

      for (const p of params) {
        if (p.name.startsWith('_')) continue;
        if (used.has(p.name)) continue;
        if (ctx.isSuppressed(p.node.startPosition.row, 'IED-Q006')) continue;
        ctx.report({
          message: `Parameter "${p.name}" is never used. Prefix with "_" to silence.`,
          severity: Severity.Info,
          range: nodeRange(p.node),
          data: { paramName: p.name }
        });
      }
    };

    walk(ctx.tree.rootNode);
  }
};
