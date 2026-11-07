/**
 * IED-R011 — undisposed-controller (Dart / Flutter)
 *
 * A `State` class that creates a controller, focus node, stream subscription
 * or timer owns it and must release it in `dispose()`. Forgetting to is the
 * classic Flutter leak: listeners keep firing after the widget is gone
 * ("setState() called after dispose()"), animations keep ticking, and the
 * objects are never garbage collected.
 *
 * For each `class X extends State<…>` we take the fields whose declared type
 * (or initializer) is a known disposable, keep the ones this class actually
 * creates (`= TextEditingController()`, `= stream.listen(…)`,
 * `= Timer.periodic(…)` — in the field or anywhere in the class), and flag
 * those that `dispose()` never disposes / cancels / closes. A controller handed
 * in from outside (`widget.controller`) is not owned and is not flagged.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Disposable type -> the method that releases it. */
const DISPOSABLE: Record<string, string> = {
  TextEditingController: 'dispose',
  AnimationController: 'dispose',
  ScrollController: 'dispose',
  PageController: 'dispose',
  TabController: 'dispose',
  FocusNode: 'dispose',
  ValueNotifier: 'dispose',
  StreamController: 'close',
  StreamSubscription: 'cancel',
  Timer: 'cancel'
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Source pattern for "this field is created here" (right after `name =`). */
function creationPattern(kind: string): string {
  return kind === 'StreamSubscription' ? '[^;]*\\.listen\\s*\\(' : `(?:new\\s+)?${kind}\\b`;
}

interface Field {
  name: string;
  nameNode: TSNode;
  kind: string;
  /** Text of the field's own declaration (may contain its initializer). */
  declaration: string;
}

/** Disposable fields declared directly in a class body. */
function disposableFields(body: TSNode): Field[] {
  const fields: Field[] = [];
  for (let i = 0; i < body.namedChildCount; i++) {
    const decl = body.namedChild(i);
    if (!decl || decl.type !== 'declaration') continue;
    let declaredType: string | null = null;
    let list: TSNode | null = null;
    for (let j = 0; j < decl.namedChildCount; j++) {
      const c = decl.namedChild(j);
      if (!c) continue;
      if (c.type === 'type_identifier' && declaredType === null) declaredType = c.text;
      if (c.type === 'initialized_identifier_list') list = c;
    }
    if (!list) continue;
    for (let j = 0; j < list.namedChildCount; j++) {
      const item = list.namedChild(j);
      const nameNode = item?.namedChild(0);
      if (!item || !nameNode || nameNode.type !== 'identifier') continue;
      // `final _c = TextEditingController();` — no declared type, use the constructor.
      const ctor = item.namedChild(1);
      const kind =
        declaredType && DISPOSABLE[declaredType]
          ? declaredType
          : ctor && ctor.type === 'identifier' && DISPOSABLE[ctor.text]
            ? ctor.text
            : null;
      if (kind) fields.push({ name: nameNode.text, nameNode, kind, declaration: item.text });
    }
  }
  return fields;
}

/** Text of the class's `dispose()` method body, or '' when there is none. */
function disposeBodyText(body: TSNode): string {
  for (let i = 0; i < body.namedChildCount; i++) {
    const sig = body.namedChild(i);
    if (!sig || sig.type !== 'method_signature') continue;
    const fn = sig.namedChild(0);
    if (fn?.childForFieldName('name')?.text !== 'dispose') continue;
    const impl = sig.nextNamedSibling;
    return impl && impl.type === 'function_body' ? impl.text : '';
  }
  return '';
}

export const dartUndisposedControllerRule: Rule = {
  id: 'IED-R011',
  name: 'undisposed-controller',
  category: 'resource',
  severity: Severity.Warning,
  languages: ['dart'],
  description: 'Controller / subscription / timer created in a State class but never disposed.',
  docs: [
    '# undisposed-controller (IED-R011)',
    '',
    'A Flutter `State` that creates a `TextEditingController`,',
    '`AnimationController`, `FocusNode`, `StreamSubscription`, `Timer`, … must',
    'release it in `dispose()`, or it leaks and keeps firing after the widget',
    'is gone.',
    '',
    '```dart',
    'class _LoginState extends State<Login> {',
    '  final _email = TextEditingController();   // flagged: never disposed',
    '  StreamSubscription? _sub;                 // flagged if never cancelled',
    '',
    '  @override',
    '  void dispose() { super.dispose(); }',
    '}',
    '```',
    '',
    'Fix: call `_email.dispose()` / `_sub?.cancel()` in `dispose()`.'
  ].join('\n'),

  nodeTypes: () => ['class_definition'],

  run(ctx: RuleContext): void {
    for (const cls of ctx.nodesOfType('class_definition')) {
      const superclass = cls.childForFieldName('superclass');
      if (superclass?.namedChild(0)?.text !== 'State') continue;
      const body = cls.childForFieldName('body');
      if (!body) continue;

      const fields = disposableFields(body);
      if (fields.length === 0) continue;
      const classText = body.text;
      const disposeText = disposeBodyText(body);

      for (const f of fields) {
        const name = escapeRe(f.name);
        const created = new RegExp(`\\b${name}\\s*=\\s*${creationPattern(f.kind)}`);
        if (!created.test(f.declaration) && !created.test(classText)) continue;
        const released = new RegExp(`\\b${name}\\s*[?!]?\\.\\.?\\s*(?:dispose|cancel|close)\\s*\\(`);
        if (released.test(disposeText)) continue;
        if (ctx.isSuppressed(f.nameNode.startPosition.row, 'IED-R011')) continue;
        const verb = DISPOSABLE[f.kind];
        ctx.report({
          message: `${f.kind} "${f.name}" is created here but never released — call ${f.name}.${verb}() in dispose().`,
          severity: Severity.Warning,
          range: nodeRange(f.nameNode),
          data: { field: f.name, kind: f.kind }
        });
      }
    }
  }
};
