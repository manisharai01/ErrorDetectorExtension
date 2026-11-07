/**
 * IED-C007 — sync-in-async
 *
 * Flags blocking, synchronous I/O calls inside an `async def`. They block the
 * event loop, defeating the point of async. Use async equivalents (`aiohttp`,
 * `asyncio.sleep`, `aiofiles`, run_in_executor).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { EnclosingStack, spanOf } from '../util';

// object name -> set of blocking attribute methods on it
const BLOCKING_ATTRS: Record<string, Set<string>> = {
  requests: new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'request']),
  time: new Set(['sleep']),
  subprocess: new Set(['run', 'call', 'check_call', 'check_output', 'Popen']),
  urllib: new Set(['urlopen'])
};
const BLOCKING_FUNCS = new Set(['open', 'input']);

function isAsyncDef(node: TSNode): boolean {
  if (node.type !== 'function_definition') return false;
  // `async def` puts an anonymous `async` token as the first child.
  const first = node.child(0);
  return !!first && !first.isNamed && first.type === 'async';
}

export const syncInAsyncRule: Rule = {
  id: 'IED-C007',
  name: 'sync-in-async',
  category: 'concurrency',
  severity: Severity.Warning,
  languages: ['python'],
  description: 'Blocking synchronous call inside an async function.',
  docs: [
    '# sync-in-async (IED-C007)',
    '',
    'Calling blocking I/O (`requests`, `time.sleep`, `open`) inside `async def`',
    'stalls the whole event loop.',
    '',
    '```py',
    'async def fetch(url):',
    '    r = requests.get(url)   # flagged — blocks the loop',
    '    time.sleep(1)           # flagged',
    '```',
    '',
    'Use `aiohttp`/`httpx`, `await asyncio.sleep(...)`, or run_in_executor.'
  ].join('\n'),

  nodeTypes: () => ['function_definition', 'lambda', 'call'],

  run(ctx: RuleContext): void {
    const flag = (node: TSNode, what: string): void => {
      if (ctx.isSuppressed(node.startPosition.row, 'IED-C007')) return;
      ctx.report({
        message: `Blocking call \`${what}\` inside an async function stalls the event loop. Use an async equivalent.`,
        severity: Severity.Warning,
        range: nodeRange(node),
        data: { call: what }
      });
    };

    // Each call belongs to its innermost function (a nested def or lambda has
    // its own scope); only calls in the BODY of an async def are checked.
    // Findings are emitted grouped per async def, in definition order.
    interface Scope {
      body: { start: number; end: number } | null;
      calls: TSNode[];
    }
    const asyncDefs: Scope[] = [];
    const scopes = new EnclosingStack<Scope>();
    for (const node of ctx.nodesOfType(['function_definition', 'lambda', 'call'])) {
      scopes.at(spanOf(node));
      if (node.type !== 'call') {
        const body = isAsyncDef(node) ? node.childForFieldName('body') : null;
        const scope: Scope = { body: body ? { start: body.startIndex, end: body.endIndex } : null, calls: [] };
        if (scope.body) asyncDefs.push(scope);
        scopes.push(spanOf(node), scope);
        continue;
      }
      const scope = scopes.innermost();
      if (!scope?.body || node.startIndex < scope.body.start || node.endIndex > scope.body.end) continue;
      scope.calls.push(node);
    }

    for (const { calls } of asyncDefs) {
      for (const node of calls) {
        const fn = node.childForFieldName('function');
        if (fn && fn.type === 'attribute') {
          const obj = fn.childForFieldName('object');
          const attr = fn.childForFieldName('attribute')?.text;
          const objName = obj && obj.type === 'identifier' ? obj.text : null;
          if (objName && attr && BLOCKING_ATTRS[objName]?.has(attr)) {
            flag(node, `${objName}.${attr}()`);
          }
        } else if (fn && fn.type === 'identifier' && BLOCKING_FUNCS.has(fn.text)) {
          flag(node, `${fn.text}()`);
        }
      }
    }
  }
};
