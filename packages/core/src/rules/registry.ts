/**
 * Rule registry. Rules register themselves at module load; the registry
 * resolves which rules apply to a given language and exposes lookup by id.
 *
 * Deliberately minimal — no plugin loader, no dynamic discovery from disk.
 * Rules are imported statically (see ./index re-exports) and call `register`.
 */

import type { Rule, Language, RuleCategory } from './types';
import { ruleAppliesTo } from './types';

const CATEGORY_ORDER: RuleCategory[] = [
  'security',
  'logic',
  'concurrency',
  'resource',
  'type-safety',
  'framework',
  'performance',
  'quality'
];

export class RuleRegistry {
  private byId = new Map<string, Rule>();

  /** Register a rule. Throws on duplicate id to catch copy-paste mistakes. */
  register(rule: Rule): void {
    if (this.byId.has(rule.id)) {
      throw new Error(`Duplicate rule id "${rule.id}" (name: ${rule.name})`);
    }
    this.byId.set(rule.id, rule);
  }

  /** Register many. */
  registerAll(rules: Rule[]): void {
    for (const r of rules) this.register(r);
  }

  get(id: string): Rule | undefined {
    return this.byId.get(id);
  }

  /** All rules, sorted by category then id for stable output. */
  all(): Rule[] {
    return [...this.byId.values()].sort(compareRules);
  }

  /** Rules that apply to `language`, sorted. */
  forLanguage(language: Language): Rule[] {
    return this.all().filter((r) => ruleAppliesTo(r, language));
  }

  /** Number of registered rules. */
  get size(): number {
    return this.byId.size;
  }

  /** Test/reset hook. */
  clear(): void {
    this.byId.clear();
  }
}

function compareRules(a: Rule, b: Rule): number {
  const ca = CATEGORY_ORDER.indexOf(a.category);
  const cb = CATEGORY_ORDER.indexOf(b.category);
  if (ca !== cb) return ca - cb;
  return a.id.localeCompare(b.id);
}

/** The process-wide registry singleton. */
export const registry = new RuleRegistry();
