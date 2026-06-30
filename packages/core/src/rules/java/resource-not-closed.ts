/**
 * IED-R008 — resource-not-closed (Java)
 *
 * Creating a closeable resource (a stream, reader, socket, JDBC connection,
 * scanner, ...) and binding it to a local variable outside a try-with-resources
 * block puts the burden of closing it on hand-written `finally` code that is
 * easy to get wrong or omit, leaking file handles / sockets / connections.
 *
 * Heuristic: flag an `object_creation_expression` for a known resource type
 * when it is the `value:` of a `variable_declarator` inside a
 * `local_variable_declaration`, unless that declaration sits in a
 * try-with-resources `resource_specification` (where the language closes it
 * automatically).
 *
 * Conservative: we only consider a small allow-list of well-known resource
 * types, and only when the resource is assigned to a local (a bare
 * `new FileInputStream(...)` used as an argument or statement is not flagged).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Well-known JDK closeable types worth flagging when left unmanaged. */
const RESOURCE_TYPES = new Set([
  'FileInputStream',
  'FileOutputStream',
  'BufferedReader',
  'Connection',
  'Socket',
  'Scanner',
  'FileReader',
  'FileWriter'
]);

/** True if `node` is, or is nested within, a try-with-resources specification. */
function inResourceSpecification(node: TSNode): boolean {
  let cur: TSNode | null = node.parent;
  while (cur) {
    if (cur.type === 'resource_specification') return true;
    // Stop climbing once we leave the declaration's own statement context.
    if (cur.type === 'block' || cur.type === 'method_declaration') return false;
    cur = cur.parent;
  }
  return false;
}

export const resourceNotClosedRule: Rule = {
  id: 'IED-R008',
  name: 'resource-not-closed',
  category: 'resource',
  severity: Severity.Warning,
  languages: ['java'],
  description:
    'A closeable resource is created outside try-with-resources and may leak.',
  docs: [
    '# resource-not-closed (IED-R008)',
    '',
    'Streams, readers, sockets and JDBC connections must be closed. Assigning',
    'one to a local variable outside a try-with-resources block relies on manual',
    '`finally` handling that is easy to omit, leaking the underlying handle.',
    '',
    '```java',
    'FileInputStream in = new FileInputStream(path); // flagged',
    '',
    'try (FileInputStream in = new FileInputStream(path)) { // ok',
    '  ...',
    '}',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'object_creation_expression') {
        const typeNode = node.childForFieldName('type');
        const typeName = typeNode?.text;
        if (typeName && RESOURCE_TYPES.has(typeName)) {
          // Must be the value of a variable_declarator in a
          // local_variable_declaration to count as "assigned to a local".
          const declarator = node.parent;
          const isLocalValue =
            declarator?.type === 'variable_declarator' &&
            declarator.childForFieldName('value')?.id === node.id &&
            declarator.parent?.type === 'local_variable_declaration';

          if (isLocalValue && !inResourceSpecification(node)) {
            if (!ctx.isSuppressed(node.startPosition.row, 'IED-R008')) {
              ctx.report({
                message: `${typeName} is not closed; use try-with-resources.`,
                severity: Severity.Warning,
                range: nodeRange(node),
                data: { type: typeName }
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
