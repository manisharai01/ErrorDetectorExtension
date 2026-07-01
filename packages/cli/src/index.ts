#!/usr/bin/env node
import { Command } from 'commander';
import { scanCommand } from './commands/scan';
import { rulesCommand } from './commands/rules';
import { initCommand } from './commands/init';
import { baselineCommand } from './commands/baseline';
import { ciCommentCommand } from './commands/ci-comment';
import { unusedExportsCommand } from './commands/unused-exports';
import { aiCommand } from './commands/ai';
import { hotspotsCommand } from './commands/hotspots';

const program = new Command();
program
  .name('ied')
  .description('Invisible Errors Detector — static analysis for JS/TS/Vue/Python/Go')
  .version('0.1.0');
program.addCommand(scanCommand());
program.addCommand(rulesCommand());
program.addCommand(initCommand());
program.addCommand(baselineCommand());
program.addCommand(ciCommentCommand());
program.addCommand(unusedExportsCommand());
program.addCommand(aiCommand());
program.addCommand(hotspotsCommand());
program.parseAsync(process.argv).catch((err) => { console.error(err); process.exit(2); });
