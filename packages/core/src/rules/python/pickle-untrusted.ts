/**
 * IED-S013 — pickle-untrusted
 *
 * Flags `pickle.load`/`pickle.loads`/`cPickle.*` and `yaml.load(...)` without a
 * safe `Loader`. Both can execute arbitrary code when fed untrusted data.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const PICKLE_OBJECTS = new Set(['pickle', 'cPickle', '_pickle']);
const PICKLE_METHODS = new Set(['load', 'loads']);

export const pickleUntrustedRule: Rule = {
  id: 'IED-S013',
  name: 'pickle-untrusted',
  category: 'security',
  severity: Severity.Error,
  languages: ['python'],
  description: 'Deserializing untrusted data with pickle or unsafe yaml.load.',
  docs: [
    '# pickle-untrusted (IED-S013)',
    '',
    '`pickle.loads` and `yaml.load` (without a safe Loader) execute arbitrary',
    'code embedded in the payload.',
    '',
    '```py',
    'pickle.loads(request.body)             # flagged',
    'yaml.load(open("config.yml"))          # flagged',
    'yaml.load(data, Loader=yaml.SafeLoader)  # safe',
    '```',
    '',
    'Prefer `json`, `pickle` only on trusted data, or `yaml.safe_load`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const flag = (node: TSNode, message: string): void => {
      if (ctx.isSuppressed(node.startPosition.row, 'IED-S013')) return;
      ctx.report({ message, severity: Severity.Error, range: nodeRange(node) });
    };

    const walk = (node: TSNode): void => {
      if (node.type === 'call') {
        const fn = node.childForFieldName('function');
        if (fn && fn.type === 'attribute') {
          const obj = fn.childForFieldName('object');
          const attr = fn.childForFieldName('attribute');
          const objName = obj && obj.type === 'identifier' ? obj.text : null;
          const attrName = attr?.text ?? null;

          // pickle.load / pickle.loads / cPickle.*
          if (objName && PICKLE_OBJECTS.has(objName) && attrName && PICKLE_METHODS.has(attrName)) {
            flag(node, `${objName}.${attrName}() can execute arbitrary code from the payload. Deserialize only trusted data.`);
          }
          // yaml.load without a Loader= keyword argument
          else if (objName === 'yaml' && attrName === 'load') {
            const args = node.childForFieldName('arguments');
            const hasLoader =
              !!args &&
              args.namedChildren.some(
                (a) => a.type === 'keyword_argument' && a.childForFieldName('name')?.text === 'Loader'
              );
            if (!hasLoader) {
              flag(node, 'yaml.load() without a safe Loader can execute arbitrary code; use yaml.safe_load instead.');
            }
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };
    walk(ctx.tree.rootNode);
  }
};
