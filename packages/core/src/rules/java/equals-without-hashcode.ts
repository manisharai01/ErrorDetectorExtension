/**
 * IED-T007 — equals-without-hashcode (Java)
 *
 * The `Object.equals`/`Object.hashCode` contract requires that equal objects
 * have equal hash codes. Overriding `equals` without also overriding
 * `hashCode` breaks hash-based collections (`HashMap`, `HashSet`): equal
 * objects land in different buckets.
 *
 * For each `class_declaration`, scan its direct method declarations. If it
 * declares `equals` but not `hashCode`, report on the `equals` method.
 *
 * Conservative: only methods declared directly in the class body are
 * considered (not inherited members), and we only key on the method name, not
 * its exact `(Object)` signature, which is sufficient to catch the common case
 * without false positives on an unrelated helper named `equals`.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** The direct method declarations inside a class body. */
function methodsOf(classNode: TSNode): TSNode[] {
  const body = classNode.childForFieldName('body');
  if (!body) return [];
  const methods: TSNode[] = [];
  for (let i = 0; i < body.namedChildCount; i++) {
    const child = body.namedChild(i);
    if (child && child.type === 'method_declaration') methods.push(child);
  }
  return methods;
}

function methodName(method: TSNode): string | null {
  return method.childForFieldName('name')?.text ?? null;
}

export const equalsWithoutHashCodeRule: Rule = {
  id: 'IED-T007',
  name: 'equals-without-hashcode',
  category: 'type-safety',
  severity: Severity.Warning,
  languages: ['java'],
  description: 'A class overrides equals() but not hashCode().',
  docs: [
    '# equals-without-hashcode (IED-T007)',
    '',
    'The `equals`/`hashCode` contract requires equal objects to share a hash',
    'code. Overriding only `equals` breaks `HashMap`/`HashSet` lookups.',
    '',
    '```java',
    'class Point {',
    '  @Override public boolean equals(Object o) { ... } // flagged: no hashCode',
    '}',
    '```',
    '',
    'Override `hashCode()` whenever you override `equals()`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'class_declaration') {
        const methods = methodsOf(node);
        const equalsMethod = methods.find((m) => methodName(m) === 'equals');
        const hasHashCode = methods.some((m) => methodName(m) === 'hashCode');

        if (equalsMethod && !hasHashCode) {
          if (!ctx.isSuppressed(equalsMethod.startPosition.row, 'IED-T007')) {
            ctx.report({
              message: 'Override hashCode() when overriding equals().',
              severity: Severity.Warning,
              range: nodeRange(equalsMethod),
              data: { className: node.childForFieldName('name')?.text }
            });
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
