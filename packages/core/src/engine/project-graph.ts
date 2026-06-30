/**
 * Cross-file analysis: find exported symbols that are never imported anywhere
 * in the scanned set. This is the multi-file counterpart to the per-file rules
 * (rules see one file; this needs the whole program), so it lives as a
 * project-level helper rather than a `Rule`.
 *
 * Conservative by design — it under-reports rather than cry wolf:
 *   • Only JS/TS-family files (Python/Go have different module systems).
 *   • A name is "used" if ANY file imports it by name, OR re-exports it. We
 *     match by name globally (not by resolved module path), so a name exported
 *     in one file and imported from another still counts as used.
 *   • `export default` and `export … from` re-exports are not themselves flagged.
 *   • Namespace imports (`import * as ns`) don't name specific exports; a module
 *     consumed only that way may yield false positives (documented caveat).
 *   • Public-API entry points (exports consumed outside the scanned set) will be
 *     reported — run against a whole program, or ignore known entry points.
 */
import { ParserManager } from './parser';
import { languageFromPath } from './analyzer';
import type { Range, TSNode } from '../rules/types';

export interface UnusedExport {
  filePath: string;
  name: string;
  /** 0-based, same convention as Diagnostic.range. */
  location: Range;
}

export interface ProjectFile {
  filePath: string;
  content: string;
}

const JS_LANGS = new Set(['javascript', 'jsx', 'typescript', 'tsx', 'vue']);

function locOf(node: TSNode): Range {
  return {
    start: { row: node.startPosition.row, column: node.startPosition.column },
    end: { row: node.endPosition.row, column: node.endPosition.column }
  };
}

/** Name identifier nodes declared by an `export <declaration>`. */
function declarationNames(decl: TSNode): TSNode[] {
  if (
    decl.type === 'function_declaration' ||
    decl.type === 'generator_function_declaration' ||
    decl.type === 'class_declaration'
  ) {
    const n = decl.childForFieldName('name');
    return n ? [n] : [];
  }
  if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
    const names: TSNode[] = [];
    for (let i = 0; i < decl.namedChildCount; i++) {
      const d = decl.namedChild(i);
      if (d && d.type === 'variable_declarator') {
        const n = d.childForFieldName('name');
        if (n && n.type === 'identifier') names.push(n);
      }
    }
    return names;
  }
  return [];
}

function firstChildOfType(node: TSNode, type: string): TSNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.type === type) return c;
  }
  return null;
}

/** Find exports that no file imports by name. */
export async function findUnusedExports(
  files: ProjectFile[],
  parser: ParserManager = new ParserManager()
): Promise<UnusedExport[]> {
  const exported: { filePath: string; name: string; node: TSNode }[] = [];
  const importedNames = new Set<string>();

  for (const file of files) {
    const lang = languageFromPath(file.filePath);
    if (!lang || !JS_LANGS.has(lang)) continue;

    const { tree } = await parser.parse(lang, file.content);

    const walk = (node: TSNode): void => {
      if (node.type === 'export_statement') {
        const source = node.childForFieldName('source');
        const clause = firstChildOfType(node, 'export_clause');
        if (source) {
          // Re-export `export { x } from './y'` — counts x as a use of './y',
          // and is not itself flagged.
          if (clause) {
            for (let i = 0; i < clause.namedChildCount; i++) {
              const spec = clause.namedChild(i);
              const name = spec?.childForFieldName('name');
              if (name) importedNames.add(name.text);
            }
          }
        } else if (node.childForFieldName('declaration')) {
          for (const n of declarationNames(node.childForFieldName('declaration')!)) {
            exported.push({ filePath: file.filePath, name: n.text, node: n });
          }
        } else if (clause) {
          // `export { a, b as c }` — public name is the alias if present.
          for (let i = 0; i < clause.namedChildCount; i++) {
            const spec = clause.namedChild(i);
            if (!spec || spec.type !== 'export_specifier') continue;
            const alias = spec.childForFieldName('alias');
            const name = spec.childForFieldName('name');
            const publicNode = alias ?? name;
            if (publicNode) exported.push({ filePath: file.filePath, name: publicNode.text, node: publicNode });
          }
        }
        // `export default …` (value:) is intentionally not tracked by name.
      } else if (node.type === 'import_statement') {
        const clause = firstChildOfType(node, 'import_clause');
        const named = clause ? firstChildOfType(clause, 'named_imports') : null;
        if (named) {
          for (let i = 0; i < named.namedChildCount; i++) {
            const spec = named.namedChild(i);
            if (spec && spec.type === 'import_specifier') {
              const name = spec.childForFieldName('name');
              if (name) importedNames.add(name.text);
            }
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };

    walk(tree.rootNode);
  }

  return exported
    .filter((e) => !importedNames.has(e.name))
    .map((e) => ({ filePath: e.filePath, name: e.name, location: locOf(e.node) }));
}
