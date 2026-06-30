/**
 * IED-L016 — platform-type-null (Kotlin)
 *
 * When Kotlin calls Java, the return type is a *platform type* (`String!`):
 * the compiler cannot tell whether it is nullable, so it skips null checks. If
 * the Java method actually returns null and you immediately dereference the
 * result with a plain `.` access, you get a `NullPointerException` that the
 * type system never warned you about.
 *
 * Detecting platform types precisely needs full type resolution, which a
 * syntactic rule does not have. CONSERVATIVE HEURISTIC: flag a member access
 * made with `.` (not `?.`) directly on the result of a call whose method name
 * follows the Java getter convention (`get` + UpperCamel, e.g. `getName()`).
 * Such calls overwhelmingly come from Java interop, and dereferencing their
 * result without a safe call is the classic platform-type trap:
 *
 *   user.getName().length        // flagged — platform type, '.' access
 *   user.getName()?.length       // OK — safe call guards the platform type
 *   user.name.length             // OK — not a getter call
 *
 * NODE SHAPE (verified):
 *   user.getName().length ->
 *     (navigation_expression                       // <- the access we flag
 *       (call_expression                           // operand: the getter call
 *         (navigation_expression
 *            … (navigation_suffix (simple_identifier "getName"))))
 *       (navigation_suffix "." (simple_identifier "length")))  // '.' not '?.'
 *
 * Notes that keep false positives low:
 *  - We require the *operator* of the outer access to be `.` (the
 *    `navigation_suffix` begins with an anonymous `.` token, not `?.`).
 *  - We require the operand to be a `call_expression` whose callee method name
 *    matches /^get[A-Z]/ — a no-arg-style Java getter shape.
 *  - Severity is Info: it is a heuristic hint, not a proven bug.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const GETTER_RE = /^get[A-Z]/;

/** The trailing member-name `simple_identifier` of a `navigation_suffix`. */
function suffixMethodName(nav: TSNode): TSNode | undefined {
  for (let i = 0; i < nav.childCount; i++) {
    const child = nav.child(i);
    if (child && child.type === 'navigation_suffix') {
      for (let j = 0; j < child.childCount; j++) {
        const c = child.child(j);
        if (c && c.type === 'simple_identifier') return c;
      }
    }
  }
  return undefined;
}

/**
 * True when the outer `navigation_expression` accesses its operand with a plain
 * `.` (the suffix's leading anonymous operator token is exactly `.`), as
 * opposed to a safe call `?.`.
 */
function usesPlainDot(nav: TSNode): boolean {
  for (let i = 0; i < nav.childCount; i++) {
    const child = nav.child(i);
    if (child && child.type === 'navigation_suffix') {
      const op = child.child(0);
      return !!op && op.type === '.';
    }
  }
  return false;
}

export const platformTypeNullRule: Rule = {
  id: 'IED-L016',
  name: 'platform-type-null',
  category: 'logic',
  severity: Severity.Info,
  languages: ['kotlin'],
  description: 'Plain `.` access on a Java getter result (platform-type NPE risk).',
  docs: [
    '# platform-type-null (IED-L016)',
    '',
    'Values returned from Java are *platform types* — the compiler does not know',
    'if they are nullable, so it allows an unchecked `.` dereference that can',
    'throw `NullPointerException` at runtime:',
    '',
    '```kotlin',
    'val n = user.getName().length // flagged — getName() is a platform type',
    '```',
    '',
    'Guard the result with a safe call or assign it to an explicitly-typed',
    'nullable first:',
    '',
    '```kotlin',
    'val n = user.getName()?.length ?: 0',
    '```',
    '',
    'Heuristic: flags a plain `.` access whose operand is a call matching the',
    'Java getter convention (`getX()`). It is an Info hint, so verify the actual',
    'nullability before changing code.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'navigation_expression') {
        const operand = node.child(0);
        if (operand && operand.type === 'call_expression' && usesPlainDot(node)) {
          // The callee of the operand call must be a navigation_expression
          // whose method name looks like a Java getter (obj.getX()).
          const callee = operand.child(0);
          if (callee && callee.type === 'navigation_expression') {
            const method = suffixMethodName(callee);
            if (
              method &&
              GETTER_RE.test(method.text) &&
              !ctx.isSuppressed(node.startPosition.row, 'IED-L016')
            ) {
              ctx.report({
                message:
                  `Platform-type null risk: \`.\` access on \`${method.text}()\` (a Java getter) ` +
                  'can throw NPE — use `?.` or an explicit nullable.',
                severity: Severity.Info,
                range: nodeRange(node),
                data: { getter: method.text }
              });
            }
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
