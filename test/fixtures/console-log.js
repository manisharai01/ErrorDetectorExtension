// Fixture used by tests for the smell/console-log rule.
function greet(name) {
  console.log('hello', name);     // <- should be flagged
  console.warn('this is fine');   // <- allowed
  return name;
}
greet('world');
