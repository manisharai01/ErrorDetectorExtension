/**
 * IED-S005 — taint-tracking
 *
 * Lightweight, conservative intra-file taint tracker ported from the legacy
 * `security/taint-flow` rule.
 *
 * Sources (textually matched in an initializer):
 *   - req.body / req.params / req.query
 *   - process.argv
 *   - location.search / window.location.* / document.location.*
 *
 * Sinks:
 *   - eval(x) / new Function(x)
 *   - assignment to .innerHTML / .outerHTML
 *   - .insertAdjacentHTML(pos, html)
 *   - exec / execSync / spawn / spawnSync(cmd)
 *   - .query / .execute / .raw(sql)
 *
 * Flow: a tainted identifier reaches a sink either directly, via a one-hop
 * `const y = x` reassignment, or via a template/concat that references it.
 * Kept deliberately conservative to avoid false positives.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode,
  type Range
} from '../types';

const SOURCE_RE =
  /\b(req\.(body|params|query)|process\.argv|window\.location|document\.location|location\.search)\b/;

const HTML_ASSIGN_SINKS = new Set(['innerHTML', 'outerHTML']);
const HTML_CALL_SINKS = new Set(['insertAdjacentHTML']);
const EXEC_SINKS = new Set(['exec', 'execSync', 'spawn', 'spawnSync']);
const SQL_SINKS = new Set(['query', 'execute', 'raw']);

interface TaintInfo {
  row: number;
  description: string;
}

/** Depth-first walk applying `fn` to every node. */
function walk(node: TSNode, fn: (n: TSNode) => void): void {
  fn(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, fn);
  }
}

/** All identifier names referenced anywhere inside `node`. */
function identifiersIn(node: TSNode): string[] {
  const out: string[] = [];
  walk(node, (n) => {
    if (n.type === 'identifier') out.push(n.text);
  });
  return out;
}

export const taintTrackingRule: Rule = {
  id: 'IED-S005',
  name: 'taint-tracking',
  category: 'security',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'User-controlled input flows into a sensitive sink without sanitisation.',
  docs: [
    '# taint-tracking (IED-S005)',
    '',
    'A value originating from user-controlled input (req.body, process.argv,',
    'location.search, ...) reaches a sensitive operation (eval, innerHTML,',
    'child_process, SQL query) without visible sanitisation. Validate or escape',
    'the value at the boundary and prefer parameterised APIs.',
    '',
    '```js',
    'const id = req.query.id;',
    'db.query("SELECT * FROM t WHERE id = " + id); // flagged',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const tainted = new Map<string, TaintInfo>();
    const root = ctx.tree.rootNode;

    // 1. Seed taint from variable declarators whose initializer mentions a source.
    walk(root, (n) => {
      if (n.type !== 'variable_declarator') return;
      const nameNode = n.childForFieldName('name');
      const valueNode = n.childForFieldName('value');
      if (!nameNode || nameNode.type !== 'identifier' || !valueNode) return;
      if (SOURCE_RE.test(valueNode.text)) {
        tainted.set(nameNode.text, {
          row: n.startPosition.row,
          description: `value from "${valueNode.text}"`
        });
      }
    });

    // 2. Propagate one-hop: const y = <expr referencing a tainted id>.
    let changed = true;
    while (changed) {
      changed = false;
      walk(root, (n) => {
        if (n.type !== 'variable_declarator') return;
        const nameNode = n.childForFieldName('name');
        const valueNode = n.childForFieldName('value');
        if (!nameNode || nameNode.type !== 'identifier' || !valueNode) return;
        if (tainted.has(nameNode.text)) return;
        for (const id of identifiersIn(valueNode)) {
          if (tainted.has(id)) {
            tainted.set(nameNode.text, {
              row: n.startPosition.row,
              description: `derived from tainted "${id}"`
            });
            changed = true;
            return;
          }
        }
      });
    }

    if (tainted.size === 0) return;

    const reported = new Set<TSNode>();

    const flag = (sinkNode: TSNode, arg: TSNode | undefined | null, label: string): void => {
      if (!arg || reported.has(sinkNode)) return;
      // Direct tainted identifier, or a concat/template that textually carries a source.
      let taintedId: string | null = null;
      for (const id of identifiersIn(arg)) {
        if (tainted.has(id)) {
          taintedId = id;
          break;
        }
      }
      const concatHasSource =
        (arg.type === 'template_string' || arg.type === 'binary_expression') &&
        SOURCE_RE.test(arg.text);
      if (!taintedId && !concatHasSource) return;
      if (ctx.isSuppressed(sinkNode.startPosition.row, 'IED-S005')) return;

      reported.add(sinkNode);

      const related: Array<{ message: string; range: Range }> = [];
      if (taintedId) {
        const seed = tainted.get(taintedId)!;
        related.push({
          message: seed.description,
          range: {
            start: { row: seed.row, column: 0 },
            end: { row: seed.row, column: 0 }
          }
        });
      }

      ctx.report({
        message: `Untrusted input flows into ${label}.`,
        severity: Severity.Warning,
        range: nodeRange(sinkNode),
        related: related.length ? related : undefined,
        data: { sink: label, source: taintedId ?? undefined }
      });
    };

    // 3. Walk sinks.
    walk(root, (n) => {
      // eval(x)
      if (n.type === 'call_expression') {
        const fn = n.childForFieldName('function');
        const args = n.childForFieldName('arguments');
        if (fn && fn.type === 'identifier' && fn.text === 'eval') {
          flag(n, args?.namedChild(0), 'eval()');
        }
        if (fn && fn.type === 'member_expression') {
          const prop = fn.childForFieldName('property')?.text ?? null;
          if (prop && HTML_CALL_SINKS.has(prop)) {
            flag(n, args?.namedChild(1), prop);
          }
          if (prop && EXEC_SINKS.has(prop)) {
            flag(n, args?.namedChild(0), `${prop}()`);
          }
          if (prop && SQL_SINKS.has(prop)) {
            flag(n, args?.namedChild(0), `${prop}() (SQL)`);
          }
        }
        if (fn && fn.type === 'identifier' && EXEC_SINKS.has(fn.text)) {
          flag(n, args?.namedChild(0), `${fn.text}()`);
        }
      }

      // new Function(x)
      if (n.type === 'new_expression') {
        const ctor = n.childForFieldName('constructor');
        const args = n.childForFieldName('arguments');
        if (ctor && ctor.type === 'identifier' && ctor.text === 'Function') {
          flag(n, args?.namedChild(0), 'new Function()');
        }
      }

      // assignment to .innerHTML / .outerHTML
      if (n.type === 'assignment_expression') {
        const left = n.childForFieldName('left');
        const right = n.childForFieldName('right');
        if (left && left.type === 'member_expression') {
          const prop = left.childForFieldName('property')?.text ?? null;
          if (prop && HTML_ASSIGN_SINKS.has(prop)) {
            flag(n, right, prop);
          }
        }
      }
    });
  }
};
