import * as crypto from 'crypto';
import { Issue } from '../rules-engine/types';

interface CacheEntry {
  hash: string;
  issues: Issue[];
  timestamp: number;
}

/**
 * LRU cache keyed by file path; values keyed additionally by content hash so
 * stale entries are detected automatically.
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry>();
  constructor(private maxEntries = 200) {}

  static hash(content: string): string {
    return crypto.createHash('sha1').update(content).digest('hex');
  }

  get(filePath: string, content: string): Issue[] | undefined {
    const e = this.cache.get(filePath);
    if (!e) return undefined;
    if (e.hash !== CacheManager.hash(content)) return undefined;
    // refresh LRU position
    this.cache.delete(filePath);
    this.cache.set(filePath, e);
    return e.issues;
  }

  set(filePath: string, content: string, issues: Issue[]): void {
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(filePath, { hash: CacheManager.hash(content), issues, timestamp: Date.now() });
  }

  invalidate(filePath: string): void { this.cache.delete(filePath); }
  clear(): void { this.cache.clear(); }
  size(): number { return this.cache.size; }
  resize(n: number): void { this.maxEntries = n; while (this.cache.size > n) { const k = this.cache.keys().next().value; if (k === undefined) break; this.cache.delete(k); } }
}
