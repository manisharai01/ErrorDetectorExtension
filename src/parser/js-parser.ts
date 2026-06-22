import * as ts from 'typescript';
import { ParseResult } from './index';

export function parseJavaScript(filePath: string, source: string, jsx: boolean): ParseResult {
  const ast = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.ScriptKind.JSX : ts.ScriptKind.JS
  );
  return { ast, language: jsx ? 'jsx' : 'js', sourceText: source };
}
