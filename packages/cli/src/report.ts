/**
 * `--report-to`: POST scan results (SARIF) plus repo metadata to a dashboard
 * ingest endpoint. Metadata is read from git; everything is best-effort so a
 * reporting failure never fails the scan itself.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import { toSarif } from '@ied/core';
import type { Diagnostic, Hotspot } from '@ied/core';

export interface ReportMetadata {
  repo: string;
  branch: string;
  commit: string;
  timestamp: string;
}

export interface ReportPayload {
  metadata: ReportMetadata;
  sarif: string;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number }>;

function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export function gatherMetadata(rootDir: string, timestamp: string): ReportMetadata {
  const remote = git('config --get remote.origin.url', rootDir);
  const repo = remote
    ? remote.replace(/\.git$/, '').split(/[/:]/).slice(-2).join('/')
    : path.basename(rootDir);
  return {
    repo,
    branch: git('rev-parse --abbrev-ref HEAD', rootDir) || 'HEAD',
    commit: git('rev-parse HEAD', rootDir),
    timestamp
  };
}

export function buildReportPayload(
  diagnostics: Diagnostic[],
  rootDir: string,
  timestamp: string
): ReportPayload {
  return { metadata: gatherMetadata(rootDir, timestamp), sarif: toSarif(diagnostics) };
}

export interface HotspotPayload {
  metadata: ReportMetadata;
  hotspots: Hotspot[];
}

export function buildHotspotPayload(
  hotspots: Hotspot[],
  rootDir: string,
  timestamp: string
): HotspotPayload {
  return { metadata: gatherMetadata(rootDir, timestamp), hotspots };
}

/** POST computed hotspots to a dashboard's hotspot-ingest endpoint. */
export async function sendHotspots(
  url: string,
  apiKey: string | undefined,
  payload: HotspotPayload,
  fetchImpl?: FetchLike
): Promise<void> {
  const f = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await f(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`hotspots endpoint returned HTTP ${res.status}`);
}

export async function sendReport(
  url: string,
  apiKey: string | undefined,
  payload: ReportPayload,
  fetchImpl?: FetchLike
): Promise<void> {
  const f = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await f(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`report-to endpoint returned HTTP ${res.status}`);
}
