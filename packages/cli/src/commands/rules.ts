import { Command } from 'commander';
import { registerAllRules, registerPlugins, registry, loadConfig } from '@ied/core';
import type { Rule } from '@ied/core';

export function rulesCommand(): Command {
  const cmd = new Command('rules');
  cmd
    .description('List available rules (including those loaded from plugins)')
    .option('--category <cat>', 'filter by category')
    .option('--json', 'output as JSON')
    .action((opts: { category?: string; json?: boolean }) => {
      registerAllRules();
      // Also surface rules contributed by .iedrc "plugins" so users can confirm
      // their marketplace packages loaded.
      try {
        const errors = registerPlugins(loadConfig(process.cwd()));
        for (const e of errors) {
          process.stderr.write(`Warning: plugin "${e.spec}" — ${e.message}\n`);
        }
      } catch {
        /* a broken config shouldn't stop `ied rules` from listing built-ins */
      }
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
