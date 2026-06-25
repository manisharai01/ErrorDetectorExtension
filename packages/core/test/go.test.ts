/**
 * Tests for the Go rule pack. Each rule gets at least a true-positive, a
 * true-negative, and an edge case, per the SDK testing guidance.
 */

import * as assert from 'assert';
import { test, runRule, Severity } from './harness';
import {
  uncheckedErrorRule,
  goroutineLeakRule,
  nilDerefRule,
  deferInLoopRule,
  sqlInjectionRule,
  appendPreallocRule,
  fmtPrintlnRule
} from '../src/rules/go';

// ── IED-T005 unchecked-error ─────────────────────────────────────────────────

test('IED-T005 flags error discarded with blank identifier', async () => {
  const code = `package m
import "os"
func f() { x, _ := os.Open("a"); _ = x }`;
  const found = await runRule(uncheckedErrorRule, 'go', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-T005');
  assert.equal(found[0].severity, Severity.Warning);
});

test('IED-T005 flags a dropped error return from a known call', async () => {
  const code = `package m
import "os"
func f() { os.Remove("a") }`;
  const found = await runRule(uncheckedErrorRule, 'go', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].data?.kind, 'dropped-return');
});

test('IED-T005 ignores properly handled errors', async () => {
  const code = `package m
import "os"
func f() error {
  x, err := os.Open("a")
  if err != nil { return err }
  _ = x
  return nil
}`;
  const found = await runRule(uncheckedErrorRule, 'go', code);
  assert.equal(found.length, 0);
});

test('IED-T005 does not flag blank assign when right side is not a call', async () => {
  const code = `package m
func f() { x, _ := 1, 2; _ = x }`;
  const found = await runRule(uncheckedErrorRule, 'go', code);
  assert.equal(found.length, 0);
});

// ── IED-C008 goroutine-leak ──────────────────────────────────────────────────

test('IED-C008 flags an unbounded channel-receive goroutine', async () => {
  const code = `package m
func f(ch chan int) {
  go func() {
    for {
      <-ch
    }
  }()
}`;
  const found = await runRule(goroutineLeakRule, 'go', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-C008');
});

test('IED-C008 ignores a goroutine with a select/done exit', async () => {
  const code = `package m
import "context"
func f(ctx context.Context, ch chan int) {
  go func() {
    for {
      select {
      case <-ch:
      case <-ctx.Done():
        return
      }
    }
  }()
}`;
  const found = await runRule(goroutineLeakRule, 'go', code);
  assert.equal(found.length, 0);
});

test('IED-C008 ignores a bounded for loop', async () => {
  const code = `package m
func f(ch chan int) {
  go func() {
    for i := 0; i < 10; i++ {
      <-ch
    }
  }()
}`;
  const found = await runRule(goroutineLeakRule, 'go', code);
  assert.equal(found.length, 0);
});

// ── IED-L014 nil-deref ───────────────────────────────────────────────────────

test('IED-L014 flags dereference before nil check', async () => {
  const code = `package m
type U struct { Name string }
func f(u *U) string {
  name := u.Name
  if u != nil { return name }
  return ""
}`;
  const found = await runRule(nilDerefRule, 'go', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-L014');
  assert.equal(found[0].data?.variable, 'u');
});

test('IED-L014 ignores nil check before use', async () => {
  const code = `package m
type U struct { Name string }
func f(u *U) string {
  if u != nil { return u.Name }
  return ""
}`;
  const found = await runRule(nilDerefRule, 'go', code);
  assert.equal(found.length, 0);
});

test('IED-L014 ignores when no nil check exists', async () => {
  const code = `package m
type U struct { Name string }
func f(u *U) string { return u.Name }`;
  const found = await runRule(nilDerefRule, 'go', code);
  assert.equal(found.length, 0);
});

// ── IED-R006 defer-in-loop ───────────────────────────────────────────────────

test('IED-R006 flags defer inside a range loop', async () => {
  const code = `package m
import "os"
func f(paths []string) {
  for _, p := range paths {
    file, _ := os.Open(p)
    defer file.Close()
    _ = file
  }
}`;
  const found = await runRule(deferInLoopRule, 'go', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-R006');
});

test('IED-R006 ignores defer at function scope', async () => {
  const code = `package m
import "os"
func f(p string) error {
  file, err := os.Open(p)
  if err != nil { return err }
  defer file.Close()
  return nil
}`;
  const found = await runRule(deferInLoopRule, 'go', code);
  assert.equal(found.length, 0);
});

test('IED-R006 flags defer in a classic for loop too', async () => {
  const code = `package m
func f() {
  for i := 0; i < 3; i++ {
    defer g()
  }
}
func g() {}`;
  const found = await runRule(deferInLoopRule, 'go', code);
  assert.equal(found.length, 1);
});

// ── IED-S014 sql-injection ───────────────────────────────────────────────────

test('IED-S014 flags concatenated SQL in Query', async () => {
  const code = `package m
import "database/sql"
func f(db *sql.DB, id string) { db.Query("SELECT * FROM t WHERE id = " + id) }`;
  const found = await runRule(sqlInjectionRule, 'go', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-S014');
  assert.equal(found[0].severity, Severity.Error);
});

test('IED-S014 ignores parameterized queries', async () => {
  const code = `package m
import "database/sql"
func f(db *sql.DB, id string) { db.Query("SELECT * FROM t WHERE id = ?", id) }`;
  const found = await runRule(sqlInjectionRule, 'go', code);
  assert.equal(found.length, 0);
});

test('IED-S014 ignores concatenation of only literals', async () => {
  const code = `package m
import "database/sql"
func f(db *sql.DB) { db.Query("SELECT * " + "FROM t") }`;
  const found = await runRule(sqlInjectionRule, 'go', code);
  assert.equal(found.length, 0);
});

test('IED-S014 flags Exec and QueryRow as well', async () => {
  const code = `package m
import "database/sql"
func f(db *sql.DB, id string) {
  db.Exec("DELETE FROM t WHERE id = " + id)
  db.QueryRow("SELECT 1 WHERE id = " + id)
}`;
  const found = await runRule(sqlInjectionRule, 'go', code);
  assert.equal(found.length, 2);
});

// ── IED-P008 append-prealloc ─────────────────────────────────────────────────

test('IED-P008 flags append-to-self inside a loop', async () => {
  const code = `package m
func f(src []int) []int {
  var out []int
  for _, v := range src {
    out = append(out, v)
  }
  return out
}`;
  const found = await runRule(appendPreallocRule, 'go', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-P008');
  assert.equal(found[0].data?.slice, 'out');
});

test('IED-P008 ignores append outside a loop', async () => {
  const code = `package m
func f(out []int, v int) []int {
  out = append(out, v)
  return out
}`;
  const found = await runRule(appendPreallocRule, 'go', code);
  assert.equal(found.length, 0);
});

test('IED-P008 ignores indexed assignment in a loop', async () => {
  const code = `package m
func f(src []int) []int {
  out := make([]int, len(src))
  for i, v := range src {
    out[i] = v
  }
  return out
}`;
  const found = await runRule(appendPreallocRule, 'go', code);
  assert.equal(found.length, 0);
});

// ── IED-Q008 fmt-println ─────────────────────────────────────────────────────

test('IED-Q008 flags fmt.Println', async () => {
  const code = `package m
import "fmt"
func f() { fmt.Println("hi") }`;
  const found = await runRule(fmtPrintlnRule, 'go', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-Q008');
});

test('IED-Q008 flags Printf and Print too', async () => {
  const code = `package m
import "fmt"
func f() { fmt.Printf("%d", 1); fmt.Print("x") }`;
  const found = await runRule(fmtPrintlnRule, 'go', code);
  assert.equal(found.length, 2);
});

test('IED-Q008 is relaxed inside test files', async () => {
  const code = `package m
import "fmt"
func f() { fmt.Println("hi") }`;
  const found = await runRule(fmtPrintlnRule, 'go', code, { isTestFile: true });
  assert.equal(found.length, 0);
});

test('IED-Q008 ignores non-fmt calls', async () => {
  const code = `package m
import "log/slog"
func f() { slog.Info("hi") }`;
  const found = await runRule(fmtPrintlnRule, 'go', code);
  assert.equal(found.length, 0);
});
