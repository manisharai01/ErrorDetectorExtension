import * as fs from 'fs';
import { Command } from 'commander';
import {
  loadConfig,
  runProjectChecks,
  summarize,
  toJson,
  toSarif,
  toHtml,
  IgnoreMatcher,
  PROJECT_CHECKS,
} from '@ied/core';
import type { ProjectCheck, ResolvedConfig } from '@ied/core';
import { printResults, printSummary } from '../output/terminal';
import { collectFiles } from './collect';

interface Options {
  format: string;
  output?: string;
  only?: string;
  minNodes?: string;
  error?: boolean;
}

const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

/** What each check found when it found nothing, for the terminal output. */
const CLEAN: Record<ProjectCheck, string> = {
  cycles: 'no import cycles',
  'broken-imports': 'no broken imports',
  duplicates: 'no functions duplicated across files',
  'unused-exports': 'no unused exports',
};

async function run(paths: string[], checks: ProjectCheck[], opts: Options): Promise<void> {
  const rootDir = process.cwd();
  let config: ResolvedConfig;
  try {
    config = loadConfig(rootDir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
    return;
  }

  const ignore = IgnoreMatcher.fromFiles(rootDir);
  const files = collectFiles(paths, config, ignore, rootDir).map((filePath) => ({
    filePath,
    content: fs.readFileSync(filePath, 'utf8'),
  }));

  const start = Date.now();
  const minNodes = opts.minNodes !== undefined ? Number(opts.minNodes) : undefined;
  const report = await runProjectChecks(files, { checks, minDuplicateNodes: minNodes });
  const all = report.diagnostics;
  const summary = summarize(all);

  let payload: string | null = null;
  switch (opts.format) {
    case 'json':
      payload = toJson(all);
      break;
    case 'sarif':
      payload = toSarif(all);
      break;
    case 'html':
      payload = toHtml(all);
      break;
    case 'terminal':
    default: {
      printResults(all);
      const counts: Record<ProjectCheck, number> = {
        cycles: report.cycles.length,
        'broken-imports': report.brokenImports.length,
        duplicates: report.duplicates.length,
        'unused-exports': report.unusedExports.length,
      };
      for (const check of checks) {
        if (counts[check] === 0) process.stdout.write(`${GREEN}✔${RESET} ${CLEAN[check]}\n`);
      }
      printSummary({
        error: summary.error,
        warning: summary.warning,
        info: summary.info,
        total: summary.total,
        files: files.length,
        cached: 0,
        elapsed: Date.now() - start,
      });
    }
  }
  if (payload !== null) {
    if (opts.output) fs.writeFileSync(opts.output, payload);
    else process.stdout.write(payload);
  }

  const failed = opts.error ? all.length > 0 : summary.error > 0;
  process.exit(failed ? 1 : 0);
}

function withCommonOptions(cmd: Command): Command {
  return cmd
    .argument('[paths...]', 'files or directories to scan', ['.'])
    .option('-f, --format <format>', 'output format: terminal|json|sarif|html', 'terminal')
    .option('-o, --output <file>', 'write output to a file')
    .option('--error', 'exit 1 if anything is found (default: only on error-severity findings)');
}

/** `ied project` — every whole-program check in one run. */
export function projectCommand(): Command {
  const cmd = withCommonOptions(new Command('project'))
    .description(
      'Whole-program checks across files: import cycles, broken imports, duplicate functions across files, unused exports.',
    )
    .option('--only <checks>', `comma-separated subset of: ${PROJECT_CHECKS.join(', ')}`)
    .option('--min-nodes <n>', 'minimum function size (syntax nodes) for cross-file duplicates', '40')
    .action(async (paths: string[], opts: Options) => {
      const requested = opts.only ? opts.only.split(',').map((s) => s.trim()) : PROJECT_CHECKS;
      const unknown = requested.filter((c) => !PROJECT_CHECKS.includes(c as ProjectCheck));
      if (unknown.length > 0) {
        console.error(`Unknown check(s): ${unknown.join(', ')}. Valid: ${PROJECT_CHECKS.join(', ')}`);
        process.exit(2);
      }
      await run(paths, requested as ProjectCheck[], opts);
    });
  return cmd;
}

/** `ied cycles` — import cycles between JS/TS/Python modules. */
export function cyclesCommand(): Command {
  return withCommonOptions(new Command('cycles'))
    .description('Find import cycles between JS/TS/Python modules (IED-X001).')
    .action(async (paths: string[], opts: Options) => run(paths, ['cycles'], opts));
}

/** `ied broken-imports` — relative imports of missing files or missing names. */
export function brokenImportsCommand(): Command {
  return withCommonOptions(new Command('broken-imports'))
    .description('Find relative JS/TS imports of files that do not exist or names that are not exported (IED-X002).')
    .action(async (paths: string[], opts: Options) => run(paths, ['broken-imports'], opts));
}

/** `ied duplicates` — functions copied across files (any language). */
export function duplicatesCommand(): Command {
  return withCommonOptions(new Command('duplicates'))
    .description('Find structurally identical functions copied across different files, in any language (IED-X003).')
    .option('--min-nodes <n>', 'minimum function size in syntax nodes', '40')
    .action(async (paths: string[], opts: Options) => run(paths, ['duplicates'], opts));
}
