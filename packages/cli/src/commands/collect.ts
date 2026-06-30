import * as fs from 'fs';
import * as path from 'path';
import type { ResolvedConfig } from '@ied/core';

export const SOURCE_EXTS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.vue',
  '.py',
  '.pyi',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts'
]);

/**
 * Walk the given input paths and return the list of source files to analyze,
 * honoring the config's directory excludes and the ignore matcher. Shared by the
 * `scan` and `baseline` commands.
 */
export function collectFiles(
  inputPaths: string[],
  config: ResolvedConfig,
  ignore: { isIgnored(relPath: string, isDir?: boolean): boolean },
  rootDir: string,
): string[] {
  const excludeNames = new Set(config.exclude.filter((e) => !e.includes('/') && !e.includes('*')));
  const files: string[] = [];
  const seen = new Set<string>();

  const visit = (target: string): void => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      return;
    }
    const relPath = path.relative(rootDir, target).split(path.sep).join('/');

    if (stat.isDirectory()) {
      const base = path.basename(target);
      if (excludeNames.has(base)) return;
      if (relPath && ignore.isIgnored(relPath, true)) return;
      let entries: string[];
      try {
        entries = fs.readdirSync(target);
      } catch {
        return;
      }
      for (const entry of entries) {
        visit(path.join(target, entry));
      }
      return;
    }

    if (!stat.isFile()) return;
    if (!SOURCE_EXTS.has(path.extname(target))) return;
    if (relPath && ignore.isIgnored(relPath, false)) return;
    const abs = path.resolve(target);
    if (seen.has(abs)) return;
    seen.add(abs);
    files.push(target);
  };

  for (const p of inputPaths) {
    visit(path.resolve(rootDir, p));
  }
  return files;
}
