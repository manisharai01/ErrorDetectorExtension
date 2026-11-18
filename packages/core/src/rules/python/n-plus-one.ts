/**
 * IED-P007 — n-plus-one-query
 *
 * Flags ORM-style query calls inside the body of a `for` loop — the classic
 * N+1 pattern, where one query per iteration replaces a single batched query.
 *
 * Heuristic: a call reached while inside a `for_statement` body whose callee
 * chain shows it talks to a database, and that ends in a query method:
 *   - any method on a Django manager (`Model.objects…`, `order.item_set…`);
 *   - a query method (`get`, `filter`, `first`, `all`, `count`, `execute`, …) on
 *     a SQLAlchemy query (`session.query(…)`, `Model.query`) or a DB handle
 *     (`session`, `db`, `cursor`, `conn`, also as `self.session`);
 *   - ORM-only methods (`select_related`, `filter_by`, `values_list`, …) on
 *     anything.
 * Generic names on ordinary objects — `dict.get`, `str.count`, `numpy.all` —
 * are not queries and are not flagged. Only the outermost call of a chain is
 * reported, so `Item.objects.filter(…).first()` is one finding.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Methods that run (or build) a query when called on an ORM object or DB handle. */
const QUERY_METHODS = new Set([
  'filter',
  'exclude',
  'get',
  'all',
  'first',
  'count',
  'exists',
  'execute',
  'scalars',
  'scalar',
  'one',
  'one_or_none',
  'fetchone',
  'fetchall',
  'fetchmany'
]);

/** Methods only ORMs have — a query whatever the receiver looks like. */
const ORM_ONLY_METHODS = new Set([
  'select_related',
  'prefetch_related',
  'filter_by',
  'values_list',
  'get_or_create',
  'update_or_create'
]);

/** Names of database handles: a SQLAlchemy session, a DB-API connection/cursor. */
const DB_HANDLES = new Set(['session', 'db', 'db_session', 'cursor', 'cur', 'conn', 'connection']);

interface Callee {
  method: string | null;
  /** The chain goes through a Django manager (`.objects`, `.<name>_set`). */
  manager: boolean;
  /** The chain goes through a SQLAlchemy query or a DB handle. */
  database: boolean;
}

/** Walk a callee chain (through attribute accesses and calls) for ORM evidence. */
function describeCallee(call: TSNode): Callee {
  const fn = call.childForFieldName('function');
  if (!fn || fn.type !== 'attribute') return { method: null, manager: false, database: false };
  const method = fn.childForFieldName('attribute')?.text ?? null;
  let manager = false;
  let database = false;
  let cur: TSNode | null = fn;
  while (cur) {
    if (cur.type === 'attribute') {
      const name = cur.childForFieldName('attribute')?.text ?? '';
      const object = cur.childForFieldName('object');
      if (name === 'objects' || name.endsWith('_set')) manager = true;
      if (DB_HANDLES.has(name)) database = true;
      // `session.query(Model)` (called) or Flask-SQLAlchemy `Model.query`.
      if (name === 'query' && (cur.parent?.type === 'call' || /^[A-Z]/.test(object?.text ?? ''))) {
        database = true;
      }
      cur = object;
    } else if (cur.type === 'call') {
      cur = cur.childForFieldName('function');
    } else {
      if (cur.type === 'identifier' && DB_HANDLES.has(cur.text)) database = true;
      break;
    }
  }
  return { method, manager, database };
}

export const nPlusOneQueryRule: Rule = {
  id: 'IED-P007',
  name: 'n-plus-one-query',
  category: 'performance',
  severity: Severity.Warning,
  languages: ['python'],
  description: 'A database/ORM query executed inside a loop (possible N+1).',
  docs: [
    '# n-plus-one-query (IED-P007)',
    '',
    'Running a query inside a loop issues one round-trip per iteration. Batch the',
    'data with a single query (e.g. `select_related`/`prefetch_related`, or an',
    '`IN (...)` query) instead.',
    '',
    '```py',
    'for order in orders:',
    '    items = Item.objects.filter(order_id=order.id)  # flagged',
    '```'
  ].join('\n'),

  nodeTypes: () => ['for_statement', 'call'],

  run(ctx: RuleContext): void {
    // Bodies of the loops around the current node (a call in a loop's header —
    // `for x in Model.objects.all():` — is not inside that loop's body).
    const bodies: Array<{ start: number; end: number }> = [];
    for (const node of ctx.nodesOfType(['for_statement', 'call'])) {
      const start = node.startIndex;
      while (bodies.length > 0 && bodies[bodies.length - 1].end <= start) bodies.pop();
      if (node.type === 'for_statement') {
        const body = node.childForFieldName('body');
        if (body) bodies.push({ start: body.startIndex, end: body.endIndex });
        continue;
      }
      const end = node.endIndex;
      if (!bodies.some((b) => b.start <= start && end <= b.end)) continue;
      // Only the last call of a chain: `….filter(…).first()` is one query.
      const access = node.parent;
      const outer = access?.type === 'attribute' ? access.parent : null;
      if (outer?.type === 'call' && outer.childForFieldName('function')?.startIndex === access!.startIndex) continue;
      const { method, manager, database } = describeCallee(node);
      if (!method) continue;
      const isQuery =
        manager || ORM_ONLY_METHODS.has(method) || (database && QUERY_METHODS.has(method));
      if (isQuery) {
        if (!ctx.isSuppressed(node.startPosition.row, 'IED-P007')) {
          ctx.report({
            message: `Query \`.${method}(...)\` runs inside a loop (possible N+1). Batch it into a single query.`,
            severity: Severity.Warning,
            range: nodeRange(node),
            data: { method }
          });
        }
      }
    }
  }
};
