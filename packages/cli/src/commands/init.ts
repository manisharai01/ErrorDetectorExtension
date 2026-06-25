import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';

const STARTER_CONFIG = {
  rules: { 'IED-S001': 'error', 'IED-Q001': 'warn' },
  include: ['**/*.{js,ts,jsx,tsx,vue}'],
  exclude: ['node_modules', 'dist', '**/*.test.*'],
  baseline: '.ied-baseline.json',
  cache: true,
};

export function initCommand(): Command {
  const cmd = new Command('init');
  cmd
    .description('Write a starter .iedrc.json to the current directory')
    .option('--force', 'overwrite an existing .iedrc.json')
    .action((opts: { force?: boolean }) => {
      const target = path.join(process.cwd(), '.iedrc.json');
      if (fs.existsSync(target) && !opts.force) {
        console.error(`${target} already exists (use --force to overwrite)`);
        process.exit(2);
        return;
      }
      fs.writeFileSync(target, JSON.stringify(STARTER_CONFIG, null, 2) + '\n', 'utf8');
      process.stdout.write(`Wrote ${target}\n`);
    });
  return cmd;
}
