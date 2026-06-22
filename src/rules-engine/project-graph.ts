/**
 * Workspace-wide Project Graph.
 *
 * Lightweight, non-type-checked model that complements `ContextBuilder`.
 * Designed to be cheap to update incrementally so cross-file rules can
 * query without re-parsing the world.
 *
 *   Nodes: files, functions, exports, imports
 *   Edges: file->file imports, function->function calls, export->import bindings
 *
 * Also stores a global symbol table tracking variable origins, function
 * return-shape fingerprints, and usage chains for "value from A → used in C"
 * style traces.
 */
import * as ts from 'typescript';
import * as path from 'path';

export type NodeKind = 'file' | 'function' | 'export' | 'import' | 'variable';

export interface GraphNode {
  id: string;             // unique key, e.g. "file:/src/a.ts" or "fn:/src/a.ts#foo"
  kind: NodeKind;
  filePath: string;
  name?: string;
  line?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'imports' | 'calls' | 'binds' | 'returns' | 'flows-to';
  meta?: Record<string, unknown>;
}

/** Origin metadata for a tracked variable or function return. */
export interface OriginInfo {
  filePath: string;
  line: number;
  source: 'parameter' | 'literal' | 'call' | 'import' | 'user-input' | 'unknown';
  /** Identifier the value is bound to. */
  symbol: string;
  /** For function-return origins, a stable shape fingerprint. */
  shape?: string;
}

export interface FunctionInfo {
  id: string;             // "fn:/src/a.ts#foo"
  filePath: string;
  name: string;
  line: number;
  returnShapes: Set<string>;
  /** Symbol names of parameters tainted as user-input (best-effort). */
  taintedParams: Set<string>;
  /** Whether the function is async. */
  isAsync: boolean;
}

export class ProjectGraph {
  private nodes = new Map<string, GraphNode>();
  private outgoing = new Map<string, GraphEdge[]>();
  private incoming = new Map<string, GraphEdge[]>();

  /** filePath -> functions defined */
  private functionsByFile = new Map<string, FunctionInfo[]>();
  /** filePath -> variable origins */
  private originsByFile = new Map<string, Map<string, OriginInfo>>();
  /** "fileA->fileB" import edges (resolved relative paths only). */
  private fileImports = new Map<string, Set<string>>();
  /** Reverse import map for incremental dependent re-analysis. */
  private fileDependents = new Map<string, Set<string>>();
  /** Exports: filePath -> name -> location */
  private exportsByFile = new Map<string, Map<string, { line: number }>>();
  /** Importers per "filePath#name" so we can find unused exports cheaply. */
  private exportConsumers = new Map<string, Set<string>>();

  // --- mutation -----------------------------------------------------------

  remove(filePath: string): void {
    // remove function nodes
    for (const fn of this.functionsByFile.get(filePath) ?? []) this.removeNode(fn.id);
    this.functionsByFile.delete(filePath);
    this.originsByFile.delete(filePath);
    // file node + its edges
    this.removeNode(`file:${filePath}`);
    // forget imports originating here
    const out = this.fileImports.get(filePath);
    if (out) {
      for (const t of out) this.fileDependents.get(t)?.delete(filePath);
      this.fileImports.delete(filePath);
    }
    // exports
    const exps = this.exportsByFile.get(filePath);
    if (exps) {
      for (const name of exps.keys()) this.exportConsumers.delete(`${filePath}#${name}`);
      this.exportsByFile.delete(filePath);
    }
  }

  update(filePath: string, sf: ts.SourceFile): void {
    this.remove(filePath);
    this.addNode({ id: `file:${filePath}`, kind: 'file', filePath });

    const functions: FunctionInfo[] = [];
    const origins = new Map<string, OriginInfo>();
    const importedFiles = new Set<string>();
    const exports = new Map<string, { line: number }>();
    const dir = path.dirname(filePath);

    const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

    const recordFunction = (n: ts.FunctionLikeDeclaration, name: string) => {
      const info: FunctionInfo = {
        id: `fn:${filePath}#${name}`,
        filePath,
        name,
        line: lineOf(n),
        returnShapes: collectReturnShapes(n, sf),
        taintedParams: new Set(),
        isAsync: !!n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
      };
      functions.push(info);
      this.addNode({ id: info.id, kind: 'function', filePath, name, line: info.line });
    };

    const visit = (n: ts.Node) => {
      // function-like nodes
      if (ts.isFunctionDeclaration(n) && n.name) recordFunction(n, n.name.text);
      else if (ts.isMethodDeclaration(n) && n.name && ts.isIdentifier(n.name)) recordFunction(n, n.name.text);
      else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer
               && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
        recordFunction(n.initializer, n.name.text);
      }

      // imports
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (spec.startsWith('.')) {
          const resolved = path.normalize(path.join(dir, spec));
          importedFiles.add(resolved);
        }
        if (n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
          for (const el of n.importClause.namedBindings.elements) {
            // file#name consumer registration is done after we resolve imports below
            origins.set(el.name.text, {
              filePath, line: lineOf(el), source: 'import', symbol: el.name.text
            });
          }
        }
      }

      // variable origins (best-effort)
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        origins.set(n.name.text, classifyOrigin(filePath, n.name.text, n.initializer, lineOf(n)));
      }

      // exports
      if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isVariableStatement(n)) &&
          n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isVariableStatement(n)) {
          for (const d of n.declarationList.declarations) {
            if (ts.isIdentifier(d.name)) exports.set(d.name.text, { line: lineOf(d) });
          }
        } else if (n.name) {
          exports.set(n.name.text, { line: lineOf(n.name) });
        }
      }

      ts.forEachChild(n, visit);
    };
    visit(sf);

    this.functionsByFile.set(filePath, functions);
    this.originsByFile.set(filePath, origins);
    this.exportsByFile.set(filePath, exports);
    this.fileImports.set(filePath, importedFiles);
    for (const t of importedFiles) {
      const set = this.fileDependents.get(t) ?? new Set();
      set.add(filePath); this.fileDependents.set(t, set);
      this.addEdge({ from: `file:${filePath}`, to: `file:${t}`, kind: 'imports' });
    }
  }

  // --- query --------------------------------------------------------------

  /** Files that should be re-analysed when `filePath` changes. */
  dependentsOf(filePath: string): string[] {
    return [...(this.fileDependents.get(filePath) ?? [])];
  }

  /** All files known to the graph. */
  files(): string[] {
    return [...this.functionsByFile.keys()];
  }

  functionsIn(filePath: string): FunctionInfo[] {
    return this.functionsByFile.get(filePath) ?? [];
  }

  originsIn(filePath: string): Map<string, OriginInfo> {
    return this.originsByFile.get(filePath) ?? new Map();
  }

  exportsOf(filePath: string): Map<string, { line: number }> {
    return this.exportsByFile.get(filePath) ?? new Map();
  }

  /**
   * Project-level unused exports: an export with no consumer file importing it.
   * We approximate by checking if any importing file mentions the symbol name in
   * its import origins map.
   */
  unusedExports(): Array<{ filePath: string; name: string; line: number }> {
    const importedNames = new Set<string>();
    for (const origins of this.originsByFile.values()) {
      for (const [name, o] of origins) if (o.source === 'import') importedNames.add(name);
    }
    const out: Array<{ filePath: string; name: string; line: number }> = [];
    for (const [file, exps] of this.exportsByFile) {
      for (const [name, info] of exps) {
        if (name === 'default') continue;
        if (!importedNames.has(name)) out.push({ filePath: file, name, line: info.line });
      }
    }
    return out;
  }

  /**
   * Functions whose return shapes vary between calls (heuristic). For example a
   * function returning `{ ok: true, data }` on one branch and `null` on another.
   */
  inconsistentReturnShapes(): Array<{ id: string; filePath: string; name: string; line: number; shapes: string[] }> {
    const out: Array<{ id: string; filePath: string; name: string; line: number; shapes: string[] }> = [];
    for (const list of this.functionsByFile.values()) {
      for (const fn of list) {
        if (fn.returnShapes.size > 1) {
          out.push({ id: fn.id, filePath: fn.filePath, name: fn.name, line: fn.line, shapes: [...fn.returnShapes] });
        }
      }
    }
    return out;
  }

  // --- private ------------------------------------------------------------

  private addNode(n: GraphNode): void { this.nodes.set(n.id, n); }
  private removeNode(id: string): void {
    this.nodes.delete(id);
    for (const e of this.outgoing.get(id) ?? []) {
      const inc = this.incoming.get(e.to);
      if (inc) this.incoming.set(e.to, inc.filter(x => x !== e));
    }
    this.outgoing.delete(id);
    for (const e of this.incoming.get(id) ?? []) {
      const out = this.outgoing.get(e.from);
      if (out) this.outgoing.set(e.from, out.filter(x => x !== e));
    }
    this.incoming.delete(id);
  }
  private addEdge(e: GraphEdge): void {
    (this.outgoing.get(e.from) ?? this.outgoing.set(e.from, []).get(e.from)!).push(e);
    (this.incoming.get(e.to)   ?? this.incoming.set(e.to,   []).get(e.to)!  ).push(e);
  }
}

// ---------------------------------------------------------------------------
// helpers

const TAINT_HINTS = /req\.(body|params|query)|process\.argv|window\.location|document\.location|location\.search/;

function classifyOrigin(filePath: string, symbol: string, init: ts.Expression, line: number): OriginInfo {
  if (ts.isStringLiteralLike(init) || ts.isNumericLiteral(init) || init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) {
    return { filePath, line, source: 'literal', symbol };
  }
  const text = init.getText();
  if (TAINT_HINTS.test(text)) return { filePath, line, source: 'user-input', symbol };
  if (ts.isCallExpression(init)) return { filePath, line, source: 'call', symbol };
  return { filePath, line, source: 'unknown', symbol };
}

function collectReturnShapes(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): Set<string> {
  const shapes = new Set<string>();
  if (!fn.body) return shapes;
  const visit = (n: ts.Node) => {
    if (ts.isFunctionLike(n) && n !== fn) return;
    if (ts.isReturnStatement(n)) {
      shapes.add(shapeOf(n.expression));
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  if (shapes.size === 0) shapes.add('void');
  return shapes;

  function shapeOf(e: ts.Expression | undefined): string {
    if (!e) return 'void';
    if (e.kind === ts.SyntaxKind.NullKeyword) return 'null';
    if (e.kind === ts.SyntaxKind.UndefinedKeyword) return 'undefined';
    if (ts.isStringLiteralLike(e)) return 'string';
    if (ts.isNumericLiteral(e)) return 'number';
    if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
    if (ts.isArrayLiteralExpression(e)) return 'array';
    if (ts.isObjectLiteralExpression(e)) {
      const keys = e.properties
        .map(p => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) ? p.name.getText(sf) : '?')
        .sort()
        .join(',');
      return `object{${keys}}`;
    }
    if (ts.isCallExpression(e)) return 'call';
    return 'unknown';
  }
}
