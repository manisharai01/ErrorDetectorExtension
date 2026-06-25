import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
  registerAllRules,
  Analyzer,
  loadConfig,
  generateBaseline,
  writeBaseline,
  IgnoreMatcher,
} from '@ied/core';
import type { Diagnostic, ResolvedConfig } from '@ied/core';
import { collectFiles } from './collect';

export function baselineCommand(): Command {
  const cmd = new Command('baseline');
  cmd
    .description('Scan paths and write a baseline of current findings')
    .argument('[paths...]', 'files or directories to scan', ['.'])
    .option('--config <path>', 'path to config file')
    .action(async (paths: string[]) => {
      registerAllRules();

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
      const files = collectFiles(paths, config, ignore, rootDir);

      const analyzer = new Analyzer(config);
      const all: Diagnostic[] = [];
      try {
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf8');
          const r = await analyzer.analyzeFile({ filePath: file, content });
          all.push(...r.diagnostics);
        }
      } finally {
        analyzer.dispose();
      }

      const baseline = generateBaseline(all);
      baseline.generatedAt = new Date().toISOString();

      const baselinePath = config.baseline ?? '.ied-baseline.json';
      const outPath = path.resolve(rootDir, baselinePath);
      writeBaseline(outPath, baseline);

      process.stdout.write(`Wrote baseline with ${baseline.fingerprints.length} fingerprints to ${outPath}\n`);
    });
  return cmd;
}
