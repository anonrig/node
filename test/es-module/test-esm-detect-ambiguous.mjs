import { spawnPromisified } from '../common/index.mjs';
import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';

describe('--experimental-detect-module', () => {
  it('permits ESM syntax in --eval input without requiring --input-type=module', async () => {
    const { stdout, stderr, code, signal } = await spawnPromisified(process.execPath, [
      '--experimental-detect-module',
      '--eval',
      'import { version } from "node:process"; console.log(version);',
    ]);

    strictEqual(stderr, '');
    strictEqual(stdout, `${process.version}\n`);
    strictEqual(code, 0);
    strictEqual(signal, null);
  });
})
