/**
 * IED-Q006 — unused-parameters
 *
 * Flags function/method parameters that are never referenced in the body.
 * Parameters prefixed with `_` are intentionally ignored. For every indexed
 * function node, extracts the parameter identifier names from
 * `formal_parameters` and checks the body's identifiers for a use of each.
 *
 * TypeScript parameter properties (`constructor(private svc: Svc)`) declare a
 * class field, so they are never "unused" and are skipped. A parameter read by
 * another parameter's default value (`(a, b = a) => …`) counts as used.
 *
 * Auto-fixable: prefixes the parameter with `_` to mark it intentionally unused.
 */

import {
  Severity,
  nodeRange,
  type Diagnostic,
  type Rule,
  type RuleContext,
  type TextEdit,
  type TSNode
} from '../types';
import { offsetAt } from '../util';

const FUNCTION_TYPES = [
  'function_declaration',
  'arrow_function',
  'function_expression',
  'method_definition'
];

/** Modifiers that turn a constructor parameter into a class property. */
const PROPERTY_MODIFIERS = new Set(['accessibility_modifier', 'override_modifier', 'readonly']);

interface Param {
  name: string;
  node: TSNode;
}

function isParameterProperty(param: TSNode): boolean {
  for (let i = 0; i < param.childCount; i++) {
    if (PROPERTY_MODIFIERS.has(param.child(i)?.type ?? '')) return true;
  }
  return false;
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
      if (isParameterProperty(child)) continue;
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
    '```',
    '',
    'Quick fix: prefix the parameter with `_`.'
  ].join('\n'),

  nodeTypes: () => FUNCTION_TYPES,

  run(ctx: RuleContext): void {
    for (const fn of ctx.nodesOfType(FUNCTION_TYPES)) {
      const formals = fn.childForFieldName('parameters');
      const body = fn.childForFieldName('body');
      if (!formals || !body) continue;

      const params = collectParams(formals);
      if (params.length === 0) continue;

      // Gather every identifier used inside the body (excluding the param decls,
      // which live in `parameters`, not `body`), plus identifiers read by other
      // parameters' default values.
      const used = new Set<string>();
      for (const id of body.descendantsOfType(['identifier', 'shorthand_property_identifier'])) {
        used.add(id.text);
      }
      const declared = new Set(params.map((p) => p.node.startIndex));
      for (const id of formals.descendantsOfType('identifier')) {
        if (!declared.has(id.startIndex)) used.add(id.text);
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
    }
  },

  fixTitle: (d) => `Prefix "${String(d.data?.paramName ?? 'parameter')}" with _ (mark as intentionally unused)`,

  fix(diagnostic: Diagnostic, sourceCode: string): TextEdit[] | null {
    const at = offsetAt(sourceCode, diagnostic.range.start);
    return [{ startIndex: at, endIndex: at, newText: '_' }];
  }
};
