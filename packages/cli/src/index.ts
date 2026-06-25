#!/usr/bin/env node
import { Command } from 'commander';
import { scanCommand } from './commands/scan';
import { rulesCommand } from './commands/rules';
import { initCommand } from './commands/init';
import { baselineCommand } from './commands/baseline';

const program = new Command();
program.name('ied').description('Invisible Errors Detector — static analysis for JS/TS/Vue').version('0.1.0');
program.addCommand(scanCommand());
program.addCommand(rulesCommand());
program.addCommand(initCommand());
program.addCommand(baselineCommand());
program.parseAsync(process.argv).catch((err) => { console.error(err); process.exit(2); });
