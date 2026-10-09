var test = require('tape');
var expand = require('..');

// `performance` is only a global from Node 16 on; this package is still tested
// on Node 10/12/14, where it has to come from the perf_hooks builtin (Node 8.5+).
var performance = (typeof globalThis !== 'undefined' && globalThis.performance)
  || require('perf_hooks').performance;

function groups(n) {
  return 'a' + new Array(n).join('{},') + '{}';
}

// https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-3jxr-9vmj-r5cp
test('unbound recursion', function(t) {
  // A run of non-expanding `{}` groups used to expand `post` once per group,
  // doubling the work on every group. This 30-group, 90 byte input blocked
  // for minutes.
  var str = 'a{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}';
  var startTime = performance.now();
  var expanded = expand(str);
  var endTime = performance.now();
  var timeTaken = endTime - startTime;
  t.deepEqual(expanded, [str], 'does not expand');
  t.ok(timeTaken < 1000, 'Expected time (' + timeTaken + 'ms) to be less than 1000ms');
  t.end();
});

// The same `{}` run also drove one level of recursion per group: `post` was
// expanded recursively before the early returns, and the `{a},b}` rewrite
// tail-recursed through `expand(str, max, true)`. Both are now handled by the
// in-function loop, so a long run costs no stack at all. Before the fix this
// input either exhausted the call stack or blocked indefinitely.
test('long run of non-expanding groups exhausts neither stack nor CPU', function(t) {
  var str = groups(3000);
  var startTime = performance.now();
  var expanded = expand(str);
  var timeTaken = performance.now() - startTime;
  t.deepEqual(expanded, [str], 'does not expand and does not throw RangeError');
  t.ok(timeTaken < 5000, 'Expected time (' + timeTaken + 'ms) to be less than 5000ms');
  t.end();
});
