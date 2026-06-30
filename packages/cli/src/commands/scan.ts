import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
  registerAllRules,
  registry,
  Analyzer,
  WorkerPool,
  loadConfig,
  loadBaseline,
  filterAgainstBaseline,
  DiskCache,
  cacheKey,
  summarize,
  toJson,
  toSarif,
  toHtml,
  toJUnit,
  IgnoreMatcher,
} from '@ied/core';
import type { Diagnostic, ResolvedConfig } from '@ied/core';
import { printResults, printSummary } from '../output/terminal';
import { collectFiles } from './collect';
import { buildReportPayload, sendReport } from '../report';

const WORKER_THRESHOLD = 8;

interface ScanOptions {
  format: string;
  output?: string;
  config?: string;
  cache: boolean;
  baseline?: string | boolean;
  reportTo?: string;
  apiKey?: string;
}

export function scanCommand(): Command {
  const cmd = new Command('scan');
  cmd
    .description('Scan files/directories for invisible errors')
    .argument('[paths...]', 'files or directories to scan', ['.'])
    .option('-f, --format <format>', 'output format: terminal|json|sarif|html|junit', 'terminal')
    .option('-o, --output <file>', 'write output to a file')
    .option('--config <path>', 'path to config file')
    .option('--no-cache', 'disable the disk cache')
    .option('--baseline [file]', 'filter findings against a baseline file')
    .option('--report-to <url>', 'POST SARIF results + repo metadata to a dashboard ingest endpoint')
    .option('--api-key <key>', 'API key (Bearer) for --report-to')
    .action(async (paths: string[], opts: ScanOptions) => {
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
      if (opts.cache === false) config.cache = false;

      const ignore = IgnoreMatcher.fromFiles(rootDir);
      const files = collectFiles(paths, config, ignore, rootDir);

      const enabledRuleIds = registry
        .all()
        .map((r) => r.id)
        .filter((id) => config.ruleSeverities.get(id) !== null);

      let all: Diagnostic[] = [];
      let cachedCount = 0;
      const start = Date.now();

      const useWorkers = files.length > WORKER_THRESHOLD && config.maxWorkers > 1;

      if (useWorkers) {
        const inputs = files.map((file) => ({ filePath: file, content: fs.readFileSync(file, 'utf8') }));
        const pool = new WorkerPool(config);
        try {
          const results = await pool.analyzeFiles(inputs);
          for (const r of results) all.push(...r.diagnostics);
        } finally {
          await pool.dispose();
        }
      } else {
        const analyzer = new Analyzer(config);
        const cache = new DiskCache(config.cacheDir, config.cache);
        try {
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const key = cacheKey(content, enabledRuleIds);
            const cached = cache.get(key);
            if (cached) {
              cachedCount++;
              all.push(...cached.diagnostics);
            } else {
              const r = await analyzer.analyzeFile({ filePath: file, content });
              cache.set(key, { filePath: file, diagnostics: r.diagnostics });
              all.push(...r.diagnostics);
            }
          }
        } finally {
          analyzer.dispose();
        }
      }

      // Baseline filtering. Active when --baseline is passed; the optional value
      // overrides the configured baseline path.
      let hiddenCount = 0;
      if (opts.baseline !== undefined && opts.baseline !== false) {
        const baselinePath =
          typeof opts.baseline === 'string' ? opts.baseline : config.baseline ?? '.ied-baseline.json';
        const baseline = loadBaseline(path.resolve(rootDir, baselinePath));
        if (baseline) {
          const before = all.length;
          all = filterAgainstBaseline(all, baseline);
          hiddenCount = before - all.length;
        }
      }

      const elapsed = Date.now() - start;
      const summary = summarize(all);

      // Best-effort: ship results to a dashboard. Never fails the scan.
      if (opts.reportTo) {
        try {
          await sendReport(
            opts.reportTo,
            opts.apiKey,
            buildReportPayload(all, rootDir, new Date().toISOString())
          );
          process.stderr.write(`Reported ${all.length} findings to ${opts.reportTo}\n`);
        } catch (err) {
          process.stderr.write(
            `Warning: --report-to failed: ${err instanceof Error ? err.message : String(err)}\n`
          );
        }
      }

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
        case 'junit':
          payload = toJUnit(all);
          break;
        case 'terminal':
        default:
          printResults(all);
          if (hiddenCount > 0) {
            process.stdout.write(`${hiddenCount} findings hidden by baseline\n`);
          }
          printSummary({
            error: summary.error,
            warning: summary.warning,
            info: summary.info,
            total: summary.total,
            files: files.length,
            cached: cachedCount,
            elapsed,
          });
          break;
      }

      if (payload !== null) {
        if (opts.output) {
          fs.writeFileSync(opts.output, payload);
        } else {
          process.stdout.write(payload);
        }
        if (hiddenCount > 0) {
          process.stderr.write(`${hiddenCount} findings hidden by baseline\n`);
        }
      }

      process.exit(summary.error > 0 ? 1 : 0);
    });
  return cmd;
}
