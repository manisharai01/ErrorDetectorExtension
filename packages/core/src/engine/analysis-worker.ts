/**
 * Worker-thread entry point for parallel analysis.
 *
 * Each worker constructs its own `Analyzer` (parsers are not thread-safe, so one
 * manager per thread) and processes one file per message. It posts `{ ready }`
 * once initialized so the pool knows the worker is usable, then replies to each
 * request with the resulting diagnostics. Errors are reported per-request rather
 * than crashing the worker.
 */

import { parentPort, workerData } from 'worker_threads';
import { Analyzer } from './analyzer';
import { registerAllRules } from '../rules/index';
import type { ResolvedConfig } from '../config/types';

interface Req {
  id: number;
  filePath: string;
  content: string;
}

async function main(): Promise<void> {
  registerAllRules();
  const config = workerData.config as ResolvedConfig;
  // ResolvedConfig Maps survive structuredClone across worker_threads.
  const analyzer = new Analyzer(config);

  parentPort!.on('message', async (req: Req) => {
    try {
      const r = await analyzer.analyzeFile({ filePath: req.filePath, content: req.content });
      parentPort!.postMessage({ id: req.id, diagnostics: r.diagnostics, durationMs: r.durationMs });
    } catch (err) {
      parentPort!.postMessage({ id: req.id, diagnostics: [], error: (err as Error).message });
    }
  });

  parentPort!.postMessage({ ready: true });
}

main();
