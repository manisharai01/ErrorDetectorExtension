/**
 * IED-C010 — synchronized-non-final (Java)
 *
 * `synchronized (lock)` only provides mutual exclusion if every thread locks on
 * the *same* object. If `lock` is a non-final field it can be reassigned (or
 * differs per instance in ways the author did not intend), so two threads may
 * synchronize on different monitors and the lock provides no protection.
 *
 * Heuristic: within each class, collect the names of fields declared *without*
 * a `final` modifier. Then flag any `synchronized (x)` or `synchronized
 * (this.x)` whose lock is one of those non-final field names.
 *
 * Conservative: we only flag locks that resolve to a simple field reference
 * (`field` or `this.field`) whose finality we can read from the class's own
 * field declarations. Locks on locals, parameters, method calls, or fields we
 * cannot see (e.g. inherited) are left alone. A field with no modifiers at all
 * is treated as non-final (Java default).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Collect names of non-final fields declared directly in a class body. */
function nonFinalFieldNames(classNode: TSNode): Set<string> {
  const names = new Set<string>();
  const body = classNode.childForFieldName('body');
  if (!body) return names;

  for (let i = 0; i < body.namedChildCount; i++) {
    const field = body.namedChild(i);
    if (!field || field.type !== 'field_declaration') continue;

    // `modifiers` is an unnamed child node; absent entirely when no modifiers.
    let isFinal = false;
    for (let j = 0; j < field.namedChildCount; j++) {
      const mod = field.namedChild(j);
      if (mod && mod.type === 'modifiers') {
        if (mod.text.split(/\s+/).includes('final')) isFinal = true;
      }
    }
    if (isFinal) continue;

    // A field_declaration can declare several names: collect every declarator.
    for (let j = 0; j < field.namedChildCount; j++) {
      const decl = field.namedChild(j);
      if (decl && decl.type === 'variable_declarator') {
        const name = decl.childForFieldName('name')?.text;
        if (name) names.add(name);
      }
    }
  }
  return names;
}

/**
 * Resolve a synchronized lock expression to a bare field name if it is one of
 * `identifier` or `this.identifier`. Returns null for anything else.
 */
function lockFieldName(lockExpr: TSNode | null): string | null {
  if (!lockExpr) return null;
  if (lockExpr.type === 'identifier') return lockExpr.text;
  if (lockExpr.type === 'field_access') {
    const object = lockExpr.childForFieldName('object');
    const field = lockExpr.childForFieldName('field');
    if (object?.type === 'this' && field) return field.text;
  }
  return null;
}

export const synchronizedNonFinalRule: Rule = {
  id: 'IED-C010',
  name: 'synchronized-non-final',
  category: 'concurrency',
  severity: Severity.Warning,
  languages: ['java'],
  description: 'synchronized locks on a non-final field.',
  docs: [
    '# synchronized-non-final (IED-C010)',
    '',
    'Synchronizing on a non-final field is unsafe: the field can be reassigned,',
    'so different threads may lock on different objects and the `synchronized`',
    'block provides no mutual exclusion.',
    '',
    '```java',
    'private Object lock = new Object();        // non-final',
    'void m() { synchronized (lock) { ... } }   // flagged',
    '',
    'private final Object lock = new Object();  // ok',
    '```',
    '',
    'Make the lock `final`, or lock on a dedicated `private final Object`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode, nonFinal: Set<string>): void => {
      // Entering a class refreshes the set of visible non-final field names.
      const fieldSet =
        node.type === 'class_declaration' ? nonFinalFieldNames(node) : nonFinal;

      if (node.type === 'synchronized_statement') {
        // First named child is the parenthesized lock expression.
        const paren = node.namedChild(0);
        const lockExpr =
          paren?.type === 'parenthesized_expression'
            ? paren.namedChild(0)
            : paren ?? null;
        const name = lockFieldName(lockExpr);
        if (name && fieldSet.has(name) && lockExpr) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-C010')) {
            ctx.report({
              message:
                'Synchronizing on non-final field; lock on a final object instead.',
              severity: Severity.Warning,
              range: nodeRange(lockExpr),
              data: { lock: name }
            });
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child, fieldSet);
      }
    };

    walk(ctx.tree.rootNode, new Set());
  }
};
