/**
 * Built-in rule registration. Rules are imported statically and registered into
 * the process-wide registry. Call `registerAllRules()` once at startup.
 *
 * As rules are ported they are added to `BUILTIN_RULES` below.
 */

import type { Rule } from './types';
import { registry } from './registry';

// Universal (original two).
import { consoleLogRule } from './universal/console-log';
import { deepNestingRule } from './universal/deep-nesting';

// Security.
import { hardcodedSecretsRule } from './security/hardcoded-secrets';
import { evalUsageRule } from './security/eval-usage';
import { innerHtmlRule } from './security/inner-html';
import { commandInjectionRule } from './security/command-injection';
import { taintTrackingRule } from './security/taint-tracking';

// Logic.
import { arrayIndexRule } from './logic/array-index';
import { promiseSwallowingRule } from './logic/promise-swallowing';
import { objectMutationRule } from './logic/object-mutation';
import { raceConditionRule } from './logic/race-condition';
import { infiniteLoopRule } from './logic/infinite-loop';
import { recursionBaseCaseRule } from './logic/recursion-base-case';
import { typeGuardContradictionRule } from './logic/type-guard-contradiction';
import { constantConditionRule } from './logic/constant-condition';
import { unreachableCodeRule } from './logic/unreachable-code';

// Code smells / quality.
import { commentedCodeRule } from './code-smells/commented-code';
import { magicNumbersRule } from './code-smells/magic-numbers';
import { todoWithoutIssueRule } from './code-smells/todo-without-issue';
import { unusedParametersRule } from './code-smells/unused-parameters';
import { duplicateCodeRule } from './code-smells/duplicate-code';
import { suppressionWithoutReasonRule } from './code-smells/suppression-without-reason';

// Framework-specific.
import { reactRules } from './framework-specific/react';
import { vueRefMisuseRule } from './framework-specific/vue';

// TypeScript type-safety.
import { typeIssuesRules } from './typescript/type-issues';

// Performance.
import { nestedLoopRule } from './performance/nested-loop';

// Heuristics.
import { cognitiveComplexityRule } from './heuristics/complexity';
import { overwrittenBeforeUseRule } from './heuristics/overwritten-before-use';

// Python pack.
import { pythonRules } from './python/index';

// Go pack.
import { goRules } from './go/index';

// Rust pack.
import { rustRules } from './rust/index';

// Java pack.
import { javaRules } from './java/index';

// Kotlin pack.
import { kotlinRules } from './kotlin/index';

// Swift pack.
import { swiftRules } from './swift/index';

// C/C++ pack.
import { cFamilyRules } from './c-family/index';

// PHP pack.
import { phpRules } from './php/index';

/** Every built-in rule, in no particular order (the registry sorts on read). */
export const BUILTIN_RULES: Rule[] = [
  // Universal.
  consoleLogRule,
  deepNestingRule,

  // Security.
  hardcodedSecretsRule,
  evalUsageRule,
  innerHtmlRule,
  commandInjectionRule,
  taintTrackingRule,

  // Logic.
  arrayIndexRule,
  promiseSwallowingRule,
  objectMutationRule,
  raceConditionRule,
  infiniteLoopRule,
  recursionBaseCaseRule,
  typeGuardContradictionRule,
  constantConditionRule,
  unreachableCodeRule,

  // Code smells / quality.
  commentedCodeRule,
  magicNumbersRule,
  todoWithoutIssueRule,
  unusedParametersRule,
  duplicateCodeRule,
  suppressionWithoutReasonRule,

  // Framework-specific.
  ...reactRules,
  vueRefMisuseRule,

  // TypeScript type-safety.
  ...typeIssuesRules,

  // Performance.
  nestedLoopRule,

  // Heuristics.
  cognitiveComplexityRule,
  overwrittenBeforeUseRule,

  // Python pack.
  ...pythonRules,

  // Go pack.
  ...goRules,

  // Rust pack.
  ...rustRules,

  // Java pack.
  ...javaRules,

  // Kotlin pack.
  ...kotlinRules,

  // Swift pack.
  ...swiftRules,

  // C/C++ pack.
  ...cFamilyRules,

  // PHP pack.
  ...phpRules
];

let registered = false;

/** Register all built-in rules. Idempotent. */
export function registerAllRules(): void {
  if (registered) return;
  registered = true;
  for (const rule of BUILTIN_RULES) {
    if (!registry.get(rule.id)) registry.register(rule);
  }
}
