/**
 * IED-Q003 — magic-numbers
 *
 * Flags numeric literals that appear unnamed inside expressions, other than
 * well-known values (0, ±1, 2, 100, unit conversions like 60/1000/1024, HTTP
 * status codes — see ALLOWED_VALUES — plus any `ignore` values configured for
 * the rule). A number is NOT magic when its context already names it:
 *   - the initializer of a `const` (JS/TS), a `const`/`final` (Dart), or a plain
 *     assignment `TIMEOUT = 30` / `port: int = 8000` (Python);
 *   - a keyword / named argument (`retry(times=3)`, `Duration(seconds: 5)`);
 *   - a parameter default (`def f(limit=50)`, `function f(limit = 50)`);
 *   - an object / dict value (`{ timeoutMs: 5000 }`, `{"fps": 24}`), or an
 *     element of a named data table (`SIZES = [(1280, 720), …]`);
 *   - a JSX attribute (`<Icon size={12} />`);
 *   - a class field initializer or enum member value;
 *   - an array subscript index.
 * Test files are skipped (expected values in assertions are not magic).
 * Each offending number is reported individually.
 */

import {
  ALL_LANGUAGES,
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

/**
 * Values considered "not magic" and therefore allowed anywhere: the trivial
 * ones, everyday unit conversions (60 s, 24 h, 3600 s, 1000 ms, 1024 bytes,
 * 255/256 colour channels, 360°) and common HTTP status codes. Compared by
 * value, so `0.0`, `1.0` and `1e3` match too. Extend per project with the
 * rule option `{ "options": { "ignore": [12, 0.5] } }`.
 */
const ALLOWED_VALUES = new Set([
  0, 1, -1, 2, 100,
  24, 60, 360, 1000, 1024, 3600, 255, 256,
  200, 201, 202, 204, 301, 302, 304, 307, 308,
  400, 401, 403, 404, 405, 409, 410, 422, 429, 500, 501, 502, 503, 504
]);

/** The literal's numeric value (digit separators and type suffixes dropped). */
function numericValue(text: string): number {
  const cleaned = text
    .replace(/_/g, '')
    .replace(/(?:[iu](?:8|16|32|64|128|size)|f32|f64)$/, '') // Rust 1000u32
    .replace(/[lLuUfFdDmM]+$/, ''); // C/Java/Kotlin/C# 10L, 1.5f, 2m
  return /^-?0[xX]/.test(cleaned) ? parseInt(cleaned, 16) : Number(cleaned);
}

/** Data-table containers: numbers inside them share the name of the table. */
const COLLECTIONS = new Set(['list', 'tuple', 'set', 'array', 'dictionary', 'object', 'pair', 'expression_list']);

/**
 * Resolve the literal text for a `number` node, folding a leading unary minus
 * so that `-1` is recognised as allowed.
 */
function numericText(node: TSNode): string {
  const parent = node.parent;
  if (parent && (parent.type === 'unary_expression' || parent.type === 'unary_operator')) {
    const op = parent.child(0);
    if (op && op.text === '-') return `-${node.text}`;
  }
  return node.text;
}

/** The node that stands for the literal's value: the number, or `-n` around it. */
function valueNode(node: TSNode): TSNode {
  const parent = node.parent;
  return parent && (parent.type === 'unary_expression' || parent.type === 'unary_operator') ? parent : node;
}

/** Parent node type -> the field that holds a value its context names. */
const NAMING_SLOTS: Record<string, string> = {
  pair: 'value', // { timeoutMs: 5000 }, {"fps": 24}, Ruby { fps: 24 }
  keyword_argument: 'value', // Python retry(times=3)
  default_parameter: 'value', // Python def f(limit=50)
  typed_default_parameter: 'value', // Python def f(limit: int = 50)
  assignment_pattern: 'right', // JS function f(limit = 50)
  required_parameter: 'value', // TS (limit: number = 50)
  optional_parameter: 'value',
  public_field_definition: 'value', // TS class field `retries = 3`
  field_definition: 'value', // JS class field
  enum_assignment: 'value' // TS enum member `A = 3`
};

/** True when `value` sits in a slot whose surrounding syntax names it. */
function namesValue(value: TSNode, language: string): boolean {
  const parent = value.parent;
  if (!parent) return false;
  const field = NAMING_SLOTS[parent.type];
  if (field) return sameNode(parent.childForFieldName(field), value);
  if (parent.type === 'named_argument') return true; // Dart `seconds: 5`
  // JSX attribute: <Icon size={12} />
  if (parent.type === 'jsx_expression' && parent.parent?.type === 'jsx_attribute') return true;
  if (language === 'python' && parent.type === 'assignment') {
    const left = parent.childForFieldName('left');
    return (
      sameNode(parent.childForFieldName('right'), value) &&
      (left?.type === 'identifier' || left?.type === 'attribute' || left?.type === 'pattern_list')
    );
  }
  return false;
}

/**
 * True when the surrounding syntax already gives the number a name — directly,
 * or as an element of a data table that is itself named
 * (`SIZES = {"16:9": [(672, 384), …]}`).
 */
function isNamedByContext(node: TSNode, language: string): boolean {
  let value = valueNode(node);
  for (;;) {
    if (namesValue(value, language)) return true;
    const parent = value.parent;
    if (!parent || !COLLECTIONS.has(parent.type)) return false;
    value = parent;
  }
}

/** Same node identity, compared by source span (unambiguous within one tree). */
function sameNode(a: TSNode | null | undefined, b: TSNode): boolean {
  if (!a) return false;
  return (
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column &&
    a.type === b.type
  );
}

/**
 * True when `node` is the value of a `const` variable_declarator, i.e. the
 * declaration is already naming the constant.
 */
function isConstInitializer(node: TSNode): boolean {
  // The number may be wrapped in a unary_expression (e.g. `-5`); climb past it.
  let valueNode = node;
  const parent = node.parent;
  if (parent && parent.type === 'unary_expression') valueNode = parent;

  const declarator = valueNode.parent;
  if (!declarator || declarator.type !== 'variable_declarator') return false;
  if (!sameNode(declarator.childForFieldName('value'), valueNode)) return false;

  const lexical = declarator.parent;
  if (!lexical || lexical.type !== 'lexical_declaration') return false;
  // lexical_declaration starts with the `const`/`let` keyword.
  return lexical.child(0)?.text === 'const';
}

const DART_CONST_KEYWORDS = new Set(['const_builtin', 'final_builtin']);

/**
 * Dart: the number is the value of a `const`/`final` declaration — a top-level
 * or static constant (`static_final_declaration`), a `const`/`final` local, or
 * a `final` field (`initialized_identifier` inside a `declaration`).
 */
function isDartNamedConstant(node: TSNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === 'static_final_declaration') return true;
  if (parent.type === 'initialized_variable_definition') {
    return (
      sameNode(parent.childForFieldName('value'), node) &&
      DART_CONST_KEYWORDS.has(parent.child(0)?.type ?? '')
    );
  }
  if (parent.type === 'initialized_identifier') {
    const declaration = parent.parent?.parent;
    if (!declaration || declaration.type !== 'declaration') return false;
    for (let i = 0; i < declaration.childCount; i++) {
      if (DART_CONST_KEYWORDS.has(declaration.child(i)?.type ?? '')) return true;
    }
  }
  return false;
}

/**
 * True when `node` is a subscript index or slice bound: JS `arr[3]`, Python
 * `items[3]`, `text[:300]`, `parts[-4:]`.
 */
function isArrayIndex(node: TSNode): boolean {
  const value = valueNode(node);
  const parent = value.parent;
  if (!parent) return false;
  if (parent.type === 'subscript_expression') return sameNode(parent.childForFieldName('index'), value);
  if (parent.type === 'slice') return true;
  return parent.type === 'subscript' && !sameNode(parent.childForFieldName('value'), value);
}

export const magicNumbersRule: Rule = {
  id: 'IED-Q003',
  name: 'magic-numbers',
  category: 'quality',
  severity: Severity.Info,
  languages: ALL_LANGUAGES,
  description: 'Numeric literals used inline instead of a named constant.',
  docs: [
    '# magic-numbers (IED-Q003)',
    '',
    'Unexplained numeric literals are easier to understand when extracted to a',
    'named constant. Numbers whose context already names them — a constant or',
    'assignment, a keyword argument, a parameter default, an object/dict value,',
    'a named data table, a JSX attribute, a class field — array indexes, test',
    'files and well-known values (0, ±1, 2, 100, 60, 1000, 1024, HTTP status',
    'codes, …) are ignored.',
    '',
    '```js',
    'setTimeout(fn, 86400000); // flagged — name it ONE_DAY_MS',
    'retry({ attempts: 3 });   // ok — the key names it',
    '```',
    '',
    'Allow more values per project: `"IED-Q003": { "severity": "info",',
    '"options": { "ignore": [12, 0.5] } }`.'
  ].join('\n'),

  nodeTypes: (language) => profileFor(language).numberNodes,

  run(ctx: RuleContext): void {
    // Expected values in assertions are the point of a test, not magic.
    if (ctx.isTestFile) return;
    // Numeric-literal node types differ per grammar (JS `number`, Python
    // `integer`/`float`, Go `int_literal`/`float_literal`). The naming
    // exemptions below look for each grammar's own node shapes; where a
    // grammar has none of them, every non-trivial literal is reported.
    const dart = ctx.language === 'dart';
    const extra = Array.isArray(ctx.config.ignore) ? ctx.config.ignore.map(Number) : [];
    const allowed = extra.length > 0 ? new Set([...ALLOWED_VALUES, ...extra]) : ALLOWED_VALUES;
    for (const node of ctx.nodesOfType(profileFor(ctx.language).numberNodes)) {
      if (allowed.has(numericValue(numericText(node)))) continue;
      if (isConstInitializer(node) || isArrayIndex(node)) continue;
      if (isNamedByContext(node, ctx.language)) continue;
      if (dart && isDartNamedConstant(node)) continue;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-Q003')) continue;
      ctx.report({
        message: `Magic number ${node.text} — extract it to a named constant.`,
        severity: Severity.Info,
        range: nodeRange(node),
        data: { value: node.text }
      });
    }
  }
};
