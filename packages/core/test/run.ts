/**
 * Test runner. Imports every `*.test` module (which register cases via
 * `test(...)`), then drains and executes the queue, reporting pass/fail and
 * exiting non-zero on any failure.
 *
 * Add new test files to the import list below.
 */

import { drain } from './harness';

// Register test cases (side-effecting imports).
import './universal.test';
import './security.test';
import './logic-a.test';
import './logic-b.test';
import './quality.test';
import './framework.test';
import './types-perf.test';
import './python.test';
import './go.test';
import './data-flow.test';
import './project-graph.test';
import './policy.test';
import './rust.test';
import './java.test';
import './kotlin.test';

async function main(): Promise<void> {
  const cases = drain();
  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    try {
      await c.fn();
      console.log('  ✔', c.name);
      passed++;
    } catch (err) {
      console.error('  ✖', c.name);
      console.error('     ', (err as Error).message);
      failed++;
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
