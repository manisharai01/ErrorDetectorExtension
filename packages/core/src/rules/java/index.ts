/**
 * Java rule pack — language-specific rules for `.java` files.
 *
 * Re-exports each rule const plus a `javaRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { nullDerefChainRule } from './null-deref-chain';
import { resourceNotClosedRule } from './resource-not-closed';
import { equalsWithoutHashCodeRule } from './equals-without-hashcode';
import { synchronizedNonFinalRule } from './synchronized-non-final';
import { systemOutPrintlnRule } from './system-out-println';

export {
  nullDerefChainRule,
  resourceNotClosedRule,
  equalsWithoutHashCodeRule,
  synchronizedNonFinalRule,
  systemOutPrintlnRule
};

export const javaRules: Rule[] = [
  nullDerefChainRule,
  resourceNotClosedRule,
  equalsWithoutHashCodeRule,
  synchronizedNonFinalRule,
  systemOutPrintlnRule
];
