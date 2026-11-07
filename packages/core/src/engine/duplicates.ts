/**
 * Cross-file duplicate detection (ported from the legacy `duplicate-logic`
 * heuristic, which hashed a normalised AST so "the workspace driver can
 * collapse duplicates discovered across files").
 *
 * Every function in every scanned file — any language — gets the structural
 * signature duplicate-code (IED-Q007) uses within one file: the sequence of
 * node types in its body, so renamed variables and changed literals still
 * match. Functions sharing a signature across two or more files are reported
 * as a group. The minimum size is higher than the per-file rule's (40 nodes vs
 * 20) because tiny helpers legitimately recur across a codebase.
 *
 * A function nested inside another reported duplicate in the same file is
 * folded into its parent's group, so one copied class is one finding rather
 * than one per method.
 */

import { ParserManager } from './parser';
import { languageFromPath } from './analyzer';
import { profileFor } from './grammar-profile';
import { functionBody, functionNameNode, structuralSignature } from '../rules/util';
import type { Range } from '../rules/types';
import type { ProjectFile } from './project-graph';

export interface DuplicateFunction {
  filePath: string;
  name: string;
  location: Range;
}

export interface DuplicateGroup {
  /** Size of the shared structure, in syntax nodes. */
  nodes: number;
  functions: DuplicateFunction[];
}

export interface DuplicateOptions {
  /** Minimum body size in syntax nodes (default 40). */
  minNodes?: number;
  parser?: ParserManager;
}

interface Candidate extends DuplicateFunction {
  hash: number;
  nodes: number;
  start: number;
  end: number;
}

export async function findDuplicateFunctions(
  files: ProjectFile[],
  opts: DuplicateOptions = {}
): Promise<DuplicateGroup[]> {
  const minNodes = opts.minNodes ?? 40;
  const parser = opts.parser ?? new ParserManager();
  const byHash = new Map<number, Candidate[]>();

  for (const file of files) {
    const language = languageFromPath(file.filePath);
    if (!language) continue;
    const { tree } = await parser.parse(language, file.content);
    for (const fn of tree.rootNode.descendantsOfType(profileFor(language).functionNodes)) {
      if (!fn.isNamed) continue;
      const { hash, size } = structuralSignature(functionBody(fn));
      if (size < minNodes) continue;
      const nameNode = functionNameNode(fn);
      const anchor = nameNode ?? fn;
      const list = byHash.get(hash) ?? [];
      list.push({
        filePath: file.filePath,
        name: nameNode?.text ?? '<anonymous>',
        location: {
          start: { row: anchor.startPosition.row, column: anchor.startPosition.column },
          end: { row: anchor.endPosition.row, column: anchor.endPosition.column }
        },
        hash,
        nodes: size,
        start: fn.startIndex,
        end: fn.endIndex
      });
      byHash.set(hash, list);
    }
    tree.delete?.();
  }

  const spansFiles = (list: Candidate[]): boolean => new Set(list.map((c) => c.filePath)).size > 1;
  const groups = [...byHash.values()].filter(spansFiles);

  // Fold functions nested inside another duplicated function of the same file.
  const duplicatedSpans = new Map<string, Array<{ start: number; end: number }>>();
  for (const group of groups) {
    for (const c of group) {
      const spans = duplicatedSpans.get(c.filePath) ?? [];
      spans.push({ start: c.start, end: c.end });
      duplicatedSpans.set(c.filePath, spans);
    }
  }
  const nested = (c: Candidate): boolean =>
    (duplicatedSpans.get(c.filePath) ?? []).some(
      (s) => s.start <= c.start && c.end <= s.end && (s.start !== c.start || s.end !== c.end)
    );

  return groups
    .map((group) => group.filter((c) => !nested(c)))
    .filter(spansFiles)
    .map((group) => ({
      nodes: group[0].nodes,
      functions: group.map(({ filePath, name, location }) => ({ filePath, name, location }))
    }))
    .sort((a, b) => b.nodes - a.nodes);
}
