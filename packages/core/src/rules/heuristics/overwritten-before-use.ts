/**
 * IED-H002 — overwritten-before-use
 *
 * Flags a value that is assigned to a variable and then overwritten before it
 * is ever read — the first assignment is dead. Conservative and block-scoped:
 * it only looks at the direct statements of a block, only tracks plain
 * `identifier` write targets, and untracks a variable as soon as it is read.
 *
 *   let v = 1;     // ← flagged: overwritten before use
 *   v = 2;
 *   return v;
 *
 * `v = v + 1` is fine (the old value is read on the RHS).
 *
 * Single-file slice of the deferred heuristics work; no CFG.
 */
import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Collect identifier texts referenced within a node (reads, for our purposes). */
function identifiersIn(node: TSNode | null): Set<string> {
  const out = new Set<string>();
  if (!node) return out;
  const walk = (n: TSNode): void => {
    if (n.type === 'identifier') out.add(n.text);
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c) walk(c);
    }
  };
  walk(node);
  return out;
}

interface Write {
  target: string;
  reads: Set<string>;
  /** Node to anchor a report on (the assignment / declarator value). */
  anchor: TSNode;
}

/**
 * Describe a statement as an optional write + the set of variables it reads.
 * Returns null for statements we don't model as a simple single-variable write
 * (their reads are still harvested by the caller).
 */
function describe(stmt: TSNode): { write: Write | null; reads: Set<string> } {
  // expression_statement > assignment_expression (x = …)
  if (stmt.type === 'expression_statement') {
    const expr = stmt.namedChild(0);
    if (expr && expr.type === 'assignment_expression') {
      const left = expr.childForFieldName('left');
      const right = expr.childForFieldName('right');
      const reads = identifiersIn(right);
      if (left && left.type === 'identifier') {
        return { write: { target: left.text, reads, anchor: expr }, reads };
      }
      return { write: null, reads: identifiersIn(expr) };
    }
  }
  // const/let/var x = … (single declarator we model; harvest reads from value)
  if (stmt.type === 'lexical_declaration' || stmt.type === 'variable_declaration') {
    const declarators = [];
    for (let i = 0; i < stmt.namedChildCount; i++) {
      const d = stmt.namedChild(i);
      if (d && d.type === 'variable_declarator') declarators.push(d);
    }
    if (declarators.length === 1) {
      const d = declarators[0];
      const name = d.childForFieldName('name');
      const value = d.childForFieldName('value');
      const reads = identifiersIn(value);
      if (name && name.type === 'identifier' && value) {
        return { write: { target: name.text, reads, anchor: value }, reads };
      }
    }
    return { write: null, reads: identifiersIn(stmt) };
  }
  // Anything else: everything it references counts as a read.
  return { write: null, reads: identifiersIn(stmt) };
}

export const overwrittenBeforeUseRule: Rule = {
  id: 'IED-H002',
  name: 'overwritten-before-use',
  category: 'quality',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'A value is assigned and then overwritten before it is ever read.',
  docs: [
    '# overwritten-before-use (IED-H002)',
    '',
    'Assigning a variable and then reassigning it before reading the first value',
    'means the first assignment was wasted — often a sign of a logic mistake.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const scan = (block: TSNode): void => {
      // target -> pending write not yet read
      const pending = new Map<string, Write>();

      for (let i = 0; i < block.namedChildCount; i++) {
        const stmt = block.namedChild(i);
        if (!stmt) continue;
        const { write, reads } = describe(stmt);

        // Any read of a pending variable "uses" it — clear it.
        for (const r of reads) pending.delete(r);

        if (write) {
          const prev = pending.get(write.target);
          if (prev && !ctx.isSuppressed(prev.anchor.startPosition.row, 'IED-H002')) {
            ctx.report({
              message: `Value assigned to "${write.target}" is overwritten before it is used.`,
              severity: Severity.Info,
              range: nodeRange(prev.anchor),
              data: { name: write.target }
            });
          }
          pending.set(write.target, write);
        }
      }
    };

    const walk = (node: TSNode): void => {
      if (node.type === 'statement_block') scan(node);
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
