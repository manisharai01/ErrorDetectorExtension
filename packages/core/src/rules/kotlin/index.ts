/**
 * Kotlin rule pack — language-specific rules for `.kt` / `.kts` files.
 *
 * Re-exports each rule const plus a `kotlinRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { notNullAssertionRule } from './not-null-assertion';
import { coroutineLeakRule } from './coroutine-leak';
import { printlnStatementRule } from './println-statement';
import { platformTypeNullRule } from './platform-type-null';

export {
  notNullAssertionRule,
  coroutineLeakRule,
  printlnStatementRule,
  platformTypeNullRule
};

export const kotlinRules: Rule[] = [
  notNullAssertionRule,
  coroutineLeakRule,
  printlnStatementRule,
  platformTypeNullRule
];
