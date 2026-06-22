import * as ts from 'typescript';
import { ParseResult } from './index';

export function parseTypeScript(filePath: string, source: string, jsx: boolean): ParseResult {
  const ast = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  return { ast, language: jsx ? 'tsx' : 'ts', sourceText: source };
}
