// Demo: bugs a linter usually misses (JavaScript). Each comment names the
// rule that fires on the line below it.

const STRIPE_KEY = 'AKIAIOSFODNN7EXAMPLE'; // IED-S001 hardcoded secret (AWS example key)

async function saveOrder(order) {
  await db.orders.insert(order);
}

async function checkout(cart, users, userId) {
  const user = users.find((u) => u.id === userId);
  const email = user.email; // IED-L022 null-deref: find() may return undefined

  saveOrder(cart); // IED-L021 missing-await (quick fix: "Add await")
  fetch('/api/analytics'); // IED-L002 promise neither awaited nor caught

  console.log('checkout for', email); // IED-Q001 (quick fix: remove the call)
  return { total: cart.total * 1.18 }; // IED-Q003 magic number
}

function parsePrice(text) {
  if (!text) return; // IED-L023 returns nothing here, a number below
  return Number(text);
}

function applyCoupon(cart, code, legacyFlag) { // IED-Q006 legacyFlag unused (quick fix: prefix _)
  cart.discount = code === 'WELCOME' ? 10 : 0; // IED-L004 mutates the caller's object
  return cart;
}

function render(data) {
  const total = data.total; // IED-H003 used as an object here...
  return data.map((row) => row.name).join(', ') + total; // ...and as an array here
}

function runReport(userInput) {
  eval(userInput); // IED-S002
  require('child_process').exec(`report --name ${userInput}`); // IED-S004 command injection
}

module.exports = { checkout, parsePrice, applyCoupon, render, runReport };
