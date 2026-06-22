import * as fs from 'fs';
import * as path from 'path';

/**
 * Minimal `.gitignore` / `.eslintignore` reader. Supports the common
 * `glob`-ish forms (negation, directory-only, leading slash) well enough
 * for excluding analysis targets.
 */
export class IgnoreMatcher {
  private patterns: { neg: boolean; re: RegExp; dirOnly: boolean }[] = [];

  add(lines: string[]): void {
    for (let raw of lines) {
      raw = raw.trim();
      if (!raw || raw.startsWith('#')) continue;
      let neg = false;
      if (raw.startsWith('!')) { neg = true; raw = raw.slice(1); }
      let dirOnly = false;
      if (raw.endsWith('/')) { dirOnly = true; raw = raw.slice(0, -1); }
      this.patterns.push({ neg, dirOnly, re: globToRegExp(raw) });
    }
  }

  static fromFiles(rootDir: string, names = ['.gitignore', '.eslintignore']): IgnoreMatcher {
    const m = new IgnoreMatcher();
    for (const n of names) {
      const p = path.join(rootDir, n);
      if (fs.existsSync(p)) m.add(fs.readFileSync(p, 'utf8').split(/\r?\n/));
    }
    return m;
  }

  isIgnored(relativePath: string, isDir = false): boolean {
    let ignored = false;
    const norm = relativePath.replace(/\\/g, '/');
    for (const p of this.patterns) {
      if (p.dirOnly && !isDir) continue;
      if (p.re.test(norm)) ignored = !p.neg;
    }
    return ignored;
  }
}

function globToRegExp(glob: string): RegExp {
  let g = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  g = g.replace(/\*\*/g, '::DSTAR::').replace(/\*/g, '[^/]*').replace(/::DSTAR::/g, '.*').replace(/\?/g, '.');
  if (g.startsWith('/')) g = '^' + g.slice(1);
  else g = '(^|/)' + g;
  g += '($|/)';
  return new RegExp(g);
}
