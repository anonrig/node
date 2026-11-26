'use strict';

// URLPatternList emits an ExperimentalWarning once, when it is first
// constructed. Loading node:util, reading the export, or importing the ESM
// facade, which reads every export, does not emit it.

const common = require('../common');
const assert = require('assert');
const { URLPattern } = require('url');

let constructed = false;
process.on('warning', common.mustCall((warning) => {
  assert.strictEqual(constructed, true);
  assert.strictEqual(warning.name, 'ExperimentalWarning');
  assert.strictEqual(
    warning.message,
    'URLPatternList is an experimental feature and might change at any time');
}));

const kModule = 'NativeModule internal/url_pattern_list';
const util = require('util');
assert.ok(!process.moduleLoadList.includes(kModule));
const { URLPatternList } = util;
assert.ok(process.moduleLoadList.includes(kModule));

import('node:util').then(common.mustCall((namespace) => {
  assert.strictEqual(namespace.URLPatternList, URLPatternList);
  setImmediate(common.mustCall(() => {
    constructed = true;
    assert.throws(() => new URLPatternList([]), {
      code: 'ERR_INVALID_ARG_VALUE',
    });
    new URLPatternList([new URLPattern()]);
    new URLPatternList([new URLPattern()]);
  }));
}));
