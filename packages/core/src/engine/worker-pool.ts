/**
 * Worker pool for parallel batch analysis.
 *
 * Spawns N worker threads (each running `analysis-worker.js`) and distributes
 * files across them. The pool is deliberately defensive: if workers cannot be
 * spawned, fail to become ready, or error out, it transparently falls back to a
 * single-threaded inline `Analyzer`. `analyzeFiles` must NEVER throw and must
 * always return one `FileResult` per input.
 */

import * as os from 'os';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { Analyzer, languageFromPath, type FileResult } from './analyzer';
import type { Diagnostic } from '../rules/types';
import type { ResolvedConfig } from '../config/types';

interface WorkerReply {
  id: number;
  diagnostics: Diagnostic[];
  durationMs?: number;
  error?: string;
}

export interface PoolInput {
  filePath: string;
  content: string;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private fallback = false;
  private readyPromise: Promise<void>;

  constructor(
    private config: ResolvedConfig,
    size?: number
  ) {
    const requested = size ?? Math.max(1, os.cpus().length - 1);
    const capped = Math.max(1, Math.min(requested, config.maxWorkers || requested));
    this.readyPromise = this.spawn(capped);
  }

  /** Spawn `n` workers and wait for each to report ready. Any failure -> fallback. */
  private async spawn(n: number): Promise<void> {
    const workerPath = path.join(__dirname, 'analysis-worker.js');
    const ready: Promise<void>[] = [];

    for (let i = 0; i < n; i++) {
      try {
        const worker = new Worker(workerPath, { workerData: { config: this.config } });
        this.workers.push(worker);
        ready.push(
          new Promise<void>((resolve, reject) => {
            const onMessage = (msg: { ready?: boolean }) => {
              if (msg && msg.ready) {
                worker.off('error', onError);
                resolve();
              }
            };
            const onError = (err: Error) => {
              worker.off('message', onMessage);
              reject(err);
            };
            worker.once('error', onError);
            worker.on('message', onMessage);
          })
        );
      } catch {
        this.fallback = true;
      }
    }

    if (this.workers.length === 0) {
      this.fallback = true;
      return;
    }

    try {
      await Promise.all(ready);
    } catch {
      this.fallback = true;
      await this.dispose();
    }
  }

  async analyzeFiles(inputs: PoolInput[]): Promise<FileResult[]> {
    try {
      await this.readyPromise;
    } catch {
      this.fallback = true;
    }

    if (this.fallback || this.workers.length === 0) {
      return this.analyzeInline(inputs);
    }

    try {
      return await this.analyzeWithWorkers(inputs);
    } catch {
      // Last-resort safety net: never let a worker problem break analysis.
      return this.analyzeInline(inputs);
    }
  }

  /** Single-threaded path used when workers are unavailable. */
  private async analyzeInline(inputs: PoolInput[]): Promise<FileResult[]> {
    const analyzer = new Analyzer(this.config);
    const out: FileResult[] = [];
    for (const input of inputs) {
      out.push(await analyzer.analyzeFile({ filePath: input.filePath, content: input.content }));
    }
    analyzer.dispose();
    return out;
  }

  /** Distribute inputs across workers via a shared queue of free workers. */
  private analyzeWithWorkers(inputs: PoolInput[]): Promise<FileResult[]> {
    return new Promise<FileResult[]>((resolve) => {
      const results: FileResult[] = new Array(inputs.length);
      let nextIndex = 0;
      let completed = 0;

      const finish = () => {
        if (completed === inputs.length) resolve(results);
      };

      if (inputs.length === 0) {
        resolve(results);
        return;
      }

      const dispatch = (worker: Worker) => {
        if (nextIndex >= inputs.length) return;
        const index = nextIndex++;
        const input = inputs[index];

        const onMessage = (msg: WorkerReply) => {
          if (msg.id !== index) return;
          worker.off('message', onMessage);
          results[index] = {
            filePath: input.filePath,
            language: languageFromPath(input.filePath) ?? 'javascript',
            diagnostics: msg.diagnostics ?? [],
            durationMs: msg.durationMs ?? 0
          };
          completed++;
          finish();
          dispatch(worker);
        };

        worker.on('message', onMessage);
        worker.postMessage({ id: index, filePath: input.filePath, content: input.content });
      };

      for (const worker of this.workers) dispatch(worker);
    });
  }

  async dispose(): Promise<void> {
    const workers = this.workers;
    this.workers = [];
    await Promise.all(workers.map((w) => w.terminate().catch(() => undefined)));
  }
}
