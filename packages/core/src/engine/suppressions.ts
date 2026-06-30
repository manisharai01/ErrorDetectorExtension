/**
 * Inline comment suppressions, parsed from raw source text (comment scanning is
 * cheaper and more robust than walking the tree for trivia).
 *
 * Supported forms:
 *   // ied-disable-next-line IED-Q001        -> suppress that rule on the NEXT line
 *   // ied-disable-next-line                 -> suppress ALL rules on the next line
 *   // ied-disable-line IED-Q001             -> suppress on the SAME line
 *   /* ied-disable IED-Q001 *\/ ... /* ied-enable IED-Q001 *\/  (block)
 */

export interface Suppressions {
  /** row -> set of suppressed rule ids, or '*' for all. */
  byRow: Map<number, Set<string>>;
  /** Ranges [startRow, endRow] with the rule id (or '*') disabled. */
  blocks: Array<{ rule: string; startRow: number; endRow: number }>;
}

// Accept both `//` (JS/TS/Go) and `#` (Python) line-comment markers.
const NEXT_LINE = /(?:\/\/|#)\s*ied-disable-next-line\s*([A-Za-z0-9-]+)?/;
const SAME_LINE = /(?:\/\/|#)\s*ied-disable-line\s*([A-Za-z0-9-]+)?/;
const BLOCK_DISABLE = /ied-disable\b\s*([A-Za-z0-9-]+)?/;
const BLOCK_ENABLE = /ied-enable\b\s*([A-Za-z0-9-]+)?/;

export function parseSuppressions(source: string): Suppressions {
  const lines = source.split('\n');
  const byRow = new Map<number, Set<string>>();
  const blocks: Suppressions['blocks'] = [];
  const openBlocks = new Map<string, number>();

  const add = (row: number, rule: string | undefined) => {
    const set = byRow.get(row) ?? new Set<string>();
    set.add(rule ?? '*');
    byRow.set(row, set);
  };

  for (let row = 0; row < lines.length; row++) {
    const line = lines[row];

    const next = NEXT_LINE.exec(line);
    if (next) add(row + 1, next[1]);

    const same = SAME_LINE.exec(line);
    if (same) add(row, same[1]);

    // Block handling only when not the line/next-line forms, and only in a
    // comment context (so the literal strings in code don't trigger it).
    if (!next && !same && isComment(line)) {
      const dis = BLOCK_DISABLE.exec(line);
      if (dis) openBlocks.set(dis[1] ?? '*', row);
      const en = BLOCK_ENABLE.exec(line);
      if (en) {
        const rule = en[1] ?? '*';
        const start = openBlocks.get(rule);
        if (start !== undefined) {
          blocks.push({ rule, startRow: start, endRow: row });
          openBlocks.delete(rule);
        }
      }
    }
  }
  // Any unclosed block extends to EOF.
  for (const [rule, start] of openBlocks) {
    blocks.push({ rule, startRow: start, endRow: lines.length - 1 });
  }

  return { byRow, blocks };
}

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('#');
}

export function isSuppressed(s: Suppressions, row: number, ruleId: string): boolean {
  const set = s.byRow.get(row);
  if (set && (set.has(ruleId) || set.has('*'))) return true;
  for (const b of s.blocks) {
    if (row >= b.startRow && row <= b.endRow && (b.rule === ruleId || b.rule === '*')) {
      return true;
    }
  }
  return false;
}
