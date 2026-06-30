/**
 * Rust rule pack — language-specific rules for `.rs` files.
 *
 * Re-exports each rule const plus a `rustRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { unwrapInProdRule } from './unwrap-in-prod';
import { nestedMutexLockRule } from './nested-mutex-lock';
import { dbgMacroRule } from './dbg-macro';
import { unsafeWithoutCommentRule } from './unsafe-without-comment';
import { needlessCloneRule } from './needless-clone';

export {
  unwrapInProdRule,
  nestedMutexLockRule,
  dbgMacroRule,
  unsafeWithoutCommentRule,
  needlessCloneRule
};

export const rustRules: Rule[] = [
  unwrapInProdRule,
  nestedMutexLockRule,
  dbgMacroRule,
  unsafeWithoutCommentRule,
  needlessCloneRule
];
