/**
 * Whole-program checks, packaged the same way as per-file findings.
 *
 * The cross-file analyses (import cycles, broken imports, duplicates across
 * files, unused exports) need every file at once, so they are not `Rule`s. This
 * module runs any subset of them over a scanned set and also returns their
 * findings as ordinary `Diagnostic`s under `IED-X…` ids, so the CLI reporters
 * (JSON / SARIF / HTML), the dashboard and the editor can treat them exactly
 * like rule findings.
 */

import * as path from 'path';
import { ParserManager } from './parser';
import { fingerprint } from './analyzer';
import { buildModuleGraph, findBrokenImports, findImportCycles, type BrokenImport, type ImportCycle } from './module-graph';
import { findDuplicateFunctions, type DuplicateGroup } from './duplicates';
import { findUnusedExports, type ProjectFile, type UnusedExport } from './project-graph';
import { Severity, type Diagnostic, type Range, type RuleCategory } from '../rules/types';

export type ProjectCheck = 'cycles' | 'broken-imports' | 'duplicates' | 'unused-exports';

export const PROJECT_CHECKS: ProjectCheck[] = ['cycles', 'broken-imports', 'duplicates', 'unused-exports'];

export interface ProjectRule {
  id: string;
  name: string;
  check: ProjectCheck;
  category: RuleCategory;
  severity: Severity;
  description: string;
}

/** Metadata for the project-level checks (listed by `ied rules`, shown on hover). */
export const PROJECT_RULES: ProjectRule[] = [
  {
    id: 'IED-X001',
    name: 'import-cycle',
    check: 'cycles',
    category: 'logic',
    severity: Severity.Warning,
    description: 'Modules import each other in a cycle (undefined bindings / partially initialised modules at load time).'
  },
  {
    id: 'IED-X002',
    name: 'broken-import',
    check: 'broken-imports',
    category: 'logic',
    severity: Severity.Error,
    description: 'Relative import of a file that does not exist, or of a name the module does not export.'
  },
  {
    id: 'IED-X003',
    name: 'duplicate-across-files',
    check: 'duplicates',
    category: 'quality',
    severity: Severity.Info,
    description: 'Structurally identical functions copied across different files.'
  },
  {
    id: 'IED-X004',
    name: 'unused-export',
    check: 'unused-exports',
    category: 'quality',
    severity: Severity.Info,
    description: 'Exported symbol that no scanned file imports.'
  }
];

export interface ProjectReport {
  cycles: ImportCycle[];
  brokenImports: BrokenImport[];
  duplicates: DuplicateGroup[];
  unusedExports: UnusedExport[];
  /** Every finding above as a Diagnostic (`IED-X001` … `IED-X004`). */
  diagnostics: Diagnostic[];
}

export interface ProjectCheckOptions {
  checks?: ProjectCheck[];
  /** Minimum function size for cross-file duplicates (default 40 nodes). */
  minDuplicateNodes?: number;
  parser?: ParserManager;
}

/** Path shown in messages: relative to the working directory, forward slashes. */
function display(filePath: string): string {
  const rel = path.relative(process.cwd(), path.resolve(filePath));
  return (rel && !rel.startsWith('..') ? rel : filePath).split(path.sep).join('/');
}

export async function runProjectChecks(
  files: ProjectFile[],
  opts: ProjectCheckOptions = {}
): Promise<ProjectReport> {
  const checks = new Set(opts.checks ?? PROJECT_CHECKS);
  const parser = opts.parser ?? new ParserManager();
  const report: ProjectReport = { cycles: [], brokenImports: [], duplicates: [], unusedExports: [], diagnostics: [] };

  if (checks.has('cycles') || checks.has('broken-imports')) {
    const graph = await buildModuleGraph(files, parser);
    if (checks.has('cycles')) report.cycles = await findImportCycles(files, parser, graph);
    if (checks.has('broken-imports')) report.brokenImports = await findBrokenImports(files, parser, graph);
  }
  if (checks.has('duplicates')) {
    report.duplicates = await findDuplicateFunctions(files, { minNodes: opts.minDuplicateNodes, parser });
  }
  if (checks.has('unused-exports')) report.unusedExports = await findUnusedExports(files, parser);

  // ── as Diagnostics ───────────────────────────────────────────────────────
  const lines = new Map<string, string[]>();
  const lineOf = (filePath: string, row: number): string => {
    let l = lines.get(filePath);
    if (!l) {
      l = (files.find((f) => f.filePath === filePath)?.content ?? '').split('\n');
      lines.set(filePath, l);
    }
    return l[row] ?? '';
  };
  const rule = (check: ProjectCheck): ProjectRule => PROJECT_RULES.find((r) => r.check === check)!;
  const push = (
    check: ProjectCheck,
    filePath: string,
    range: Range,
    message: string,
    data?: Record<string, unknown>
  ): void => {
    const r = rule(check);
    report.diagnostics.push({
      ruleId: r.id,
      ruleName: r.name,
      category: r.category,
      severity: r.severity,
      message,
      filePath,
      range,
      fix: null,
      fingerprint: fingerprint(r.id, filePath, message, lineOf(filePath, range.start.row)),
      data
    });
  };

  for (const cycle of report.cycles) {
    const loop = [...cycle.files, cycle.files[0]].map(display).join(' → ');
    for (const edge of cycle.edges) {
      push('cycles', edge.from, edge.location, `Import cycle: ${loop}`, { cycle: cycle.files.map(display) });
    }
  }
  for (const b of report.brokenImports) {
    const message =
      b.kind === 'missing-module'
        ? `Cannot resolve "${b.specifier}" — no such file.`
        : b.name === 'default'
          ? `"${b.specifier}" has no default export.`
          : `"${b.specifier}" does not export "${b.name}".`;
    push('broken-imports', b.filePath, b.location, message, { specifier: b.specifier, name: b.name, kind: b.kind });
  }
  for (const group of report.duplicates) {
    for (const fn of group.functions) {
      const others = group.functions
        .filter((o) => o !== fn)
        .map((o) => `${display(o.filePath)}:${o.location.start.row + 1} (${o.name})`);
      push(
        'duplicates',
        fn.filePath,
        fn.location,
        `Function "${fn.name}" is structurally identical to ${others.join(', ')} — extract a shared helper.`,
        { nodes: group.nodes, copies: group.functions.length }
      );
    }
  }
  for (const u of report.unusedExports) {
    push('unused-exports', u.filePath, u.location, `"${u.name}" is exported but never imported.`, { name: u.name });
  }
  return report;
}
