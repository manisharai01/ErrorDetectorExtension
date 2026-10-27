/**
 * Ruby rule pack — language-specific rules for `.rb` files.
 *
 * Re-exports each rule const plus a `rubyRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { sqlInjectionRubyRule } from './sql-injection';
import { evalUsageRubyRule } from './eval-usage';
import { unsafeDeserializationRule } from './unsafe-deserialization';
import { debugOutputRubyRule } from './debug-output';
import { rescueSwallowRule } from './rescue-swallow';

export {
  sqlInjectionRubyRule,
  evalUsageRubyRule,
  unsafeDeserializationRule,
  debugOutputRubyRule,
  rescueSwallowRule
};

export const rubyRules: Rule[] = [
  sqlInjectionRubyRule,
  evalUsageRubyRule,
  unsafeDeserializationRule,
  debugOutputRubyRule,
  rescueSwallowRule
];
