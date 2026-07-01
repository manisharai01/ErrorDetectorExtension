/**
 * Ingest a `ied hotspots --report-to` payload ({ metadata, hotspots }) into the
 * store's hotspot ranking (latest-wins per repo).
 */
import type { DashboardStore, HotspotRow } from './db';

export interface HotspotIngestPayload {
  metadata: {
    repo: string;
    branch?: string;
    commit?: string;
    team?: string;
    timestamp?: string;
  };
  hotspots: Array<{
    file: string;
    churn?: number;
    findingWeight?: number;
    risk?: number;
  }>;
}

export function ingestHotspotPayload(
  store: DashboardStore,
  payload: HotspotIngestPayload,
  now: string
): { repo: string; count: number } {
  if (!payload?.metadata?.repo) {
    throw new Error('hotspot payload missing metadata.repo');
  }
  if (!Array.isArray(payload.hotspots)) {
    throw new Error('hotspot payload missing hotspots array');
  }
  const rows: HotspotRow[] = payload.hotspots.map((h) => ({
    file: h.file,
    churn: h.churn ?? 0,
    findingWeight: h.findingWeight ?? 0,
    risk: h.risk ?? 0
  }));
  const ts = payload.metadata.timestamp ?? now;
  const { count } = store.ingestHotspots(payload.metadata.repo, ts, rows);
  return { repo: payload.metadata.repo, count };
}
