/**
 * Inline-suppression parser.
 *
 *   // invisible-ignore-next-line             -> suppress all rules on next line
 *   // invisible-ignore-next-line rule-id     -> suppress specific rule
 *   // invisible-ignore rule-id               -> suppress on the same line
 *   /* invisible-disable rule-id *\/ ... /* invisible-enable rule-id *\/
 */

interface Range { start: number; end: number; ruleIds: Set<string> | '*'; }

export interface Suppressions {
  isSuppressed(line: number, ruleId: string): boolean;
}

export function parseSuppressions(source: string): Suppressions {
  const lines = source.split(/\r?\n/);
  const lineSuppressions = new Map<number, Set<string> | '*'>();
  const ranges: Range[] = [];
  const openDisables = new Map<string | '*', number>();

  const merge = (line: number, ids: Set<string> | '*') => {
    const cur = lineSuppressions.get(line);
    if (cur === '*' || ids === '*') { lineSuppressions.set(line, '*'); return; }
    if (!cur) { lineSuppressions.set(line, new Set(ids)); return; }
    for (const i of ids) cur.add(i);
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];

    let m = /\/\/\s*invisible-ignore-next-line(?:\s+([\w\-,\s]+))?/.exec(ln);
    if (m) {
      const ids = m[1] ? new Set(m[1].split(/[,\s]+/).filter(Boolean)) : '*' as const;
      merge(i + 2, ids);    // i is 0-based; "next line" is human line i+2
    }
    m = /\/\/\s*invisible-ignore(?!-next)(?:\s+([\w\-,\s]+))?/.exec(ln);
    if (m) {
      const ids = m[1] ? new Set(m[1].split(/[,\s]+/).filter(Boolean)) : '*' as const;
      merge(i + 1, ids);
    }
    m = /invisible-disable(?:\s+([\w\-,\s]+))?/.exec(ln);
    if (m) {
      const ids = m[1] ? m[1].split(/[,\s]+/).filter(Boolean) : ['*'];
      for (const id of ids) if (!openDisables.has(id)) openDisables.set(id, i + 1);
    }
    m = /invisible-enable(?:\s+([\w\-,\s]+))?/.exec(ln);
    if (m) {
      const ids = m[1] ? m[1].split(/[,\s]+/).filter(Boolean) : ['*'];
      for (const id of ids) {
        const start = openDisables.get(id);
        if (start !== undefined) {
          ranges.push({ start, end: i + 1, ruleIds: id === '*' ? '*' : new Set([id]) });
          openDisables.delete(id);
        }
      }
    }
  }
  // Close any still-open ranges to EOF
  for (const [id, start] of openDisables) {
    ranges.push({ start, end: lines.length, ruleIds: id === '*' ? '*' : new Set([id]) });
  }

  return {
    isSuppressed(line, ruleId) {
      const ls = lineSuppressions.get(line);
      if (ls === '*' || ls?.has(ruleId)) return true;
      for (const r of ranges) {
        if (line < r.start || line > r.end) continue;
        if (r.ruleIds === '*' || r.ruleIds.has(ruleId)) return true;
      }
      return false;
    }
  };
}
