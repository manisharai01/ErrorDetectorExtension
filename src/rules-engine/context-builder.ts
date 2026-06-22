import * as ts from 'typescript';
import * as path from 'path';
import { ProjectContext } from './types';

/**
 * Builds and updates a workspace-wide `ProjectContext` used for cross-file
 * analyses (unused exports, circular deps, dead code, call-graph queries).
 */
export class ContextBuilder {
  private ctx: ProjectContext = {
    exports: new Map(),
    imports: new Map(),
    callGraph: new Map(),
    fileHashes: new Map(),
    hasReact: false,
    hasVue: false
  };
  /** importer -> set of resolved importee paths (best-effort) */
  private importGraph = new Map<string, Set<string>>();

  context(): ProjectContext { return this.ctx; }

  remove(filePath: string): void {
    this.ctx.exports.delete(filePath);
    this.ctx.imports.delete(filePath);
    this.ctx.callGraph.delete(filePath);
    this.ctx.fileHashes.delete(filePath);
    this.importGraph.delete(filePath);
  }

  update(filePath: string, ast: ts.SourceFile, hash: string): void {
    this.remove(filePath);
    this.ctx.fileHashes.set(filePath, hash);

    const exportNames = new Set<string>();
    const importRefs = new Set<string>();
    const callees = new Set<string>();
    const importedFiles = new Set<string>();

    const visit = (node: ts.Node) => {
      // exports
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const e of node.exportClause.elements) exportNames.add(e.name.text);
      } else if (ts.isExportAssignment(node)) {
        exportNames.add('default');
      } else if (
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node)) &&
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        if (ts.isVariableStatement(node)) {
          for (const d of node.declarationList.declarations) {
            if (ts.isIdentifier(d.name)) exportNames.add(d.name.text);
          }
        } else if (node.name) {
          exportNames.add(node.name.text);
        }
      }

      // imports
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const mod = node.moduleSpecifier.text;
        importRefs.add(mod);
        if (mod.startsWith('.')) {
          const resolved = path.normalize(path.join(path.dirname(filePath), mod));
          importedFiles.add(resolved);
        }
        if (mod === 'react' || mod.startsWith('react/')) this.ctx.hasReact = true;
        if (mod === 'vue' || mod.startsWith('vue/')) this.ctx.hasVue = true;
        if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const el of node.importClause.namedBindings.elements) {
            importRefs.add(`${mod}#${el.name.text}`);
          }
        }
      }

      // calls
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isIdentifier(expr)) callees.add(expr.text);
        else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) callees.add(expr.name.text);
      }

      ts.forEachChild(node, visit);
    };
    visit(ast);

    this.ctx.exports.set(filePath, exportNames);
    this.ctx.imports.set(filePath, importRefs);
    this.ctx.callGraph.set(filePath, callees);
    this.importGraph.set(filePath, importedFiles);
  }

  /** Best-effort circular dependency detection (DFS). */
  findCycles(): string[][] {
    const cycles: string[][] = [];
    const stack: string[] = [];
    const onStack = new Set<string>();
    const visited = new Set<string>();

    const dfs = (node: string) => {
      visited.add(node);
      stack.push(node);
      onStack.add(node);
      const neighbours = this.importGraph.get(node) ?? new Set();
      for (const n of neighbours) {
        if (!visited.has(n)) dfs(n);
        else if (onStack.has(n)) {
          const idx = stack.indexOf(n);
          if (idx >= 0) cycles.push(stack.slice(idx).concat(n));
        }
      }
      stack.pop();
      onStack.delete(node);
    };

    for (const n of this.importGraph.keys()) if (!visited.has(n)) dfs(n);
    return cycles;
  }

  /** Returns exports that are never imported anywhere in the project. */
  unusedExports(): { filePath: string; name: string }[] {
    const importedNames = new Set<string>();
    for (const refs of this.ctx.imports.values()) {
      for (const r of refs) {
        const i = r.indexOf('#');
        if (i >= 0) importedNames.add(r.slice(i + 1));
      }
    }
    const result: { filePath: string; name: string }[] = [];
    for (const [file, names] of this.ctx.exports) {
      for (const n of names) {
        if (n === 'default') continue;
        if (!importedNames.has(n)) result.push({ filePath: file, name: n });
      }
    }
    return result;
  }
}
