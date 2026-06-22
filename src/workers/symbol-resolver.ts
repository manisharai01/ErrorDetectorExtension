/**
 * Symbol resolver utility used by the cross-file analyses. Walks `import`
 * specifiers, turning relative paths into absolute ones and tracking which
 * symbols a file pulls in from elsewhere.
 *
 * Lives in `workers/` so the heavier traversal can be off-loaded to a
 * worker thread when needed (kept synchronous here for simplicity).
 */
import * as ts from 'typescript';
import * as path from 'path';

export interface ResolvedImport {
  absolutePath: string;
  symbols: string[];
  isDefault: boolean;
}

export function resolveImports(filePath: string, sf: ts.SourceFile): ResolvedImport[] {
  const out: ResolvedImport[] = [];
  const dir = path.dirname(filePath);

  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      if (!spec.startsWith('.')) { ts.forEachChild(n, visit); return; }
      const absolutePath = path.normalize(path.join(dir, spec));
      const symbols: string[] = [];
      let isDefault = false;
      const clause = n.importClause;
      if (clause) {
        if (clause.name) { isDefault = true; symbols.push(clause.name.text); }
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) symbols.push(el.name.text);
        }
      }
      out.push({ absolutePath, symbols, isDefault });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
