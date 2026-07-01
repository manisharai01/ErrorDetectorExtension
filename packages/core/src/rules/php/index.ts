/**
 * PHP rule pack — language-specific rules for `.php` files.
 *
 * Re-exports each rule const plus a `phpRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { sqlInjectionRule } from './sql-injection';
import { unserializeUserInputRule } from './unserialize-user-input';
import { typeJugglingRule } from './type-juggling';
import { debugOutputRule } from './debug-output';

export {
  sqlInjectionRule,
  unserializeUserInputRule,
  typeJugglingRule,
  debugOutputRule
};

export const phpRules: Rule[] = [
  sqlInjectionRule,
  unserializeUserInputRule,
  typeJugglingRule,
  debugOutputRule
];
