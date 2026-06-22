import * as ts from 'typescript';

export type ParsedLanguage = 'js' | 'jsx' | 'ts' | 'tsx' | 'vue';

export interface ParseResult {
  ast: ts.SourceFile;
  language: ParsedLanguage;
  /** original (possibly extracted) source text the AST was parsed from */
  sourceText: string;
}

export function detectLanguage(filePath: string): ParsedLanguage | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts') && !lower.endsWith('.d.ts')) return 'ts';
  if (lower.endsWith('.jsx')) return 'jsx';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'js';
  if (lower.endsWith('.vue')) return 'vue';
  return null;
}
