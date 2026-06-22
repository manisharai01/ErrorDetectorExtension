import { Rule } from './types';

class RuleRegistry {
  private rules = new Map<string, Rule>();

  register(rule: Rule): void {
    if (this.rules.has(rule.meta.id)) {
      throw new Error(`Duplicate rule id: ${rule.meta.id}`);
    }
    this.rules.set(rule.meta.id, rule);
  }

  get(id: string): Rule | undefined { return this.rules.get(id); }
  all(): Rule[] { return [...this.rules.values()]; }
  ids(): string[] { return [...this.rules.keys()]; }
  clear(): void { this.rules.clear(); }
}

export const registry = new RuleRegistry();
