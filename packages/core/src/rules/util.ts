/**
 * Small helpers shared by rules that read nodes from the index instead of
 * walking the tree: span containment (to rebuild nesting from a flat,
 * document-ordered node list) and function naming across grammars.
 */

import type { Position, TSNode } from './types';

/**
 * String offset of a zero-based row/column in `source` — what `TextEdit`
 * offsets are measured in. Used by `Rule.fix` implementations, which receive a
 * resolved diagnostic (row/column) rather than a node.
 */
export function offsetAt(source: string, pos: Position): number {
  let offset = 0;
  for (let row = 0; row < pos.row; row++) {
    const nl = source.indexOf('\n', offset);
    if (nl < 0) return source.length;
    offset = nl + 1;
  }
  return offset + pos.column;
}

/** A node's source span, with `endIndex` read once (it is a WASM call). */
export interface Span {
  start: number;
  end: number;
}

export function spanOf(node: TSNode): Span {
  return { start: node.startIndex, end: node.endIndex };
}

/** True when span `outer` encloses `inner` (equal spans count as enclosing). */
export function encloses(outer: Span, inner: Span): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** True when `node` lies inside `ancestor`'s span (or is the same span). */
export function isWithin(node: TSNode, ancestor: TSNode): boolean {
  return ancestor.startIndex <= node.startIndex && node.endIndex <= ancestor.endIndex;
}

/**
 * The chain of enclosing "scope" nodes while iterating a document-ordered node
 * list (e.g. from `ctx.nodesOfType`): call `at(span)` for each node to drop
 * scopes that ended before it, then `push` when the node opens a new scope.
 * Replaces the recursive walk + depth/scope arguments of a hand-written walk.
 */
export class EnclosingStack<T> {
  private frames: Array<{ span: Span; value: T }> = [];

  /** Pop the frames that do not enclose `span`. */
  at(span: Span): this {
    while (this.frames.length > 0 && !encloses(this.frames[this.frames.length - 1].span, span)) {
      this.frames.pop();
    }
    return this;
  }

  push(span: Span, value: T): void {
    this.frames.push({ span, value });
  }

  /** The innermost enclosing frame's value, if any. */
  innermost(): T | undefined {
    return this.frames[this.frames.length - 1]?.value;
  }

  /** Enclosing values, innermost first. */
  *values(): IterableIterator<T> {
    for (let i = this.frames.length - 1; i >= 0; i--) yield this.frames[i].value;
  }

  get depth(): number {
    return this.frames.length;
  }
}

/**
 * Structural fingerprint of a subtree: the sequence of every node type in it
 * (named and anonymous, so operators count but identifier names and literal
 * values do not), hashed with djb2. Two functions with the same signature have
 * the same shape. Uses a TreeCursor — roughly half the cost of `child(i)`
 * recursion over web-tree-sitter.
 */
export function structuralSignature(node: TSNode): { hash: number; size: number } {
  let hash = 5381;
  let size = 0;
  const cursor = node.walk();
  try {
    for (;;) {
      const type = cursor.nodeType;
      for (let i = 0; i < type.length; i++) hash = (hash * 33) ^ type.charCodeAt(i);
      hash = (hash * 33) ^ 44; // ',' separator, as in the joined sequence
      size++;
      if (cursor.gotoFirstChild()) continue;
      while (!cursor.gotoNextSibling()) {
        if (!cursor.gotoParent()) return { hash: hash >>> 0, size };
      }
    }
  } finally {
    cursor.delete();
  }
}

/** JS/TS function-like node types. */
export const JS_FUNCTION_TYPES = [
  'function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition',
  'generator_function',
  'generator_function_declaration'
];
const JS_FUNCTION_SET = new Set(JS_FUNCTION_TYPES);

/** The nearest enclosing JS/TS function of `node` (excluding itself), if any. */
export function enclosingJsFunction(node: TSNode): TSNode | null {
  let cur = node.parent;
  while (cur && !JS_FUNCTION_SET.has(cur.type)) cur = cur.parent;
  return cur;
}

/** True if a JS/TS function node carries the `async` keyword. */
export function isAsyncJsFunction(fn: TSNode): boolean {
  for (let i = 0; i < fn.childCount; i++) {
    if (fn.child(i)?.type === 'async') return true;
  }
  return false;
}

/** The node holding a function's code: its `body` field, or the node itself. */
export function functionBody(fn: TSNode): TSNode {
  return fn.childForFieldName('body') ?? fn;
}

const DART_SIGNATURES = new Set([
  'function_signature',
  'getter_signature',
  'setter_signature',
  'constructor_signature',
  'factory_constructor_signature',
  'operator_signature'
]);

/**
 * The name node of a function, if it has one. Most grammars expose a `name`
 * field on the function node; a Dart function is a signature plus a SIBLING
 * `function_body`, so for a body we read the name off the preceding signature.
 */
export function functionNameNode(fn: TSNode): TSNode | null {
  const direct = fn.childForFieldName('name');
  if (direct) return direct;
  if (fn.type !== 'function_body') return null;
  let sig = fn.previousNamedSibling;
  if (sig?.type === 'method_signature') sig = sig.namedChild(0);
  if (sig?.type === 'declaration') sig = sig.namedChild(0);
  if (!sig || !DART_SIGNATURES.has(sig.type)) return null;
  return sig.childForFieldName('name');
}
