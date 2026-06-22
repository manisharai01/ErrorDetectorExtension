/**
 * Worker thread entry point. Receives `AnalyzeRequest` messages, runs the
 * rules engine, and posts back `AnalyzeResponse`.
 *
 * Compiled to `out/workers/analysis-worker.js` and spawned by AnalyzerPool.
 */
import { parentPort } from 'worker_threads';
import { runAnalysisInline } from './inline-runner';
import type { AnalyzeRequest, AnalyzeResponse } from '../core/analyzer-pool';

if (!parentPort) {
  // Imported in a non-worker context; do nothing.
} else {
  parentPort.on('message', (req: AnalyzeRequest) => {
    const reply: AnalyzeResponse = { id: req.id, issues: [] };
    try {
      reply.issues = runAnalysisInline(req);
    } catch (err) {
      reply.error = (err as Error).message;
    }
    parentPort!.postMessage(reply);
  });
}
