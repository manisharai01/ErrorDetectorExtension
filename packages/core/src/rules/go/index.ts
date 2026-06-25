/**
 * Go rule pack — language-specific rules for `.go` files.
 *
 * Re-exports each rule const plus a `goRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { uncheckedErrorRule } from './unchecked-error';
import { goroutineLeakRule } from './goroutine-leak';
import { nilDerefRule } from './nil-deref';
import { deferInLoopRule } from './defer-in-loop';
import { sqlInjectionRule } from './sql-injection';
import { appendPreallocRule } from './append-prealloc';
import { fmtPrintlnRule } from './fmt-println';

export {
  uncheckedErrorRule,
  goroutineLeakRule,
  nilDerefRule,
  deferInLoopRule,
  sqlInjectionRule,
  appendPreallocRule,
  fmtPrintlnRule
};

export const goRules: Rule[] = [
  uncheckedErrorRule,
  goroutineLeakRule,
  nilDerefRule,
  deferInLoopRule,
  sqlInjectionRule,
  appendPreallocRule,
  fmtPrintlnRule
];
