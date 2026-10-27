/**
 * IED-S022 — unsafe-deserialization (Ruby)
 *
 * Flags `Marshal.load(...)` and `YAML.load(...)` — the classic unsafe Ruby
 * deserializers — when the argument is a non-literal (a variable / expression
 * rather than a plain string literal).
 *
 * Verified shape:
 *   - `Marshal.load(data)` → (call receiver:(constant "Marshal")
 *       method:(identifier "load") arguments:(argument_list (identifier)))
 *   - `YAML.load("a: 1")`  → argument is a bare string literal → not flagged.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const UNSAFE_RECEIVERS = new Set(['Marshal', 'YAML']);

/** True if the string subtree interpolates (`#{...}`). */
function hasInterpolation(node: TSNode): boolean {
  if (node.type === 'interpolation') return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasInterpolation(child)) return true;
  }
  return false;
}

/** A safe literal argument is a `string` with no interpolation. */
function isSafeLiteral(node: TSNode): boolean {
  return node.type === 'string' && !hasInterpolation(node);
}

export const unsafeDeserializationRule: Rule = {
  id: 'IED-S022',
  name: 'unsafe-deserialization',
  category: 'security',
  severity: Severity.Error,
  languages: ['ruby'],
  description: 'Marshal.load / YAML.load called on non-literal (untrusted) data.',
  docs: [
    '# unsafe-deserialization (IED-S022)',
    '',
    '`Marshal.load` and `YAML.load` can instantiate arbitrary objects and run',
    'code during deserialization. Never call them on data you do not fully',
    'control. Prefer `YAML.safe_load` / `JSON.parse` for external input.',
    '',
    '```ruby',
    'Marshal.load(request.body) # flagged',
    'YAML.load(params[:blob])   # flagged',
    'YAML.safe_load(text)       # ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'call') {
        const receiver = node.childForFieldName('receiver');
        const method = node.childForFieldName('method');
        if (
          receiver?.type === 'constant' &&
          UNSAFE_RECEIVERS.has(receiver.text) &&
          method?.text === 'load'
        ) {
          const args = node.childForFieldName('arguments');
          const first = args?.namedChild(0);
          if (first && !isSafeLiteral(first)) {
            const row = node.startPosition.row;
            if (!ctx.isSuppressed(row, 'IED-S022')) {
              ctx.report({
                message: `Unsafe deserialization: \`${receiver.text}.load\` on untrusted data. Use a safe loader.`,
                severity: Severity.Error,
                range: nodeRange(node),
                data: { receiver: receiver.text }
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
