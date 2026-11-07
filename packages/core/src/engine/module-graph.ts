/**
 * Cross-file module graph: who imports whom, and what each module exports.
 * Built once over the scanned set and used for two whole-program checks that a
 * single-file rule cannot do:
 *
 *   • findImportCycles — modules that import each other in a loop. In JS the
 *     loser of the race sees `undefined` bindings at load time; in Python the
 *     classic "partially initialized module … (most likely due to a circular
 *     import)" error. Only imports evaluated at load time count: `import type`,
 *     dynamic `import()`, requires inside functions, Python imports inside
 *     functions or under `if TYPE_CHECKING:` are ignored.
 *   • findBrokenImports — relative JS/TS imports of a file that does not exist,
 *     or of a name the target module does not export (including a default
 *     import from a module without a default export).
 *
 * Conservative: only relative JS/TS specifiers are resolved (path aliases and
 * packages are skipped); a target whose export surface cannot be known
 * (CommonJS, `export =`, `export * from`, plain .js scripts, Vue SFCs) is never
 * reported for missing names.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ParserManager } from './parser';
import { languageFromPath } from './analyzer';
import type { Language, Range, TSNode } from '../rules/types';
import type { ProjectFile } from './project-graph';

export interface ImportedName {
  name: string;
  location: Range;
}

export interface ModuleImport {
  specifier: string;
  /** Graph key of the resolved module in the scanned set, or null. */
  target: string | null;
  /** True when nothing exists on disk for this relative specifier. */
  missing: boolean;
  /** Names requested from the module (`default` for a default import). */
  names: ImportedName[];
  /** Evaluated when the importing module loads (participates in cycles). */
  eager: boolean;
  location: Range;
}

export interface ModuleInfo {
  filePath: string;
  key: string;
  language: Language;
  imports: ModuleImport[];
  /** Exported names, or null when the export surface cannot be known. */
  exports: Set<string> | null;
}

export interface ImportCycle {
  /** The modules in cycle order (each imports the next; the last imports the first). */
  files: string[];
  /** The import statement in each module that continues the cycle. */
  edges: Array<{ from: string; to: string; location: Range }>;
}

export interface BrokenImport {
  filePath: string;
  specifier: string;
  kind: 'missing-module' | 'missing-export';
  /** The missing export (for `missing-export`). */
  name?: string;
  location: Range;
}

const JS_LANGS = new Set<Language>(['javascript', 'jsx', 'typescript', 'tsx', 'vue']);
const JS_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue'];
/** Targets whose exports we can enumerate from ESM syntax alone. */
const TYPED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function rangeOf(node: TSNode): Range {
  return {
    start: { row: node.startPosition.row, column: node.startPosition.column },
    end: { row: node.endPosition.row, column: node.endPosition.column }
  };
}

/** Canonical graph key: absolute, forward slashes, case-folded on Windows. */
export function moduleKey(filePath: string): string {
  const abs = path.resolve(filePath).split(path.sep).join('/');
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

function stringValue(node: TSNode | null): string | null {
  if (!node || node.type !== 'string') return null;
  return node.text.slice(1, -1);
}

function hasChild(node: TSNode, type: string): boolean {
  for (let i = 0; i < node.childCount; i++) if (node.child(i)?.type === type) return true;
  return false;
}

function childOfType(node: TSNode, type: string): TSNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.type === type) return c;
  }
  return null;
}

function insideFunction(node: TSNode, functionTypes: Set<string>): boolean {
  for (let cur = node.parent; cur; cur = cur.parent) if (functionTypes.has(cur.type)) return true;
  return false;
}

// ── JS / TS ────────────────────────────────────────────────────────────────

const JS_FUNCTIONS = new Set([
  'function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition',
  'generator_function',
  'generator_function_declaration'
]);

const NAMED_DECLARATIONS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'internal_module',
  'module'
]);

/** Names an `export <declaration>` introduces, or null if they can't be listed. */
function declaredNames(decl: TSNode): string[] | null {
  if (NAMED_DECLARATIONS.has(decl.type)) {
    const name = decl.childForFieldName('name');
    return name ? [name.text] : null;
  }
  if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
    const names: string[] = [];
    for (let i = 0; i < decl.namedChildCount; i++) {
      const d = decl.namedChild(i);
      if (!d || d.type !== 'variable_declarator') continue;
      const name = d.childForFieldName('name');
      if (!name || name.type !== 'identifier') return null; // destructuring export
      names.push(name.text);
    }
    return names;
  }
  return null;
}

function specifierNames(clause: TSNode, pick: 'name' | 'public'): ImportedName[] {
  const out: ImportedName[] = [];
  for (let i = 0; i < clause.namedChildCount; i++) {
    const spec = clause.namedChild(i);
    if (!spec || (spec.type !== 'import_specifier' && spec.type !== 'export_specifier')) continue;
    const name = spec.childForFieldName('name');
    const alias = spec.childForFieldName('alias');
    const node = pick === 'public' ? alias ?? name : name;
    if (node) out.push({ name: node.text.replace(/^['"]|['"]$/g, ''), location: rangeOf(node) });
  }
  return out;
}

interface JsModule {
  imports: Array<Omit<ModuleImport, 'target' | 'missing'>>;
  exports: Set<string> | null;
}

function readJsModule(root: TSNode, source: string, ext: string): JsModule {
  const imports: JsModule['imports'] = [];
  const exports = new Set<string>();
  let open = false;
  let sawExport = false;

  for (let i = 0; i < root.namedChildCount; i++) {
    const stmt = root.namedChild(i);
    if (!stmt) continue;
    if (stmt.type === 'import_statement') {
      const specifier = stringValue(stmt.childForFieldName('source'));
      if (specifier === null) continue;
      const names: ImportedName[] = [];
      const clause = childOfType(stmt, 'import_clause');
      if (clause) {
        for (let j = 0; j < clause.namedChildCount; j++) {
          const part = clause.namedChild(j);
          if (part?.type === 'identifier') names.push({ name: 'default', location: rangeOf(part) });
          if (part?.type === 'named_imports') names.push(...specifierNames(part, 'name'));
        }
      }
      imports.push({ specifier, names, eager: !hasChild(stmt, 'type'), location: rangeOf(stmt) });
    } else if (stmt.type === 'export_statement') {
      sawExport = true;
      const specifier = stringValue(stmt.childForFieldName('source'));
      const clause = childOfType(stmt, 'export_clause');
      const declaration = stmt.childForFieldName('declaration');
      if (hasChild(stmt, 'default')) exports.add('default');
      if (hasChild(stmt, '=')) open = true; // `export = foo`
      if (declaration) {
        const names = declaredNames(declaration);
        if (names) names.forEach((n) => exports.add(n));
        else if (!hasChild(stmt, 'default')) open = true;
      }
      if (clause) specifierNames(clause, 'public').forEach((n) => exports.add(n.name));
      const namespace = childOfType(stmt, 'namespace_export');
      if (namespace) {
        const id = namespace.namedChild(namespace.namedChildCount - 1);
        if (id) exports.add(id.text.replace(/^['"]|['"]$/g, ''));
      }
      if (specifier !== null) {
        // Re-export: `export { a } from`, `export * from`, `export * as ns from`.
        if (!clause && !namespace) open = true;
        imports.push({
          specifier,
          names: clause ? specifierNames(clause, 'name') : [],
          eager: !hasChild(stmt, 'type'),
          location: rangeOf(stmt)
        });
      }
    }
  }

  // require('./x') — eager only at module level.
  for (const call of root.descendantsOfType('call_expression')) {
    const fn = call.childForFieldName('function');
    if (!fn || fn.type !== 'identifier' || fn.text !== 'require') continue;
    const specifier = stringValue(call.childForFieldName('arguments')?.namedChild(0) ?? null);
    if (specifier === null) continue;
    imports.push({ specifier, names: [], eager: !insideFunction(call, JS_FUNCTIONS), location: rangeOf(call) });
  }

  if (/\bmodule\.exports\b|\bexports\.[A-Za-z_$]/.test(source)) open = true;
  // Without any ESM export, only TypeScript sources are known to export nothing;
  // a plain .js file may be a script or CommonJS we did not recognise.
  if (!sawExport && !TYPED_EXTENSIONS.has(ext)) open = true;
  if (ext === '.vue') open = true;
  return { imports, exports: open ? null : exports };
}

// ── Python ─────────────────────────────────────────────────────────────────

interface PyImport {
  /** Leading dots of a relative import (0 = absolute). */
  level: number;
  module: string[];
  /** `from m import a, b` names (each may itself be a submodule). */
  names: string[];
  location: Range;
}

function readPythonImports(root: TSNode): PyImport[] {
  const out: PyImport[] = [];
  const PY_FUNCTIONS = new Set(['function_definition', 'lambda']);
  const dotted = (n: TSNode | null): string[] =>
    n ? n.descendantsOfType('identifier').map((i) => i.text) : [];

  for (const stmt of root.descendantsOfType(['import_statement', 'import_from_statement'])) {
    if (insideFunction(stmt, PY_FUNCTIONS)) continue;
    let typeOnly = false;
    for (let cur = stmt.parent; cur; cur = cur.parent) {
      if (cur.type === 'if_statement' && /TYPE_CHECKING/.test(cur.childForFieldName('condition')?.text ?? '')) {
        typeOnly = true;
        break;
      }
    }
    if (typeOnly) continue;

    if (stmt.type === 'import_statement') {
      for (let i = 0; i < stmt.namedChildCount; i++) {
        const item = stmt.namedChild(i);
        const name = item?.type === 'aliased_import' ? item.childForFieldName('name') : item;
        if (name?.type === 'dotted_name') {
          out.push({ level: 0, module: dotted(name), names: [], location: rangeOf(stmt) });
        }
      }
      continue;
    }

    const moduleNode = stmt.childForFieldName('module_name');
    if (!moduleNode) continue;
    let level = 0;
    let module: string[];
    if (moduleNode.type === 'relative_import') {
      level = childOfType(moduleNode, 'import_prefix')?.text.length ?? 1;
      module = dotted(childOfType(moduleNode, 'dotted_name'));
    } else {
      module = dotted(moduleNode);
    }
    const names: string[] = [];
    for (let i = 0; i < stmt.namedChildCount; i++) {
      const item = stmt.namedChild(i);
      if (!item || item.startIndex === moduleNode.startIndex) continue;
      const name = item.type === 'aliased_import' ? item.childForFieldName('name') : item;
      if (name?.type === 'dotted_name') names.push(name.text);
    }
    out.push({ level, module, names, location: rangeOf(stmt) });
  }
  return out;
}

// ── Resolution ─────────────────────────────────────────────────────────────

function resolveJs(importer: string, specifier: string, known: Map<string, ModuleInfo>): { target: string | null; missing: boolean } {
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [base];
  for (const ext of JS_EXTENSIONS) candidates.push(base + ext);
  for (const ext of JS_EXTENSIONS) candidates.push(path.join(base, 'index' + ext));
  // TypeScript ESM style: `./util.js` refers to `./util.ts`.
  const js = /\.(m|c)?jsx?$/.exec(specifier);
  if (js) {
    const stem = base.slice(0, -js[0].length);
    for (const ext of ['.ts', '.tsx', '.mts', '.cts', '.d.ts']) candidates.push(stem + ext);
  }

  for (const c of candidates) {
    const key = moduleKey(c);
    if (known.has(key)) return { target: key, missing: false };
  }
  const onDisk = candidates.some((c) => {
    try {
      return fs.statSync(c).isFile();
    } catch {
      return false;
    }
  });
  return { target: null, missing: !onDisk };
}

function pyModuleFile(dir: string, parts: string[], known: Map<string, ModuleInfo>): string | null {
  if (parts.length === 0) {
    const init = moduleKey(path.join(dir, '__init__.py'));
    return known.has(init) ? init : null;
  }
  const joined = path.join(dir, ...parts);
  for (const c of [joined + '.py', path.join(joined, '__init__.py')]) {
    const key = moduleKey(c);
    if (known.has(key)) return key;
  }
  return null;
}

/** Directories an absolute Python import may be relative to, for `file`. */
function pythonRoots(file: string, scanRoot: string, known: Map<string, ModuleInfo>): string[] {
  let dir = path.dirname(path.resolve(file));
  while (known.has(moduleKey(path.join(dir, '__init__.py')))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir === scanRoot ? [dir] : [dir, scanRoot];
}

function commonDir(paths: string[]): string {
  if (paths.length === 0) return process.cwd();
  let common = path.dirname(path.resolve(paths[0]));
  for (const p of paths.slice(1)) {
    const abs = path.resolve(p);
    while (!(abs + path.sep).startsWith(common + path.sep) && path.dirname(common) !== common) {
      common = path.dirname(common);
    }
  }
  return common;
}

// ── Graph ──────────────────────────────────────────────────────────────────

/** Parse every JS/TS/Python file once and resolve its imports. */
export async function buildModuleGraph(
  files: ProjectFile[],
  parser: ParserManager = new ParserManager()
): Promise<Map<string, ModuleInfo>> {
  const graph = new Map<string, ModuleInfo>();
  const pending: Array<{ info: ModuleInfo; js?: JsModule; py?: PyImport[] }> = [];

  for (const file of files) {
    const language = languageFromPath(file.filePath);
    if (!language || (!JS_LANGS.has(language) && language !== 'python')) continue;
    const { tree } = await parser.parse(language, file.content);
    const info: ModuleInfo = { filePath: file.filePath, key: moduleKey(file.filePath), language, imports: [], exports: null };
    if (language === 'python') {
      pending.push({ info, py: readPythonImports(tree.rootNode) });
    } else {
      const ext = path.extname(file.filePath).toLowerCase();
      const js = readJsModule(tree.rootNode, file.content, file.filePath.toLowerCase().endsWith('.d.ts') ? '.d.ts' : ext);
      info.exports = js.exports;
      pending.push({ info, js });
    }
    tree.delete?.();
    graph.set(info.key, info);
  }

  const scanRoot = commonDir(files.map((f) => f.filePath));
  for (const { info, js, py } of pending) {
    if (js) {
      for (const imp of js.imports) {
        if (!imp.specifier.startsWith('.')) continue; // packages / path aliases
        const { target, missing } = resolveJs(info.filePath, imp.specifier, graph);
        info.imports.push({ ...imp, target, missing });
      }
    }
    if (py) {
      const roots = pythonRoots(info.filePath, scanRoot, graph);
      for (const imp of py) {
        const bases =
          imp.level > 0
            ? [path.resolve(path.dirname(path.resolve(info.filePath)), ...Array(imp.level - 1).fill('..'))]
            : roots;
        let target: string | null = null;
        for (const base of bases) {
          // `from pkg import sub` may name a submodule rather than an attribute.
          for (const name of imp.names) {
            target = pyModuleFile(base, [...imp.module, ...name.split('.')], graph);
            if (target) break;
          }
          target ??= pyModuleFile(base, imp.module, graph);
          if (target) break;
        }
        if (target) {
          info.imports.push({ specifier: '.'.repeat(imp.level) + imp.module.join('.'), target, missing: false, names: [], eager: true, location: imp.location });
        }
      }
    }
  }
  return graph;
}

/** Strongly connected components (Tarjan), over eager edges only. */
function stronglyConnected(graph: Map<string, ModuleInfo>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];

  const successors = (key: string): string[] =>
    (graph.get(key)?.imports ?? []).filter((i) => i.eager && i.target).map((i) => i.target!);

  // Iterative Tarjan so deep import chains cannot overflow the call stack.
  for (const start of graph.keys()) {
    if (indices.has(start)) continue;
    const work: Array<{ key: string; next: number; succ: string[] }> = [];
    const open = (key: string): void => {
      indices.set(key, index);
      low.set(key, index);
      index++;
      stack.push(key);
      onStack.add(key);
      work.push({ key, next: 0, succ: successors(key) });
    };
    open(start);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.next < frame.succ.length) {
        const w = frame.succ[frame.next++];
        if (!indices.has(w)) open(w);
        else if (onStack.has(w)) low.set(frame.key, Math.min(low.get(frame.key)!, indices.get(w)!));
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].key;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.key)!));
      }
      if (low.get(frame.key) === indices.get(frame.key)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== frame.key);
        out.push(component);
      }
    }
  }
  return out;
}

/** Import cycles among the scanned JS/TS/Python modules (one per strongly connected group). */
export async function findImportCycles(
  files: ProjectFile[],
  parser?: ParserManager,
  prebuilt?: Map<string, ModuleInfo>
): Promise<ImportCycle[]> {
  const graph = prebuilt ?? (await buildModuleGraph(files, parser));
  const cycles: ImportCycle[] = [];

  for (const component of stronglyConnected(graph)) {
    const members = new Set(component);
    const selfLoop =
      component.length === 1 &&
      graph.get(component[0])!.imports.some((i) => i.eager && i.target === component[0]);
    if (component.length < 2 && !selfLoop) continue;

    // Shortest loop from the first member (stable: lexicographic) back to itself.
    const start = [...component].sort()[0];
    const prev = new Map<string, { from: string; location: Range }>();
    const queue = [start];
    let closing: { from: string; location: Range } | null = null;
    while (queue.length > 0 && !closing) {
      const cur = queue.shift()!;
      for (const imp of graph.get(cur)!.imports) {
        if (!imp.eager || !imp.target || !members.has(imp.target)) continue;
        if (imp.target === start) {
          closing = { from: cur, location: imp.location };
          break;
        }
        if (!prev.has(imp.target)) {
          prev.set(imp.target, { from: cur, location: imp.location });
          queue.push(imp.target);
        }
      }
    }
    if (!closing) continue;

    const edges: ImportCycle['edges'] = [];
    let to = start;
    let step: { from: string; location: Range } | undefined = closing;
    while (step) {
      edges.unshift({ from: graph.get(step.from)!.filePath, to: graph.get(to)!.filePath, location: step.location });
      if (step.from === start) break;
      to = step.from;
      step = prev.get(step.from);
    }
    cycles.push({ files: edges.map((e) => e.from), edges });
  }
  return cycles;
}

/** Relative JS/TS imports of missing files, or of names the target does not export. */
export async function findBrokenImports(
  files: ProjectFile[],
  parser?: ParserManager,
  prebuilt?: Map<string, ModuleInfo>
): Promise<BrokenImport[]> {
  const graph = prebuilt ?? (await buildModuleGraph(files, parser));
  const out: BrokenImport[] = [];
  for (const info of graph.values()) {
    if (info.language === 'python') continue;
    for (const imp of info.imports) {
      if (imp.missing) {
        out.push({ filePath: info.filePath, specifier: imp.specifier, kind: 'missing-module', location: imp.location });
        continue;
      }
      const exports = imp.target ? graph.get(imp.target)?.exports : null;
      if (!exports) continue;
      for (const n of imp.names) {
        if (!exports.has(n.name)) {
          out.push({ filePath: info.filePath, specifier: imp.specifier, kind: 'missing-export', name: n.name, location: n.location });
        }
      }
    }
  }
  return out;
}
