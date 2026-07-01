/**
 * C / C++ rule pack — shared rules for `.c`/`.h` and `.cpp`/`.cc`/`.hpp` files.
 *
 * Re-exports each rule const plus a `cFamilyRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { bufferOverflowRule } from './buffer-overflow';
import { formatStringRule } from './format-string';
import { useAfterFreeRule } from './use-after-free';
import { integerOverflowRule } from './integer-overflow';
import { printfLeftRule } from './printf-left';

export {
  bufferOverflowRule,
  formatStringRule,
  useAfterFreeRule,
  integerOverflowRule,
  printfLeftRule
};

export const cFamilyRules: Rule[] = [
  bufferOverflowRule,
  formatStringRule,
  useAfterFreeRule,
  integerOverflowRule,
  printfLeftRule
];
