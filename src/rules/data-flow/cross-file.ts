/**
 * Project-graph driven cross-file rules. These run AFTER per-file analysis,
 * once the workspace has been walked and the ProjectGraph is up to date.
 */
import * as path from 'path';
import { ProjectGraph } from '../../rules-engine/project-graph';
import { Issue } from '../../rules-engine/types';

export interface CrossFileResult {
  filePath: string;
  issues: Issue[];
}

export function runCrossFileRules(graph: ProjectGraph): CrossFileResult[] {
  const out = new Map<string, Issue[]>();
  const push = (file: string, issue: Issue) => {
    (out.get(file) ?? out.set(file, []).get(file)!).push(issue);
  };

  // 1. unused exports across the project
  for (const u of graph.unusedExports()) {
    push(u.filePath, {
      ruleId: 'project/unused-export',
      message: `Exported "${u.name}" is not imported anywhere in the project.`,
      severity: 'info',
      confidence: 0.8,
      filePath: u.filePath,
      location: { startLine: u.line, startCol: 1, endLine: u.line, endCol: 1 },
      explanation: {
        summary: 'Dead exports linger after refactors and slowly bloat the public surface.',
        whyItMatters: 'They confuse newcomers, inflate bundle sizes, and prevent the type system from catching mistakes.',
        suggestedFix: 'Delete the export, or downgrade it to a local definition.'
      }
    });
  }

  // 2. inconsistent return shapes
  for (const f of graph.inconsistentReturnShapes()) {
    push(f.filePath, {
      ruleId: 'project/inconsistent-returns',
      message: `Function "${f.name}" returns ${f.shapes.length} different shapes: ${f.shapes.join(' | ')}.`,
      severity: 'warning',
      confidence: 0.75,
      filePath: f.filePath,
      location: { startLine: f.line, startCol: 1, endLine: f.line, endCol: 1 },
      explanation: {
        summary: 'Callers must defensively branch on shape, which is brittle and easy to get wrong.',
        whyItMatters: 'A function that sometimes returns null and sometimes an object forces every call site to add a guard.',
        suggestedFix: 'Pick one shape (e.g. always return `{ ok, data, error }`) and convert other branches to match.',
        example: { bad: 'return null;  /* and elsewhere */ return { id: 1 };', good: 'return { ok: false };  /* and */ return { ok: true, id: 1 };' }
      }
    });
  }

  // 3. broken imports — resolved file not in graph
  const known = new Set(graph.files());
  for (const file of graph.files()) {
    const exps = graph.exportsOf(file); void exps;
    const origins = graph.originsIn(file);
    for (const [name, info] of origins) {
      if (info.source !== 'import') continue;
      // We don't have the resolved module path stored against name, so we
      // surface this only when an import name exactly matches an exported
      // symbol nowhere in the project.
      let foundProvider = false;
      for (const f2 of known) {
        if (graph.exportsOf(f2).has(name)) { foundProvider = true; break; }
      }
      if (!foundProvider) {
        push(file, {
          ruleId: 'project/broken-import',
          message: `Imported symbol "${name}" is not exported by any project file.`,
          severity: 'warning',
          confidence: 0.55,    // could be a node_module — keep low
          filePath: file,
          location: { startLine: info.line, startCol: 1, endLine: info.line, endCol: 1 },
          explanation: {
            summary: 'The symbol may be coming from a third-party package — verify the import path.',
            whyItMatters: 'Broken local imports show up as undefined at runtime, often only on a specific code path.',
            suggestedFix: 'Confirm the export still exists, or update the import path.'
          }
        });
      }
    }
  }

  return [...out.entries()].map(([filePath, issues]) => ({ filePath, issues }));
}

export function describeTrace(steps: { filePath: string; description: string }[]): string {
  return steps.map(s => `${path.basename(s.filePath)}: ${s.description}`).join(' → ');
}
