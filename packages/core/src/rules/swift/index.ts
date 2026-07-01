/**
 * Swift rule pack — language-specific rules for `.swift` files.
 *
 * Re-exports each rule const plus a `swiftRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { forceUnwrapRule } from './force-unwrap';
import { retainCycleRule } from './retain-cycle';
import { mainActorViolationRule } from './main-actor-violation';
import { printStatementRule } from './print-statement';

export {
  forceUnwrapRule,
  retainCycleRule,
  mainActorViolationRule,
  printStatementRule
};

export const swiftRules: Rule[] = [
  forceUnwrapRule,
  retainCycleRule,
  mainActorViolationRule,
  printStatementRule
];
