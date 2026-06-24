import { Worker } from 'worker_threads';
import * as path from 'path';
import { Issue } from '../rules-engine/types';

export interface AnalyzeRequest {
  id: number;
  filePath: string;
  sourceText: string;
  language: 'js' | 'jsx' | 'ts' | 'tsx' | 'vue';
  isTestFile: boolean;
  ruleSeverities: Record<string, string>;
  options: { anyTypeThreshold: number; allowConsoleInCli: boolean };
}

export interface AnalyzeResponse { id: number; issues: Issue[]; error?: string; }

interface Pending {
  resolve(r: Issue[]): void;
  reject(e: Error): void;
  cancelled: boolean;
}

/**
 * Pool of Node `worker_threads` running the analysis off the extension host.
 * Falls back to inline execution if workers fail to spawn.
 */
export class AnalyzerPool {
  private workers: Worker[] = [];
  private freeWorkers: Worker[] = [];
  private queue: AnalyzeRequest[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private workerPath: string;
  private fallbackInline = false;

  constructor(private size: number, workerScript?: string) {
    this.workerPath = workerScript ?? path.join(__dirname, 'workers', 'analysis-worker.js');
    this.spawn();
  }

  private spawn(): void {
    for (let i = 0; i < this.size; i++) {
      try {
        const w = new Worker(this.workerPath);
        w.on('message', (msg: AnalyzeResponse) => this.onMessage(w, msg));
        w.on('error', (err) => this.onWorkerError(w, err));
        this.workers.push(w);
        this.freeWorkers.push(w);
      } catch (e) {
        this.fallbackInline = true;
      }
    }
    if (this.workers.length === 0) this.fallbackInline = true;
  }

  private onMessage(w: Worker, msg: AnalyzeResponse) {
    const p = this.pending.get(msg.id);
    if (p) {
      this.pending.delete(msg.id);
      if (!p.cancelled) {
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.issues);
      }
    }
    this.freeWorkers.push(w);
    this.drain();
  }

  private onWorkerError(_w: Worker, err: Error) {
    // Reject all pending; mark fallback so future calls run inline.
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.fallbackInline = true;
  }

  private drain(): void {
    while (this.queue.length && this.freeWorkers.length) {
      const req = this.queue.shift()!;
      const w = this.freeWorkers.shift()!;
      w.postMessage(req);
    }
  }

  analyze(req: Omit<AnalyzeRequest, 'id'>, token?: { isCancellationRequested: boolean; onCancellationRequested(cb: () => void): void }): Promise<Issue[]> {
    if (this.fallbackInline) {
      // Lazy-load to avoid pulling rules into worker bundle accidentally.
      const { runAnalysisInline } = require('../workers/inline-runner') as typeof import('../workers/inline-runner');
      return Promise.resolve(runAnalysisInline({ ...req, id: 0 }));
    }
    const id = this.nextId++;
    const full: AnalyzeRequest = { ...req, id };
    return new Promise<Issue[]>((resolve, reject) => {
      const entry: Pending = { resolve, reject, cancelled: false };
      this.pending.set(id, entry);
      token?.onCancellationRequested(() => {
        entry.cancelled = true;
        this.pending.delete(id);
        resolve([]);
      });
      this.queue.push(full);
      this.drain();
    });
  }

  async dispose(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()));
    this.workers = []; this.freeWorkers = []; this.queue = []; this.pending.clear();
  }
}
