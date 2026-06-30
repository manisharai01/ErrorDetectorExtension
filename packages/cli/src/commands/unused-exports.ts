import * as fs from 'fs';
import { Command } from 'commander';
import { loadConfig, findUnusedExports, IgnoreMatcher } from '@ied/core';
import type { ResolvedConfig, UnusedExport } from '@ied/core';
import { collectFiles } from './collect';

interface Options {
  config?: string;
  error?: boolean;
}

// ANSI helpers (kept local; the CLI has no color dependency).
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

export function unusedExportsCommand(): Command {
  const cmd = new Command('unused-exports');
  cmd
    .description('Cross-file analysis: report exported symbols never imported anywhere in the scan set (JS/TS).')
    .argument('[paths...]', 'files or directories to scan', ['.'])
    .option('--config <path>', 'path to config file')
    .option('--error', 'exit 1 if any unused exports are found (for CI gating)')
    .action(async (paths: string[], opts: Options) => {
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
        content: fs.readFileSync(filePath, 'utf8')
      }));

      const unused: UnusedExport[] = await findUnusedExports(files);

      if (unused.length === 0) {
        process.stdout.write(`${GREEN}✔${RESET} No unused exports found across ${files.length} files.\n`);
        process.exit(0);
        return;
      }

      // Group by file for readable output.
      const byFile = new Map<string, UnusedExport[]>();
      for (const u of unused) {
        const list = byFile.get(u.filePath) ?? [];
        list.push(u);
        byFile.set(u.filePath, list);
      }
      for (const [file, list] of byFile) {
        process.stdout.write(`\n${BOLD}${file}${RESET}\n`);
        for (const u of list) {
          const loc = `${u.location.start.row + 1}:${u.location.start.column + 1}`;
          process.stdout.write(`  ${GRAY}${loc.padEnd(8)}${RESET} ${CYAN}${u.name}${RESET} is exported but never imported\n`);
        }
      }
      process.stdout.write(
        `\n${unused.length} unused export(s) across ${byFile.size} file(s). ` +
          `${GRAY}(whole-program heuristic — public-API entry points may appear here)${RESET}\n`
      );

      process.exit(opts.error ? 1 : 0);
    });
  return cmd;
}
