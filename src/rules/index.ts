import { registry } from '../rules-engine/registry';

import { arrayIndexErrorRule } from './logic/array-index';
import { objectMutationRule } from './logic/object-mutation';
import { promiseSwallowingRule } from './logic/promise-swallowing';
import { raceConditionRule } from './logic/race-condition';
import { typeGuardContradictionRule } from './logic/type-guard-contradiction';
import { infiniteLoopRule } from './logic/infinite-loop';
import { recursionBaseCaseRule } from './logic/recursion-base-case';

import { unusedParametersRule } from './code-smells/unused-parameters';
import { consoleLogRule } from './code-smells/console-log';
import { commentedCodeRule } from './code-smells/commented-code';
import { todoWithoutIssueRule } from './code-smells/todo-without-issue';
import { magicNumbersRule } from './code-smells/magic-numbers';
import { deepNestingRule } from './code-smells/deep-nesting';
import { duplicateCodeRule } from './code-smells/duplicate-code';

import { hardcodedSecretsRule } from './security/hardcoded-secrets';
import { evalUsageRule } from './security/eval-usage';
import { innerHtmlRule } from './security/inner-html';
import { commandInjectionRule } from './security/command-injection';
import { taintTrackingRule } from './security/taint-tracking';

import { reactHooksDepsRule, reactKeyInListRule, reactStateMutationRule, reactStateAfterUnmountRule } from './framework-specific/react';
import { vueRefMutationRule } from './framework-specific/vue';

import { unsafeAsAssertionRule, anyTypeRule, nonNullAssertionRule } from './typescript/type-issues';

import { nestedLoopHotspotRule } from './performance/nested-loop';

import { pathAnalysisRule, missingAwaitChainRule } from './data-flow/path-analysis';
import { cognitiveComplexityRule, overwrittenBeforeUseRule, inconsistentNamingRule } from './heuristics/complexity-and-naming';
import { astDuplicateLogicRule } from './heuristics/duplicate-logic';

let registered = false;
export function registerAllRules(): void {
  if (registered) return;
  registered = true;
  const rules = [
    arrayIndexErrorRule, objectMutationRule, promiseSwallowingRule, raceConditionRule,
    typeGuardContradictionRule, infiniteLoopRule, recursionBaseCaseRule,
    unusedParametersRule, consoleLogRule, commentedCodeRule, todoWithoutIssueRule,
    magicNumbersRule, deepNestingRule, duplicateCodeRule,
    hardcodedSecretsRule, evalUsageRule, innerHtmlRule, commandInjectionRule, taintTrackingRule,
    reactHooksDepsRule, reactKeyInListRule, reactStateMutationRule, reactStateAfterUnmountRule,
    vueRefMutationRule,
    unsafeAsAssertionRule, anyTypeRule, nonNullAssertionRule,
    nestedLoopHotspotRule,
    // Phase 3 — next-gen detection layer
    pathAnalysisRule, missingAwaitChainRule,
    cognitiveComplexityRule, overwrittenBeforeUseRule, inconsistentNamingRule,
    astDuplicateLogicRule
  ];
  for (const r of rules) registry.register(r);
}
