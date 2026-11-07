/**
 * Per-file node index — the engine's single-pass traversal.
 *
 * Walking a web-tree-sitter tree from JS is expensive: every `child(i)` /
 * `.type` crosses the WASM boundary and allocates, so a rule that hand-walks a
 * 50k-line file spends ~100ms just visiting nodes. With dozens of rules that
 * was the dominant cost of analysis.
 *
 * Instead, the analyzer gathers the node types every applicable rule declares
 * (`Rule.nodeTypes`) and asks Tree-sitter for all of them in ONE native
 * traversal (`descendantsOfType`, which walks in C and only materializes
 * matches). Rules then read their slice via `RuleContext.nodesOfType`.
 *
 * Types nobody declared are still served — with a dedicated native traversal
 * on first request, cached for the rest of the file's rules.
 *
 * Only NAMED nodes are returned. `descendantsOfType` also matches anonymous
 * tokens that share a name with a named node — Ruby's `if` / `rescue` / `while`
 * keywords, Python's `lambda` keyword — and a rule asking for `rescue` clauses
 * must not get the bare keyword tokens too.
 */

import type { TSNode } from '../rules/types';

function namedOnly(nodes: TSNode[]): TSNode[] {
  return nodes.filter((n) => n.isNamed);
}

export class NodeIndex {
  /** Matches of the shared traversal, in document (pre-)order. */
  private nodes: TSNode[] = [];
  /** `nodes[i].type`, read once (each `.type` read is a WASM call). */
  private types: string[] = [];
  private indexed: Set<string>;
  private cache = new Map<string, readonly TSNode[]>();

  constructor(
    private root: TSNode,
    declaredTypes: Iterable<string>
  ) {
    this.indexed = new Set(declaredTypes);
    if (this.indexed.size > 0) {
      this.nodes = namedOnly(root.descendantsOfType([...this.indexed]));
      this.types = this.nodes.map((n) => n.type);
    }
  }

  /** All nodes whose type is one of `types`, in document order. */
  get(types: string | readonly string[]): readonly TSNode[] {
    const list = typeof types === 'string' ? [types] : types;
    const key = list.length === 1 ? list[0] : [...list].sort().join('\u0000');
    const hit = this.cache.get(key);
    if (hit) return hit;

    let out: TSNode[];
    if (list.every((t) => this.indexed.has(t))) {
      const want = new Set(list);
      out = [];
      for (let i = 0; i < this.nodes.length; i++) {
        if (want.has(this.types[i])) out.push(this.nodes[i]);
      }
    } else {
      out = namedOnly(this.root.descendantsOfType([...list]));
    }
    this.cache.set(key, out);
    return out;
  }
}
