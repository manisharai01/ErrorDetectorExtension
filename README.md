# Invisible Errors Detector

Static analysis that finds the bugs traditional linters miss — null
dereferences, missing `await`s, swallowed errors, injection, leaked resources,
import cycles — across **JavaScript/TypeScript (incl. JSX/TSX/Vue), Python, Go,
Rust, Java, Kotlin, Swift, C/C++, PHP, C#, Ruby and Dart/Flutter**.

- **97 per-file rules + 4 whole-program checks** — full catalogue in [docs/RULES.md](docs/RULES.md).
- **One engine, five front ends**: VS Code extension, CLI (`ied`), LSP server for
  other editors, team dashboard, and a plugin SDK for your own rules.
- **Fast**: a 50,000-line file is analyzed in ~1–1.5 s; a typical 2,000-line
  file in ~60 ms (`npm run bench`).
- **Local and offline**: no account, no network — except the opt-in `ied ai`
  commands, which call Claude with your own API key.

To present it, follow [DEMO.md](DEMO.md): a feature-by-feature walkthrough with
the commands to run and what you should see.

## Quick start

Requires Node.js 18+ (20 recommended).

```sh
npm ci            # install
npm run build     # compile every package
npm test          # 418 tests across core, CLI, LSP, dashboard and extension

node packages/cli/bin/ied.js scan demo          # per-file findings
node packages/cli/bin/ied.js project demo       # cycles, broken imports, duplicates, unused exports
```

VS Code: `npm run package:vscode`, then install
`packages/vscode/invisible-errors-detector-0.1.0.vsix` (Extensions view → `…` →
*Install from VSIX…*), or press **F5** in this repo to run it in a development host.

## What it finds

| Area | Examples |
| --- | --- |
| Logic | null/undefined dereference after `find()`/`querySelector()`, missing `await`, swallowed promises, constant conditions, unreachable code, off-by-one loops, inconsistent return shapes, infinite loops, recursion without a base case |
| Security | hardcoded secrets, SQL / command / f-string injection, `eval`, unsafe deserialization (pickle, `unserialize`, `Marshal.load`), disabled TLS validation (Dart), buffer overflows and format strings (C/C++), taint from request data to sinks |
| Concurrency & resources | races across `await`s, goroutine/coroutine leaks, blocking calls in `async def`, `async void`, files and Flutter controllers never closed/disposed, use-after-free |
| Type safety | force-unwraps (`!`, `!!`), `any`, unsafe casts, discarded Go errors |
| Quality | debug prints, duplicated code (per file and across files), deep nesting, cognitive complexity, magic numbers, TODOs without a ticket, suppressions without a reason |
| Frameworks | React hook dependencies, missing `key`, state mutation, setState after unmount; Vue ref misuse |
| Whole program | import cycles (JS/TS/Python), imports of missing files or names, functions copied across files, unused exports |

## Packages

| Package | What it is |
| --- | --- |
| [`packages/core`](packages/core) | `@ied/core` — the engine: Tree-sitter parsing (vendored WASM grammars), a single-pass node index shared by all rules, the rules, config/policy, baselines, caching, reporters (JSON, SARIF, HTML, JUnit), cross-file analysis, hotspot scoring, plugin loader. |
| [`packages/cli`](packages/cli) | `ied` — `scan`, `project`, `cycles`, `broken-imports`, `duplicates`, `unused-exports`, `baseline`, `hotspots`, `ci-comment`, `rules`, `init`, `ai explain`, `ai generate-rule`. |
| [`packages/vscode`](packages/vscode) | The VS Code extension: live diagnostics while typing, hovers, quick fixes, project check, dashboard view, report export. |
| [`packages/lsp`](packages/lsp) | `ied-lsp` — the engine as a Language Server (`--stdio` / `--socket=PORT`) for Neovim, JetBrains, Sublime, etc. |
| [`packages/dashboard`](packages/dashboard) | Next.js + SQLite dashboard: repos, trends, findings per file, team view, risk map; Jira/Slack integrations. |
| [`packages/create-ied-plugin`](packages/create-ied-plugin) | Scaffolds a rule plugin package (`.iedrc.json` → `"plugins"`). |

## Configuration

`ied init` writes a starter `.iedrc.json`:

```jsonc
{
  "rules": {
    "IED-Q001": "off",                                           // disable
    "IED-L022": "error",                                         // change severity
    "IED-Q004": { "severity": "warn", "options": { "threshold": 5 } }
  },
  "exclude": ["node_modules", "dist", "build"],
  "baseline": ".ied-baseline.json",
  "plugins": ["./rules/acme-rules.js"]
}
```

Suppress one finding with a reason (a bare suppression is itself flagged):

```js
// ied-disable-next-line IED-S001 — test fixture, not a real key
```

`#` works the same way in Python and Ruby.

## CI

[.github/workflows/ied.yml](.github/workflows/ied.yml) uploads SARIF to GitHub
code scanning and comments new findings on pull requests;
[.gitlab-ci.yml](.gitlab-ci.yml) publishes a JUnit report. Use
`ied baseline` once to accept existing findings so CI only reports new ones.

## Development

```sh
npm run build          # all packages (tsc -b)
npm test               # all tests
npm run bench          # performance check (2k-line SLA, 50k-line spec target)
npm run docs:rules     # regenerate docs/RULES.md from the registry
npm run package:vscode # bundle + package the extension (.vsix)
npm run vendor:grammars -w packages/core   # refresh the Tree-sitter grammars
```

Adding a language touches: `rules/types.ts` (`Language`), `engine/parser.ts`,
`engine/analyzer.ts` (extension table), `engine/grammar-profile.ts`,
`scripts/vendor-grammars.js`, the language's rule pack + `rules/index.ts`, and
`packages/vscode/src/languages.ts` — the extension's tests fail if a language is
missing there.
