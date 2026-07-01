/**
 * `ied hotspots` — predict bug-prone files from git churn × finding density.
 *
 * Scans the target paths for findings, reads commit frequency from git, and
 * ranks files by combined risk (see @ied/core computeHotspots). Output is a
 * terminal table or JSON; `--report-to` ships the ranking to a dashboard.
 */

import * as fs from 'fs';
import { Command } from 'commander';
import {
  registerAllRules,
  registerPlugins,
  Analyzer,
  loadConfig,
  computeHotspots,
  findingWeightByFile,
  IgnoreMatcher,
  type Diagnostic,
  type Hotspot
} from '@ied/core';
import { collectFiles } from './collect';
import { gitChurn, toChurnKey } from '../git/churn';
import { buildHotspotPayload, sendHotspots } from '../report';

interface HotspotOptions {
  since?: string;
  limit: string;
  minRisk: string;
  json?: boolean;
  reportTo?: string;
  apiKey?: string;
}

export function hotspotsCommand(): Command {
  const cmd = new Command('hotspots');
  cmd
    .description('Predict bug-prone files from git churn × finding density')
    .argument('[paths...]', 'files or directories to analyze', ['.'])
    .option('--since <when>', 'only count commits since this git date (e.g. "3 months ago")')
    .option('--limit <n>', 'show at most N files', '20')
    .option('--min-risk <n>', 'hide files below this risk (0-100)', '1')
    .option('--json', 'output as JSON')
    .option('--report-to <url>', 'POST the ranking to a dashboard hotspot-ingest endpoint')
    .option('--api-key <key>', 'API key (Bearer) for --report-to')
    .action(async (paths: string[], opts: HotspotOptions) => {
      registerAllRules();
      const rootDir = process.cwd();
      const config = loadConfig(rootDir);
      registerPlugins(config);

      const ignore = IgnoreMatcher.fromFiles(rootDir);
      const files = collectFiles(paths, config, ignore, rootDir);

      // Findings → per-file severity-weighted score, keyed like churn.
      const analyzer = new Analyzer(config);
      const findings: Diagnostic[] = [];
      try {
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf8');
          const r = await analyzer.analyzeFile({ filePath: file, content });
          findings.push(...r.diagnostics);
        }
      } finally {
        analyzer.dispose();
      }
      const findingWeight = findingWeightByFile(
        findings.map((d) => ({ filePath: toChurnKey(rootDir, d.filePath), severity: d.severity }))
      );

      const { churn, isGitRepo } = gitChurn(rootDir, { since: opts.since });
      if (!isGitRepo) {
        process.stderr.write(
          'Not a git repository (or git unavailable): ranking by finding density only.\n'
        );
      }

      const hotspots = computeHotspots(
        { churn, findingWeight },
        { limit: parseInt(opts.limit, 10) || 20, minRisk: parseInt(opts.minRisk, 10) || 0 }
      );

      if (opts.reportTo) {
        try {
          await sendHotspots(
            opts.reportTo,
            opts.apiKey,
            buildHotspotPayload(hotspots, rootDir, new Date().toISOString())
          );
          process.stderr.write(`Reported ${hotspots.length} hotspots to ${opts.reportTo}\n`);
        } catch (err) {
          process.stderr.write(
            `Warning: --report-to failed: ${err instanceof Error ? err.message : String(err)}\n`
          );
        }
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(hotspots, null, 2) + '\n');
        return;
      }
      printHotspots(hotspots, isGitRepo);
    });
  return cmd;
}

function printHotspots(hotspots: Hotspot[], isGitRepo: boolean): void {
  if (hotspots.length === 0) {
    process.stdout.write('No hotspots found.\n');
    return;
  }
  process.stdout.write('\nPredicted bug hotspots (risk = churn × finding density):\n\n');
  process.stdout.write('  RISK  CHURN  FINDINGS  FILE\n');
  for (const h of hotspots) {
    process.stdout.write(
      `  ${String(h.risk).padStart(4)}  ${String(h.churn).padStart(5)}  ${String(h.findingWeight).padStart(8)}  ${h.file}\n`
    );
  }
  if (!isGitRepo) {
    process.stdout.write('\n(churn was unavailable — risk reflects finding density only)\n');
  }
  process.stdout.write('\n');
}
