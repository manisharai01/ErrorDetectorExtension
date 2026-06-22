import * as ts from 'typescript';
import { ParseResult } from './index';

/**
 * Naive Vue SFC parser: extract the contents of a single <script> or
 * <script setup> block and parse it as TS/JS. We preserve original line
 * offsets by prefixing newlines so issue locations map back to the SFC.
 */
const SCRIPT_RE = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/i;

export function parseVue(filePath: string, source: string): ParseResult | null {
  const m = SCRIPT_RE.exec(source);
  if (!m) return null;

  const attrs = m[1] ?? '';
  const body = m[2];
  const isTs = /\blang\s*=\s*["']ts["']/i.test(attrs);

  const before = source.slice(0, m.index + m[0].indexOf(body));
  const newlinesBefore = (before.match(/\n/g) ?? []).length;
  const padded = '\n'.repeat(newlinesBefore) + body;

  const ast = ts.createSourceFile(
    filePath,
    padded,
    ts.ScriptTarget.Latest,
    true,
    isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  return { ast, language: 'vue', sourceText: padded };
}
