/**
 * Dart / Flutter rule pack — language-specific rules for `.dart` files.
 *
 * Re-exports each rule const plus a `dartRules` array the registry can spread.
 */

import type { Rule } from '../types';

import { dartPrintRule } from './print-statement';
import { dartNullAssertionRule } from './null-assertion';
import { dartEmptyCatchRule } from './empty-catch';
import { dartUnawaitedFutureRule } from './unawaited-future';
import { dartUndisposedControllerRule } from './undisposed-controller';
import { dartBadCertificateRule } from './bad-certificate';

export {
  dartPrintRule,
  dartNullAssertionRule,
  dartEmptyCatchRule,
  dartUnawaitedFutureRule,
  dartUndisposedControllerRule,
  dartBadCertificateRule
};

export const dartRules: Rule[] = [
  dartPrintRule,
  dartNullAssertionRule,
  dartEmptyCatchRule,
  dartUnawaitedFutureRule,
  dartUndisposedControllerRule,
  dartBadCertificateRule
];
