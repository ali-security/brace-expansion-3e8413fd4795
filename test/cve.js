var test = require('tape');
var expand = require('..');

// `performance` is only a global from Node 16 on; this package is still tested
// on Node 10/12/14, where it has to come from the perf_hooks builtin (Node 8.5+).
var performance = (typeof globalThis !== 'undefined' && globalThis.performance)
  || require('perf_hooks').performance;

// CVE-2026-14257: `max` caps the number of results but not their length, so
// chaining many brace groups keeps the count under `max` while each result
// grows with the number of groups. Building 100k long results (and the
// intermediate arrays combined along the way) exhausted memory and crashed
// the process with an uncatchable out-of-memory error.
test('total expansion length is bounded', function(t) {
  var str = '{a,b}'.repeat(1500)
  var startTime = performance.now()
  var expanded = expand(str)
  var endTime = performance.now()

  var totalLength = expanded.reduce(function (sum, s) { return sum + s.length; }, 0)
  t.ok(
    totalLength <= 4000000,
    'Expected total length (' + totalLength + ') to be bounded'
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  t.ok(
    expanded.every(function (s) { return /^[ab]+$/.test(s); }),
    'results are valid expansions'
  )
  // Guards against an algorithmic regression in the accumulator, not against the
  // CVE itself - unpatched, this input dies of an out-of-memory error long before
  // any deadline is reached. The bound is looser than upstream's 5000ms because
  // the legacy Node 10 leg measures ~2.3s where Node 23 measures ~0.8s, and these
  // legs share a runner; a real regression costs orders of magnitude, not a
  // factor of two.
  t.ok(
    endTime - startTime < 10000,
    'Expected time (' + (endTime - startTime) + 'ms) to be less than 10000ms'
  )

  // The bound is a single accumulator, not a per-level limit, so it holds no
  // matter how many brace groups are chained - not `groups * maxLength`.
  var counts = [100, 1500, 5000];
  for (var i = 0; i < counts.length; i++) {
    var groups = counts[i];
    var total = expand('{a,b}'.repeat(groups)).reduce(
      function (sum, s) { return sum + s.length; },
      0
    )
    t.ok(
      total <= 4000000,
      'Expected total length (' + total + ') to stay bounded at ' + groups + ' groups'
    )
  }

  t.end();
})

// Expanding the tail iteratively (rather than recursing once per brace group)
// keeps native stack depth constant, so deeply chained input that used to throw
// `RangeError: Maximum call stack size exceeded` around ~2,700 groups now
// returns a bounded result.
test('deep chaining does not overflow the stack', function(t) {
  var str = '{a,b}'.repeat(50000)
  t.doesNotThrow(function () {
    var expanded = expand(str)
    t.ok(expanded.length > 0, 'still returns a (truncated) result')
    t.ok(
      expanded.reduce(function (sum, s) { return sum + s.length; }, 0) <= 4000000,
      'output stays bounded'
    )
  })

  t.end();
})

// A long run of non-expanding groups drove one level of native recursion per
// group before the fix, so this 3000-group input threw
// `RangeError: Maximum call stack size exceeded`. The tail is now consumed by
// the in-function loop, so recursion depth stays at 1 no matter how many groups
// are chained - unlike a timing assertion, this cannot flake.
test('long run of non-expanding groups keeps stack depth constant', function(t) {
  var str = 'a' + '{},'.repeat(3000)
  t.doesNotThrow(function () {
    t.deepEqual(expand(str), [str], 'does not expand and does not throw RangeError')
  })

  t.end();
})

test('maxLength option bounds output size', function (t) {
  var str = '{a,b}'.repeat(1500)
  var expanded = expand(str, { maxLength: 100000 })
  var totalLength = expanded.reduce(function (sum, s) { return sum + s.length; }, 0)
  t.ok(
    totalLength <= 100000,
    'Expected total length (' + totalLength + ') to respect maxLength'
  )

  // The `${...}` literal branch combines its body with the expanded tail and
  // must be bounded the same way.
  var dollar = '${x}' + '{a,b}'.repeat(20)
  var expandedDollar = expand(dollar, { maxLength: 100000 })
  var dollarLength = expandedDollar.reduce(function (sum, s) { return sum + s.length; }, 0)
  t.ok(
    dollarLength <= 100000,
    'Expected total length (' + dollarLength + ') to respect maxLength'
  )

  t.end();
})
