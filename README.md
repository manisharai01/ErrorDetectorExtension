# Invisible Errors Detector

A professional VS Code extension that finds bugs traditional linters miss — logic errors,
security issues, code smells, and framework-specific footguns across **JS/TS/JSX/TSX/Vue**.

## Features

* **27+ detection rules** across 6 categories: logic, code-smells, security,
  performance, framework-specific (React, Vue) and TypeScript.
* **Real-time analysis** with debounced lint-on-type plus full lint-on-save and
  workspace-wide scans.
* **Worker-thread parallelism** — heavy AST work runs off the extension host;
  falls back to inline execution if workers can't be spawned.
* **Incremental + cached** — files are hashed and re-used between runs.
* **Cross-file context** — call graph, unused exports, circular dependency
  detection.
* **Inline suppressions** — `// invisible-ignore-next-line rule-id` and
  block disable/enable comments.
* **Code actions** — auto-remove `console.log`, prefix unused params with `_`,
  insert `await`, suppress findings.
* **Reports** — export to **JSON / HTML / SARIF** for CI and GitHub Advanced
  Security upload.
* **Dashboard webview** — quality score, severity counts, top problem files.
* **Tree view + status bar** with live issue counts.

## Detection rules

| Category    | Rule id                              |
| ----------- | ------------------------------------ |
| logic       | `logic/array-index`                  |
| logic       | `logic/object-mutation`              |
| logic       | `logic/promise-swallowing`           |
| logic       | `logic/race-condition`               |
| logic       | `logic/type-guard-contradiction`     |
| logic       | `logic/infinite-loop`                |
| logic       | `logic/recursion-base-case`          |
| code-smell  | `smell/unused-parameters`            |
| code-smell  | `smell/console-log`                  |
| code-smell  | `smell/commented-code`               |
| code-smell  | `smell/todo-no-issue`                |
| code-smell  | `smell/magic-numbers`                |
| code-smell  | `smell/deep-nesting`                 |
| code-smell  | `smell/duplicate-code`               |
| security    | `security/hardcoded-secrets`         |
| security    | `security/eval-usage`                |
| security    | `security/inner-html`                |
| security    | `security/command-injection`         |
| framework   | `react/hook-deps`                    |
| framework   | `react/missing-key`                  |
| framework   | `react/state-mutation`               |
| framework   | `react/state-after-unmount`          |
| framework   | `vue/ref-misuse`                     |
| typescript  | `ts/unsafe-as`                       |
| typescript  | `ts/any-type`                        |
| typescript  | `ts/non-null-assertion`              |
| performance | `perf/nested-loop`                   |

## Configuration

```jsonc
{
  "invisibleErrors.enable": true,
  "invisibleErrors.runOnSave": true,
  "invisibleErrors.runOnType": true,
  "invisibleErrors.debounceMs": 400,
  "invisibleErrors.maxFileSize": 1000000,
  "invisibleErrors.rules": {
    "smell/console-log": "error",
    "logic/promise-swallowing": "warning",
    "ts/any-type": "off"
  },
  "invisibleErrors.exclude": ["**/test/**", "**/dist/**"],
  "invisibleErrors.performance": {
    "parallelAnalysis": true,
    "maxWorkers": 4,
    "cacheSize": 200
  }
}
```

## Commands

| Command id                              | Title                                     |
| --------------------------------------- | ----------------------------------------- |
| `invisibleErrors.analyzeFile`           | Analyze current file                      |
| `invisibleErrors.analyzeWorkspace`      | Analyze whole workspace (cancellable)     |
| `invisibleErrors.cancelAnalysis`        | Cancel running workspace analysis         |
| `invisibleErrors.clearCache`            | Clear analysis cache & metrics            |
| `invisibleErrors.showDashboard`         | Open the quality dashboard webview        |
| `invisibleErrors.exportReport`          | Export JSON / HTML / SARIF report         |

## Build & test

```sh
npm install
npm run compile
node out/test/integration/smoke.test.js
node out/test/unit/rules.test.js
node out/test/benchmarks/perf.bench.js
```

## Architecture

```
src/
├── extension.ts                  VS Code activation, wiring, commands
├── core/                         pool, cache, config, metrics
├── parser/                       TS / JS / Vue parsing
├── rules-engine/                 engine, registry, context-builder, types
├── rules/                        all 27+ rules grouped by category
├── providers/                    diagnostics, code actions, hover
├── views/                        tree, status bar, dashboard webview
├── workers/                      analysis-worker + inline-runner
├── reporters/                    JSON / HTML / SARIF
└── utils/                        suppressions, .gitignore matcher
```
