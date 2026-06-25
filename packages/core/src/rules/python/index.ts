/**
 * Python rule pack — re-exports every Python-specific rule plus a flat
 * `pythonRules` array for the registry to consume.
 */

import type { Rule } from '../types';

import { mutableDefaultArgRule } from './mutable-default-arg';
import { lateBindingClosureRule } from './late-binding-closure';
import { bareExceptRule } from './bare-except';
import { fstringInjectionRule } from './fstring-injection';
import { pickleUntrustedRule } from './pickle-untrusted';
import { isVsEqualsRule } from './is-vs-equals';
import { printStatementRule } from './print-statement';
import { nPlusOneQueryRule } from './n-plus-one';
import { syncInAsyncRule } from './sync-in-async';
import { openWithoutContextRule } from './open-without-context';

export {
  mutableDefaultArgRule,
  lateBindingClosureRule,
  bareExceptRule,
  fstringInjectionRule,
  pickleUntrustedRule,
  isVsEqualsRule,
  printStatementRule,
  nPlusOneQueryRule,
  syncInAsyncRule,
  openWithoutContextRule
};

export const pythonRules: Rule[] = [
  mutableDefaultArgRule,
  lateBindingClosureRule,
  bareExceptRule,
  fstringInjectionRule,
  pickleUntrustedRule,
  isVsEqualsRule,
  printStatementRule,
  nPlusOneQueryRule,
  syncInAsyncRule,
  openWithoutContextRule
];
