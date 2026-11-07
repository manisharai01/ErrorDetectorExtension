# Rule catalogue

97 per-file rules and 4 whole-program checks.
Generated from the registry by `npm run docs:rules` — do not edit by hand.

Configure any rule in `.iedrc.json` (`"rules": { "IED-Q003": "off" }`) or
suppress one occurrence with `// ied-disable-next-line <id> — reason`.

## Per-file rules

| ID | Name | Category | Severity | Languages | What it finds |
| --- | --- | --- | --- | --- | --- |
| IED-S001 | hardcoded-secrets | security | error | all | API keys, tokens, or private keys hardcoded in source. |
| IED-S002 | eval-usage | security | error | JS/TS/Vue | Use of eval() or new Function() executes arbitrary code. |
| IED-S003 | inner-html | security | warning | JS/TS/Vue | Assignment to innerHTML/outerHTML without a visible sanitiser. |
| IED-S004 | command-injection | security | error | JS/TS/Vue | exec/spawn called with a concatenated or interpolated command string. |
| IED-S005 | taint-tracking | security | warning | JS/TS/Vue | User-controlled input flows into a sensitive sink without sanitisation. |
| IED-S011 | bare-except | security | warning | Python | Bare `except:` swallows all exceptions, including control-flow ones. |
| IED-S012 | fstring-injection | security | error | Python | Interpolated f-string used as SQL text (possible SQL injection). |
| IED-S013 | pickle-untrusted | security | error | Python | Deserializing untrusted data with pickle or unsafe yaml.load. |
| IED-S014 | sql-injection | security | error | Go | SQL query built with string concatenation of a non-literal. |
| IED-S015 | buffer-overflow | security | warning | C, C++ | Unbounded copy function or constant out-of-bounds array index. |
| IED-S016 | format-string | security | error | C, C++ | printf-family call whose format string is not a string literal. |
| IED-S017 | sql-injection | security | error | PHP | SQL query built with string concatenation or interpolation of a variable. |
| IED-S018 | unserialize-user-input | security | error | PHP | unserialize() called on a variable or superglobal (untrusted input). |
| IED-S019 | sql-string-concat | security | error | C# | Flags SQL built by concatenating or interpolating a variable into a string. |
| IED-S020 | sql-injection | security | error | Ruby | SQL query built with string interpolation of a variable. |
| IED-S021 | eval-usage | security | error | Ruby | eval / instance_eval / class_eval / module_eval called with a non-literal argument. |
| IED-S022 | unsafe-deserialization | security | error | Ruby | Marshal.load / YAML.load called on non-literal (untrusted) data. |
| IED-S023 | bad-certificate-callback | security | error | Dart | TLS certificate validation disabled (badCertificateCallback returns true). |
| IED-H003 | inconsistent-usage | logic | info | JS/TS/Vue | A variable is used both as an array and as an object in one function. |
| IED-L001 | array-index | logic | error | JS/TS/Vue | Detects suspicious indexing such as arr[arr.length] and <= arr.length loop bounds. |
| IED-L002 | promise-swallowing | logic | warning | JS/TS/Vue | Promise-returning calls used as statements without await or rejection handling. *(quick fix)* |
| IED-L004 | object-mutation | logic | warning | JS/TS/Vue | Mutation of a function argument via member or index assignment. |
| IED-L005 | infinite-loop | logic | warning | JS/TS/Vue | A constant-true loop that has no break/return/throw inside. |
| IED-L006 | recursion-base-case | logic | warning | JS/TS/Vue | Function calls itself without a guarded base case (no if/ternary). |
| IED-L007 | type-guard-contradiction | logic | warning | TS, TSX, JS | A logical-AND of typeof checks that can never all be true. |
| IED-L008 | constant-condition | logic | warning | JS/TS/Vue | A branch condition is a constant literal, so one branch is dead code. |
| IED-L009 | unreachable-code | logic | warning | JS/TS/Vue | Statement that can never run because it follows return/throw/break/continue. |
| IED-L011 | mutable-default-arg | logic | warning | Python | Mutable value used as a function default argument. |
| IED-L012 | late-binding-closure | logic | warning | Python | Closure in a loop captures the loop variable by reference (late binding). |
| IED-L013 | is-vs-equals | logic | warning | Python | Identity comparison (`is`) against a numeric or string literal. |
| IED-L014 | nil-deref | logic | warning | Go | A variable is dereferenced before its nil check. |
| IED-L015 | null-deref-chain | logic | warning | Java | A long chained dereference may throw NullPointerException. |
| IED-L016 | platform-type-null | logic | info | Kotlin | Plain `.` access on a Java getter result (platform-type NPE risk). |
| IED-L017 | integer-overflow | logic | info | C, C++ | Multiplication in an allocation size that can overflow size_t. |
| IED-L018 | type-juggling | logic | warning | PHP | Loose equality (== / !=) is subject to PHP type juggling. |
| IED-L019 | empty-catch | logic | warning | C# | Flags empty catch blocks that silently swallow exceptions. |
| IED-L020 | rescue-swallow | logic | warning | Ruby | Empty rescue clause silently swallows the exception. |
| IED-L021 | missing-await | logic | warning | JS/TS/Vue | An async function is called without await (or without returning it from a .then callback). *(quick fix)* |
| IED-L022 | null-deref | logic | warning | JS/TS/Vue | A value that may be null/undefined is dereferenced before it is checked. |
| IED-L023 | inconsistent-return | logic | warning | JS/TS/Vue | A function returns different kinds of values (or sometimes nothing) on different paths. |
| IED-L024 | empty-catch | logic | warning | Dart | Empty catch / on handler silently swallows the error. |
| IED-C001 | race-condition | concurrency | warning | JS/TS/Vue | Same variable written in multiple awaited assignments in one async function. |
| IED-C007 | sync-in-async | concurrency | warning | Python | Blocking synchronous call inside an async function. |
| IED-C008 | goroutine-leak | concurrency | warning | Go | Goroutine loops on a channel with no exit path and may leak. |
| IED-C009 | nested-mutex-lock | concurrency | warning | Rust | A mutex is locked while another lock guard is still held (deadlock risk). |
| IED-C010 | synchronized-non-final | concurrency | warning | Java | synchronized locks on a non-final field. |
| IED-C011 | coroutine-leak | concurrency | warning | Kotlin | Coroutine launched on GlobalScope (unstructured, leaks). |
| IED-C012 | main-actor-violation | concurrency | info | Swift | UI mutation inside a background DispatchQueue closure. |
| IED-C013 | async-void | concurrency | warning | C# | Flags `async void` methods, which cannot be awaited and swallow exceptions. |
| IED-C014 | unawaited-future | concurrency | warning | Dart | Future from an async call is discarded inside an async function. *(quick fix)* |
| IED-R005 | open-without-context | resource | warning | Python | `open()` result assigned without a `with` context manager. |
| IED-R006 | defer-in-loop | resource | warning | Go | A defer statement inside a loop accumulates until function return. |
| IED-R007 | unsafe-without-comment | resource | warning | Rust | An unsafe block lacks a // SAFETY: justification comment. |
| IED-R008 | resource-not-closed | resource | warning | Java | A closeable resource is created outside try-with-resources and may leak. |
| IED-R009 | retain-cycle | resource | warning | Swift | Closure captures `self` strongly without a [weak self] capture list. |
| IED-R010 | use-after-free | resource | warning | C, C++ | Pointer used after free()/delete without an intervening reassignment. |
| IED-R011 | undisposed-controller | resource | warning | Dart | Controller / subscription / timer created in a State class but never disposed. |
| IED-T001 | unsafe-as | type-safety | warning | TS, TSX | Type assertion (`as`) that bypasses the type checker. |
| IED-T002 | any-type | type-safety | info | TS, TSX | Use of the `any` type. |
| IED-T003 | non-null-assertion | type-safety | info | TS, TSX | Non-null assertion (`!`) that bypasses null-checking. |
| IED-T004 | not-null-assertion | type-safety | warning | Kotlin | Use of the `!!` non-null assertion operator. |
| IED-T005 | unchecked-error | type-safety | warning | Go | A returned error is discarded with the blank identifier. |
| IED-T006 | unwrap-in-prod | type-safety | warning | Rust | unwrap()/expect() panics on Err/None; handle the Result/Option. |
| IED-T007 | equals-without-hashcode | type-safety | warning | Java | A class overrides equals() but not hashCode(). |
| IED-T008 | force-unwrap | type-safety | warning | Swift | Use of the force-unwrap operator `!` on an Optional. |
| IED-T009 | no-null-forgiving | type-safety | warning | C# | Flags the null-forgiving operator `x!`. |
| IED-T010 | null-assertion | type-safety | warning | Dart | Null-assertion operator `!` throws at runtime when the value is null. |
| IED-F001 | hook-deps | framework | warning | JSX, TSX, JS, TS | React effect/memo hook called without a dependency array. |
| IED-F002 | missing-key | framework | warning | JSX, TSX | JSX returned from .map() without a key prop. |
| IED-F003 | state-mutation | framework | warning | JSX, TSX, JS, TS | Direct mutation or reassignment of a useState value. |
| IED-F004 | state-after-unmount | framework | info | JSX, TSX, JS, TS | setState inside a .then() callback without an unmount guard. |
| IED-F005 | ref-misuse | framework | warning | JS, TS, Vue | Reassigning a Vue ref instead of its .value. |
| IED-P001 | nested-loop | performance | info | JS/TS/Vue | A loop nested inside another loop (potential O(n^2)). |
| IED-P007 | n-plus-one-query | performance | warning | Python | A database/ORM query executed inside a loop (possible N+1). |
| IED-P008 | append-prealloc | performance | info | Go | append-to-self inside a loop; preallocate the slice instead. |
| IED-P009 | needless-clone | performance | info | Rust | A `.clone()` call that may be unnecessary (Copy types do not need it). |
| IED-H001 | cognitive-complexity | quality | info | all | Function with high cognitive complexity (nested control flow, boolean chains). |
| IED-H002 | overwritten-before-use | quality | info | JS/TS/Vue | A value is assigned and then overwritten before it is ever read. |
| IED-Q001 | console-log | quality | warning | JS/TS/Vue | Console logging left in code. *(quick fix)* |
| IED-Q002 | commented-code | quality | info | all | A block of consecutive commented-out lines that resemble code. |
| IED-Q003 | magic-numbers | quality | info | all | Numeric literals used inline instead of a named constant. |
| IED-Q004 | deep-nesting | quality | info | all | Control-flow nesting deeper than the configured maximum. |
| IED-Q005 | todo-without-issue | quality | info | all | TODO/FIXME comment without an issue tracker reference. |
| IED-Q006 | unused-parameters | quality | info | JS/TS/Vue | A function parameter is declared but never used in the body. *(quick fix)* |
| IED-Q007 | duplicate-code | quality | info | all | Two functions in this file have structurally identical bodies. |
| IED-Q008 | fmt-println | quality | warning | Go | fmt.Print* call left in code; use a logger. |
| IED-Q009 | print-statement | quality | warning | Python | A `print()` call left in non-test code. |
| IED-Q010 | system-out-println | quality | warning | Java | Uses System.out printing instead of a logger. |
| IED-Q011 | println-statement | quality | warning | Kotlin | println/print call left in code; use a logger. |
| IED-Q012 | dbg-macro | quality | warning | Rust | A dbg!() macro invocation was left in the code. |
| IED-Q013 | suppression-without-reason | quality | warning | all | An inline suppression comment has no reason explaining why. |
| IED-Q014 | debug-output | quality | warning | PHP | var_dump / print_r / var_export left in source. |
| IED-Q015 | print-statement | quality | warning | Swift | Leftover `print()` / `debugPrint()` call. |
| IED-Q016 | printf-left | quality | info | C, C++ | Debug printf/puts/cout left in shipping code. |
| IED-Q017 | console-writeline | quality | info | C# | Flags Console.Write/WriteLine debug output. |
| IED-Q018 | debug-output | quality | warning | Ruby | Leftover debug print (puts / p / pp / print). |
| IED-Q019 | print-statement | quality | warning | Dart | print() call left in Dart code. |

## Whole-program checks (`ied project`, VS Code "Check Project")

| ID | Name | Category | Severity | What it finds |
| --- | --- | --- | --- | --- |
| IED-X001 | import-cycle | logic | warning | Modules import each other in a cycle (undefined bindings / partially initialised modules at load time). |
| IED-X002 | broken-import | logic | error | Relative import of a file that does not exist, or of a name the module does not export. |
| IED-X003 | duplicate-across-files | quality | info | Structurally identical functions copied across different files. |
| IED-X004 | unused-export | quality | info | Exported symbol that no scanned file imports. |
