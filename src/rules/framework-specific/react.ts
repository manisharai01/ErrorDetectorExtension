import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

const HOOKS_WITH_DEPS = new Set(['useEffect', 'useCallback', 'useMemo', 'useLayoutEffect']);

export const reactHooksDepsRule: Rule = {
  meta: {
    id: 'react/hook-deps',
    name: 'Missing dependency array',
    description: 'useEffect/useCallback/useMemo called without a dependency array.',
    category: 'framework',
    defaultSeverity: 'warning'
  },
  run(ctx) {
    if (ctx.language !== 'jsx' && ctx.language !== 'tsx' && !ctx.projectContext.hasReact) return;
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isCallExpression(n)) return;
      const callee = ts.isIdentifier(n.expression) ? n.expression.text
        : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null;
      if (!callee || !HOOKS_WITH_DEPS.has(callee)) return;
      if (n.arguments.length < 2) {
        ctx.report({
          message: `${callee} called without a dependency array.`,
          severity: 'warning',
          location: locOf(n, sf)
        });
      }
    });
  }
};

export const reactKeyInListRule: Rule = {
  meta: {
    id: 'react/missing-key',
    name: 'Missing key in list',
    description: '.map() returns JSX elements without a `key` prop.',
    category: 'framework',
    defaultSeverity: 'warning'
  },
  run(ctx) {
    if (ctx.language !== 'jsx' && ctx.language !== 'tsx') return;
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isCallExpression(n)) return;
      if (!ts.isPropertyAccessExpression(n.expression)) return;
      if (n.expression.name.text !== 'map') return;
      const fn = n.arguments[0];
      if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return;
      const body = fn.body;
      const jsx = findFirstJsx(body);
      if (!jsx) return;
      if (!hasKeyAttribute(jsx)) {
        ctx.report({
          message: 'JSX element returned from .map() is missing a "key" prop.',
          severity: 'warning',
          location: locOf(jsx, sf)
        });
      }
    });
  }
};

function findFirstJsx(node: ts.Node): ts.JsxElement | ts.JsxSelfClosingElement | null {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return node;
  let result: ts.JsxElement | ts.JsxSelfClosingElement | null = null;
  ts.forEachChild(node, c => { if (!result) result = findFirstJsx(c); });
  return result;
}
function hasKeyAttribute(jsx: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const attrs = ts.isJsxElement(jsx) ? jsx.openingElement.attributes : jsx.attributes;
  return attrs.properties.some(p => ts.isJsxAttribute(p) && p.name.getText() === 'key');
}

export const reactStateMutationRule: Rule = {
  meta: {
    id: 'react/state-mutation',
    name: 'Direct state mutation',
    description: 'Mutating values returned from useState directly.',
    category: 'framework',
    defaultSeverity: 'warning'
  },
  run(ctx) {
    if (ctx.language !== 'jsx' && ctx.language !== 'tsx' && !ctx.projectContext.hasReact) return;
    const sf = ctx.ast as ts.SourceFile;
    const stateVars = new Set<string>();
    visit(sf, n => {
      if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer)
          && ts.isIdentifier(n.initializer.expression) && n.initializer.expression.text === 'useState'
          && ts.isArrayBindingPattern(n.name)) {
        const first = n.name.elements[0];
        if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
          stateVars.add(first.name.text);
        }
      }
    });
    visit(sf, n => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const obj = n.expression.expression;
        const root = ts.isIdentifier(obj) ? obj.text : null;
        const method = n.expression.name.text;
        if (root && stateVars.has(root) && /^(push|pop|shift|unshift|splice|sort|reverse)$/.test(method)) {
          ctx.report({
            message: `Direct mutation of state "${root}" via .${method}().`,
            severity: 'warning',
            location: locOf(n, sf)
          });
        }
      }
    });
  }
};

export const reactStateAfterUnmountRule: Rule = {
  meta: {
    id: 'react/state-after-unmount',
    name: 'Possible setState after unmount',
    description: 'setState called inside async callbacks without an isMounted/AbortController guard.',
    category: 'framework',
    defaultSeverity: 'info'
  },
  run(ctx) {
    if (ctx.language !== 'jsx' && ctx.language !== 'tsx' && !ctx.projectContext.hasReact) return;
    const sf = ctx.ast as ts.SourceFile;
    const guarded = /\b(isMounted|abortController|AbortController)\b/.test(ctx.sourceText);
    if (guarded) return;
    visit(sf, n => {
      if (!ts.isCallExpression(n)) return;
      // find setState-like names: setX
      const callee = ts.isIdentifier(n.expression) ? n.expression.text : null;
      if (!callee || !/^set[A-Z]/.test(callee)) return;
      // is parent inside .then() or async function body?
      let p: ts.Node | undefined = n.parent;
      while (p) {
        if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'then') {
          ctx.report({
            message: `${callee}() inside .then() without unmount guard — may setState on unmounted component.`,
            severity: 'info',
            location: locOf(n, sf)
          });
          return;
        }
        p = p.parent;
      }
    });
  }
};
