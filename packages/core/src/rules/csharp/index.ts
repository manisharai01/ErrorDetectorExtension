/**
 * C# rule pack — language-specific rules for `.cs` files.
 *
 * Re-exports each rule const plus a `csharpRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { noNullForgivingRule } from './no-null-forgiving';
import { sqlStringConcatRule } from './sql-string-concat';
import { asyncVoidRule } from './async-void';
import { consoleWriteLineRule } from './console-writeline';
import { emptyCatchRule } from './empty-catch';

export {
  noNullForgivingRule,
  sqlStringConcatRule,
  asyncVoidRule,
  consoleWriteLineRule,
  emptyCatchRule
};

export const csharpRules: Rule[] = [
  noNullForgivingRule,
  sqlStringConcatRule,
  asyncVoidRule,
  consoleWriteLineRule,
  emptyCatchRule
];
