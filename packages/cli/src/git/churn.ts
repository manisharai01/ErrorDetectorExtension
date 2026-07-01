/**
 * Git churn collection for predictive hotspots.
 *
 * Churn = how often a file changes. We count the commits that touch each file
 * over a window (default: the whole history, or `--since`), which is a robust,
 * cheap proxy for change frequency. This is the only part of the hotspot
 * feature that shells out to git; the ranking math lives in @ied/core.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

export interface ChurnOptions {
  /** git `--since` value, e.g. "3 months ago". Omit for full history. */
  since?: string;
}

export interface ChurnResult {
  /** commits-per-file, keyed by POSIX path relative to `rootDir`. */
  churn: Record<string, number>;
  /** False when `rootDir` is not inside a git work tree. */
  isGitRepo: boolean;
}

function git(rootDir: string, args: string[]): string {
  return execFileSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  });
}

/** Normalize a git-root-relative path to a POSIX path relative to `rootDir`. */
function toRelPosix(gitRoot: string, rootDir: string, gitPath: string): string {
  const abs = path.resolve(gitRoot, gitPath);
  return path.relative(rootDir, abs).split(path.sep).join('/');
}

/**
 * Count commits touching each file. Returns an empty map (isGitRepo:false) when
 * not in a repo — the caller degrades to a findings-only view rather than
 * failing. Paths are normalized to POSIX and made relative to `rootDir` so they
 * line up with finding file paths.
 */
export function gitChurn(rootDir: string, opts: ChurnOptions = {}): ChurnResult {
  let gitRoot: string;
  try {
    gitRoot = git(rootDir, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    return { churn: {}, isGitRepo: false };
  }

  const args = ['log', '--no-merges', '--pretty=format:', '--name-only'];
  if (opts.since) args.push(`--since=${opts.since}`);

  let out: string;
  try {
    out = git(rootDir, args);
  } catch {
    return { churn: {}, isGitRepo: false };
  }

  const churn: Record<string, number> = {};
  for (const raw of out.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const rel = toRelPosix(gitRoot, rootDir, line);
    // Skip files outside the scanned root (e.g. sibling packages).
    if (rel.startsWith('..')) continue;
    churn[rel] = (churn[rel] ?? 0) + 1;
  }
  return { churn, isGitRepo: true };
}

/** Normalize an arbitrary file path to the same POSIX-relative-to-root key. */
export function toChurnKey(rootDir: string, filePath: string): string {
  const abs = path.resolve(rootDir, filePath);
  return path.relative(rootDir, abs).split(path.sep).join('/');
}
