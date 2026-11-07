# Demo guide — Invisible Errors Detector

A feature-by-feature script for presenting the project: what to run, what the
audience will see, and how to check it worked. Every expected result below was
captured from a real run on this repository. Allow ~20 minutes for everything,
or pick sections.

Commands are shown for a terminal at the repository root and work in both
PowerShell and bash. `ied` below means `node packages/cli/bin/ied.js`. To type
plain `ied` instead, run `npm link -w packages/cli` once.

The [`demo/`](demo) folder holds files written to trigger the findings shown here:

| Folder | Shows |
| --- | --- |
| `demo/web/checkout.js` | JavaScript logic and security bugs, plus the quick fixes |
| `demo/web/cart.ts`, `invoice.ts`, `api.ts` | Whole-project checks: an import cycle, a broken import, a function duplicated across files, an unchecked optional parameter |
| `demo/python/` | Python bugs, plus a `shop/` package whose modules import each other in a cycle |
| `demo/flutter/profile_page.dart` | Dart/Flutter: leaked controllers, unawaited Futures, disabled TLS validation |
| `demo/polyglot/` | Go, Java, Kotlin, Swift, Rust, C/C++, PHP, C#, Ruby |

---

## 0. Install, build and test (do this before the demo)

Requires Node.js 18+ (20 recommended) and, for section 4, VS Code 1.85+.

```sh
npm ci
npm run build
npm test
```

**Check:** every package prints `… passed, 0 failed`: core 368, CLI 8 + 3 + 12,
dashboard 11 + 8, LSP 1, extension 7. That is 418 tests in total.

## 1. The headline: bugs a linter misses

```sh
ied scan demo/web/checkout.js
```

Walk through these findings in `checkout.js`:

- **IED-L022 null-deref**, line 12: `users.find(...)` can return `undefined`,
  and `user.email` dereferences it before any check.
- **IED-L021 missing-await**, line 14: `saveOrder()` is `async` but is called
  without `await`.
- **IED-H003 inconsistent-usage**, line 32: `data.total` uses it as an object
  and `data.map(...)` uses it as an array. One of the two is wrong.
- **IED-L023 inconsistent-return**, line 22: `parsePrice` returns a number on
  one path and nothing on another.
- **IED-S001 / S002 / S004**: a hardcoded AWS key, `eval`, and `exec` with
  interpolated input.

**Check:** 13 findings in this file; the summary line reads `✖ 3 errors, 6 warnings, 4 info across 1 files`.
The command exits with code 1 because there are errors, which is what makes CI fail.

## 2. One engine, every language

```sh
ied scan demo
ied rules
```

**Check:** `scan` reports `✖ 24 errors, 68 warnings, 24 info across 35 files`, which is 116 findings from 68 different rules.
Show a few files outside JavaScript:

- **Python** (`python/report.py`): an f-string SQL injection, `pickle.load`, a
  mutable default argument, a bare `except:`.
- **Dart** (`flutter/profile_page.dart`): `badCertificateCallback` returning
  `true` (an error), `TextEditingController` and `StreamSubscription` never
  disposed, `saveProfile()` and `Future.delayed` not awaited, the `!` null
  assertion, an empty `catch`.
- **Go, Java, Kotlin, Swift, Rust, C/C++, PHP, C#, Ruby** (`polyglot/`): unchecked
  errors, SQL injection, buffer overflows, force-unwraps, `async void`, and more.

`ied rules` lists all 101 rules (97 per-file rules plus 4 whole-program checks).
The same catalogue, with languages, is in [docs/RULES.md](docs/RULES.md).

## 3. Whole-project analysis

```sh
ied project demo
```

**Check:** you should see `✖ 1 errors, 4 warnings, 5 info`:

| Finding | Where |
| --- | --- |
| IED-X001 import cycle | `cart.ts → invoice.ts → cart.ts`, and Python `shop/models.py → shop/services.py → shop/models.py` |
| IED-X002 broken import (error) | `cart.ts` imports `fetchCoupons`, which `./api` does not export |
| IED-X003 duplicate across files | `lineTotal` in `cart.ts` and `sumLines` in `invoice.ts` are the same code under different names |
| IED-X004 unused export | `checkoutCart`, `sumLines`, `settings` |

Each check also runs on its own: `ied cycles demo`, `ied broken-imports demo`,
`ied duplicates demo` and `ied unused-exports demo`. As a real-world example,
`ied duplicates packages` finds helper functions copied between this repo's own
rule packs.

## 4. VS Code extension

Install the extension, either way:

- **Packaged:** run `npm run package:vscode`. In VS Code open Extensions (Ctrl+Shift+X),
  then `…` → *Install from VSIX…* → `packages/vscode/invisible-errors-detector-0.1.0.vsix`.
  Or run `code --install-extension packages/vscode/invisible-errors-detector-0.1.0.vsix`.
- **From source:** open this repository in VS Code and press **F5** (*Run Extension*).

Then open the `demo` folder (File → Open Folder) and show:

1. **Live diagnostics**: open `web/checkout.js`. Squiggles appear, and they update as you type.
2. **Hover** over `user.email` (line 12): you see the rule name, the message and an explanation with a fix.
3. **Quick fixes** (Ctrl+. on a squiggle):
   - on `saveOrder(cart);` → **Add await (IED-L021)** changes it to `await saveOrder(cart);`
   - on `console.log(...)` → **Remove console.log(…) call (IED-Q001)**
   - on `legacyFlag` → **Prefix "legacyFlag" with _** (IED-Q006)
   - any finding → **Suppress … on this line** inserts
     `// ied-disable-next-line <id> — explain why this is safe here` (`#` in Python and Ruby)
4. **Any language, no extra extension**: open `flutter/profile_page.dart` or `polyglot/kotlin/Repo.kt`.
   They are analyzed even with no Dart or Kotlin extension installed.
5. **Command Palette → "Invisible Errors: Analyze Workspace"**: a progress bar
   appears, the Problems panel fills up, and the dashboard opens with a quality
   score, severity counts and the worst files. The **Invisible Errors** view in
   the Explorer lists issues by file, and the status bar shows the counts.
6. **"Invisible Errors: Check Project"**: a notification reports
   *2 import cycle(s), 1 broken import(s), 1 duplicate group(s), 3 unused export(s)*,
   and the IED-X findings appear in the Problems panel.
7. **"Invisible Errors: Export Report (JSON/HTML/SARIF)"**: save the HTML report and open it in a browser.
8. **Settings**: add `"invisibleErrors.rules": { "IED-Q003": "off" }` to turn off
   magic numbers, or `"IED-L022": "error"` to raise a severity.

## 5. Reports, baselines and CI

```sh
ied scan demo --format html -o ied-report.html
ied scan demo --format sarif -o ied-results.sarif
ied scan demo --format junit -o ied-results.xml
ied baseline demo
ied scan demo --baseline
ied ci-comment demo/web --dry-run
```

**Check:** the HTML report opens in a browser, and the SARIF file contains
`"version": "2.1.0"` with 116 results. After `ied baseline`, the second scan
prints `116 findings hidden by baseline`. That is how existing code is accepted
so CI only reports new problems. `ci-comment --dry-run` prints the Markdown
comment a pull request would get. Show [.github/workflows/ied.yml](.github/workflows/ied.yml)
(SARIF upload plus PR comment) and [.gitlab-ci.yml](.gitlab-ci.yml) (JUnit).

Delete the generated files and `.ied-baseline.json` afterwards.

## 6. Predictive hotspots

```sh
ied hotspots packages/core/src --limit 5
```

**Check:** a ranked table of `RISK`, `CHURN`, `FINDINGS` and `FILE`. It combines
git history (how often a file changes) with finding density, to point at the
files most likely to have the next bug. It needs a git checkout.

## 7. Team dashboard

```sh
npm run build:next -w packages/dashboard
npm run start -w packages/dashboard -- -p 3000
```

Leave that running. In a second terminal:

```sh
ied scan demo --report-to http://localhost:3000/api/ingest
ied hotspots . --report-to http://localhost:3000/api/ingest-hotspots
```

Open <http://localhost:3000>.

**Check:** the scan prints `Reported 116 findings to …`. The Repos page shows the
repository with a score, and from there you can open findings per file. Also
show the Trends, Risk Map, Rules, Teams, Policies and Settings pages. The data
lives in `packages/dashboard/ied-dashboard.db`; delete that file to reset.

## 8. Configuration, policy and suppressions

```sh
ied init
```

This writes `.iedrc.json`. In it you can change a rule's severity, turn a rule
off, pass rule options, set excludes, and load plugins. A suppression needs a
reason, otherwise it is flagged itself:

```js
// ied-disable-next-line IED-Q001 — logged on purpose for the audit trail   ← accepted
// ied-disable-next-line IED-Q001                                           ← IED-Q013 flags this
```

## 9. Writing your own rules (plugins)

```sh
node packages/create-ied-plugin/index.js my-rules
```

This scaffolds a package whose `index.js` exports a working sample rule
(`ACME-001`). Add `"plugins": ["./my-rules/index.js"]` to `.iedrc.json`, run
`ied rules`, and `ACME-001` is listed next to the built-in rules. `ied scan` then
reports it on any `x.getUser(…)` call.

## 10. Other editors (LSP)

```sh
node packages/lsp/bin/ied-lsp.js --stdio
```

The same engine speaks the Language Server Protocol, for Neovim, JetBrains,
Sublime and others. In VS Code, `"invisibleErrors.useLsp": true` switches the
extension to the server. **Check:** `npm test -w packages/lsp` starts the server,
opens a document and receives diagnostics.

## 11. AI explanations (optional — needs an Anthropic API key)

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."        # bash: export ANTHROPIC_API_KEY=sk-ant-...
ied ai explain demo/web/checkout.js --max 3
ied ai generate-rule --from-description "flag setTimeout calls with a delay of 0" --language javascript
```

`explain` says in plain language what each finding means, why it matters, and how
to fix it. `generate-rule` drafts a new rule. Both use Claude Opus 5.5 by default
(`--model` to change it), and if that model declines a request the API retries
on Claude Opus 4.8. Without a key the commands print setup instructions, and
nothing else in the tool needs a key or network.

## 12. Performance

```sh
npm run bench
```

**Check:** `PASS (typical … < 800ms; 50k lines … < 2000ms spec target)`. On the
development machine this measured about 60 ms for 2,000 lines and about 1.5 s
(P95) for 50,000 lines. The speed comes from collecting every node type all the
rules need in a single traversal of each file, instead of one traversal per rule.

---

## Verification checklist

| Feature | Command | Expected |
| --- | --- | --- |
| Build and tests | `npm run build` and `npm test` | 418 tests pass, 0 fail |
| Bugs linters miss | `ied scan demo/web/checkout.js` | 13 findings, including IED-L022, L021, H003, L023 |
| All languages | `ied scan demo` | 116 findings (24 errors, 68 warnings, 24 info), 68 rules, 35 files |
| Rule catalogue | `ied rules` | `101 rules` |
| Whole-project checks | `ied project demo` | 2 cycles, 1 broken import, 1 duplicate group, 3 unused exports |
| Quick fixes | VS Code, Ctrl+. | Add await, Remove console.log, Prefix with _, Suppress |
| Editor coverage | open a `.dart` or `.kt` file | findings with no language extension installed |
| Reports | `--format html / sarif / junit` | files written, SARIF 2.1.0 |
| Baseline | `ied baseline demo`, then `ied scan demo --baseline` | `116 findings hidden by baseline` |
| Hotspots | `ied hotspots packages/core/src --limit 5` | ranked risk table |
| Dashboard | `--report-to http://localhost:3000/api/ingest` | `Reported 116 findings`, repository listed |
| LSP | `npm test -w packages/lsp` | `1 passed` |
| Packaged extension | `npm run package:vscode` | `invisible-errors-detector-0.1.0.vsix` (~2.8 MB) |
| Speed | `npm run bench` | PASS, 50k lines under 2 s |
