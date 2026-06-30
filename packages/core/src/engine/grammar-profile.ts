/**
 * Per-grammar node-type profiles.
 *
 * Tree-sitter node-type names differ across grammars (JS `call_expression` vs
 * Python `call`; JS `number` vs Python `integer`/`float` vs Go `int_literal`).
 * "Universal" rules — secrets, magic-numbers, nesting, complexity — describe
 * what they want SEMANTICALLY and look up the concrete node types here, so a
 * single rule body works across every supported language.
 *
 * Node-type names were verified against the vendored grammars by dumping parse
 * trees (see scripts / engine tests). When adding a language, parse a sample
 * and confirm the type names before filling this in.
 */

import type { Language } from '../rules/types';

export interface GrammarProfile {
  /** Literal-string node types (their `.text` includes the quotes). */
  stringNodes: string[];
  /** Numeric-literal node types. */
  numberNodes: string[];
  /** Control-flow statements that introduce a nesting level. */
  nestingNodes: string[];
  /** Constructs that add +1 (and a nesting bonus) to cognitive complexity. */
  complexityNodes: string[];
  /** Node types that ARE a boolean combinator (e.g. Python `boolean_operator`). */
  booleanOpNodes: string[];
  /** Operator texts on a `binary_expression` that add +1 complexity (JS/Go). */
  logicalOperators: string[];
  /** Function-definition node types (complexity is scored per function). */
  functionNodes: string[];
  /** Comment node types (JS/Py/Go use `comment`; Rust/Java/Kotlin differ). */
  commentNodes: string[];
}

const JS: GrammarProfile = {
  stringNodes: ['string', 'template_string'],
  numberNodes: ['number'],
  nestingNodes: [
    'if_statement',
    'for_statement',
    'for_in_statement',
    'while_statement',
    'do_statement',
    'switch_statement',
    'try_statement'
  ],
  complexityNodes: [
    'if_statement',
    'for_statement',
    'for_in_statement',
    'while_statement',
    'do_statement',
    'catch_clause',
    'switch_statement',
    'ternary_expression'
  ],
  booleanOpNodes: [],
  logicalOperators: ['&&', '||'],
  functionNodes: [
    'function_declaration',
    'function_expression',
    'arrow_function',
    'method_definition',
    'generator_function',
    'generator_function_declaration'
  ],
  commentNodes: ['comment']
};

const PYTHON: GrammarProfile = {
  stringNodes: ['string'],
  numberNodes: ['integer', 'float'],
  nestingNodes: ['if_statement', 'for_statement', 'while_statement', 'try_statement', 'with_statement'],
  complexityNodes: [
    'if_statement',
    'elif_clause',
    'for_statement',
    'while_statement',
    'except_clause',
    'conditional_expression'
  ],
  booleanOpNodes: ['boolean_operator'],
  logicalOperators: [],
  functionNodes: ['function_definition'],
  commentNodes: ['comment']
};

const GO: GrammarProfile = {
  stringNodes: ['interpreted_string_literal', 'raw_string_literal'],
  numberNodes: ['int_literal', 'float_literal', 'imaginary_literal'],
  nestingNodes: [
    'if_statement',
    'for_statement',
    'expression_switch_statement',
    'type_switch_statement',
    'select_statement'
  ],
  complexityNodes: [
    'if_statement',
    'for_statement',
    'expression_case',
    'type_case',
    'communication_case',
    'expression_switch_statement',
    'type_switch_statement',
    'select_statement'
  ],
  booleanOpNodes: [],
  logicalOperators: ['&&', '||'],
  functionNodes: ['function_declaration', 'method_declaration'],
  commentNodes: ['comment']
};

const RUST: GrammarProfile = {
  stringNodes: ['string_literal', 'raw_string_literal'],
  numberNodes: ['integer_literal', 'float_literal'],
  nestingNodes: ['if_expression', 'for_expression', 'while_expression', 'loop_expression', 'match_expression'],
  complexityNodes: [
    'if_expression',
    'for_expression',
    'while_expression',
    'loop_expression',
    'match_expression'
  ],
  booleanOpNodes: [],
  logicalOperators: ['&&', '||'],
  functionNodes: ['function_item', 'closure_expression'],
  commentNodes: ['line_comment', 'block_comment']
};

const JAVA: GrammarProfile = {
  stringNodes: ['string_literal'],
  numberNodes: [
    'decimal_integer_literal',
    'hex_integer_literal',
    'octal_integer_literal',
    'binary_integer_literal',
    'decimal_floating_point_literal',
    'hex_floating_point_literal'
  ],
  nestingNodes: [
    'if_statement',
    'for_statement',
    'enhanced_for_statement',
    'while_statement',
    'do_statement',
    'switch_expression',
    'try_statement'
  ],
  complexityNodes: [
    'if_statement',
    'for_statement',
    'enhanced_for_statement',
    'while_statement',
    'do_statement',
    'catch_clause',
    'switch_expression',
    'ternary_expression'
  ],
  booleanOpNodes: [],
  logicalOperators: ['&&', '||'],
  functionNodes: ['method_declaration', 'constructor_declaration', 'lambda_expression'],
  commentNodes: ['line_comment', 'block_comment']
};

const KOTLIN: GrammarProfile = {
  stringNodes: ['string_literal'],
  numberNodes: ['integer_literal', 'real_literal', 'hex_literal', 'bin_literal', 'long_literal'],
  nestingNodes: ['if_expression', 'for_statement', 'while_statement', 'do_while_statement', 'when_expression', 'try_expression'],
  complexityNodes: [
    'if_expression',
    'for_statement',
    'while_statement',
    'do_while_statement',
    'when_entry',
    'catch_block'
  ],
  booleanOpNodes: ['conjunction_expression', 'disjunction_expression'],
  logicalOperators: [],
  functionNodes: ['function_declaration', 'lambda_literal', 'anonymous_function'],
  commentNodes: ['line_comment', 'multiline_comment']
};

export const GRAMMAR_PROFILES: Record<Language, GrammarProfile> = {
  javascript: JS,
  typescript: JS,
  jsx: JS,
  tsx: JS,
  vue: JS,
  python: PYTHON,
  go: GO,
  rust: RUST,
  java: JAVA,
  kotlin: KOTLIN
};

export function profileFor(language: Language): GrammarProfile {
  return GRAMMAR_PROFILES[language];
}
