# Invisible Errors Detector

Finds the bugs traditional linters miss — logic errors, security holes, resource
leaks and concurrency bugs — while you type, in **JavaScript / TypeScript / JSX /
TSX / Vue, Python, Go, Rust, Java, Kotlin, Swift, C / C++, PHP, C#, Ruby and Dart**.

97 per-file rules plus 4 whole-project checks, all running locally (no network,
no account). Files are recognised by extension, so Kotlin or Dart files are
analyzed even without a language extension installed.

## What it catches (examples)

| Finding | Example |
| --- | --- |
| Null/undefined dereference | `const u = users.find(…); return u.name;` |
| Missing `await` | `save(user);` inside an `async` function |
| Swallowed promise / exception | `fetch(url);` with no `.catch`, `catch (e) {}` |
| Hardcoded secrets | AWS / Stripe / GitHub / OpenAI keys, private keys, JWTs |
| Injection | SQL built from strings, `eval`, `exec` with interpolated input |
| Flutter resource leaks | a `TextEditingController` never disposed |
| Insecure TLS | `badCertificateCallback = (…) => true` |
| Import cycles & broken imports | across the whole workspace |

## Commands

- **Invisible Errors: Analyze Workspace** — scan every supported file, then open the dashboard.
- **Invisible Errors: Check Project** — import cycles, broken imports, functions duplicated across files, unused exports.
- **Invisible Errors: Analyze Current File**, **Show Dashboard**, **Export Report (JSON/HTML/SARIF)**, **Clear Cache**.

Hover a finding for the rule's explanation. Quick fixes (lightbulb) include
*Add await*, *Remove console.log*, *Prefix unused parameter with _*, and
*Suppress on this line* (writes `// ied-disable-next-line <rule> — reason`).

## Settings

```jsonc
{
  "invisibleErrors.enable": true,
  "invisibleErrors.runOnType": true,          // debounced analysis while typing
  "invisibleErrors.runOnSave": true,
  "invisibleErrors.rules": { "IED-Q001": "off", "IED-L022": "error" },
  "invisibleErrors.exclude": ["**/node_modules/**", "**/dist/**"],
  "invisibleErrors.useLsp": false             // run the same engine as a language server
}
```

The same engine is available as a CLI (`ied scan`, `ied project`) for CI.
