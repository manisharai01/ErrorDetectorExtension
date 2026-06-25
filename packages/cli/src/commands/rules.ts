import { Command } from 'commander';
import { registerAllRules, registry } from '@ied/core';
import type { Rule } from '@ied/core';

export function rulesCommand(): Command {
  const cmd = new Command('rules');
  cmd
    .description('List available rules')
    .option('--category <cat>', 'filter by category')
    .option('--json', 'output as JSON')
    .action((opts: { category?: string; json?: boolean }) => {
      registerAllRules();
      let rules: Rule[] = registry.all();
      if (opts.category) {
        rules = rules.filter((r) => r.category === opts.category);
      }

      if (opts.json) {
        const out = rules.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          severity: r.severity,
          description: r.description,
        }));
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
        return;
      }

      const byCategory = new Map<string, Rule[]>();
      for (const r of rules) {
        const list = byCategory.get(r.category) ?? [];
        list.push(r);
        byCategory.set(r.category, list);
      }
      const categories = Array.from(byCategory.keys()).sort();
      for (const cat of categories) {
        process.stdout.write(`\n${cat}\n`);
        const list = byCategory.get(cat)!;
        for (const r of list) {
          process.stdout.write('  ' + r.id.padEnd(12) + String(r.severity).padEnd(8) + r.description + '\n');
        }
      }
      process.stdout.write(`\n${rules.length} rules\n`);
    });
  return cmd;
}
