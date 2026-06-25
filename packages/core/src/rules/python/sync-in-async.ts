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

    const scanBody = (node: TSNode): void => {
      // Don't descend into nested function definitions — they have their own scope.
      if (node.type === 'function_definition' || node.type === 'lambda') return;
      if (node.type === 'call') {
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
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) scanBody(c);
      }
    };

    const walk = (node: TSNode): void => {
      if (isAsyncDef(node)) {
        const body = node.childForFieldName('body');
        if (body) scanBody(body);
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };
    walk(ctx.tree.rootNode);
  }
};
