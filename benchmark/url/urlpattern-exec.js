'use strict';
const common = require('../common.js');
const { URLPattern } = require('url');
const { notStrictEqual } = require('assert');

const tests = [
  'https://(sub.)?example(.com/)foo',
  { 'hostname': 'xn--caf-dma.com' },
  { 'pathname': '/foo', 'search': 'bar', 'hash': 'baz',
    'baseURL': 'https://example.com:8080' },
  { 'pathname': '/([[a-z]--a])' },
  { 'pathname': '/books/:id/chapters/:chapter' },
];

const bench = common.createBenchmark(main, {
  pattern: tests.map(JSON.stringify),
  input: ['https://sub.example.com/foo',
          'https://example.com/books/123/chapters/7'],
  n: [1e5],
});

function main({ pattern, input, n }) {
  const urlpattern = new URLPattern(JSON.parse(pattern));

  let deadcode;
  bench.start();
  for (let i = 0; i < n; i += 1) {
    deadcode = urlpattern.exec(input);
  }
  bench.end(n);
  notStrictEqual(deadcode, undefined);
}
