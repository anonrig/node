// cpSync must not follow a symlink that already exists beneath the
// destination. fs.promises.cp() rejects that copy with
// ERR_FS_CP_DIR_TO_NON_DIR, including when force is left at its default.
import { mustNotMutateObjectDeep } from '../common/index.mjs';
import { nextdir } from '../common/fs.js';
import assert from 'node:assert';
import {
  cpSync,
  lstatSync,
  mkdirSync,
  promises,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import tmpdir from '../common/tmpdir.js';

tmpdir.refresh();

// Same shape as https://github.com/nodejs/node/issues/67324:
// src/x is a directory, dst/x is a symlink to a directory outside dst.
function tree() {
  const root = nextdir();
  const src = join(root, 'src');
  const dest = join(root, 'dst');
  const elsewhere = join(root, 'elsewhere');
  mkdirSync(join(src, 'x'), { recursive: true });
  writeFileSync(join(src, 'x', 'f.txt'), 'new');
  mkdirSync(elsewhere);
  writeFileSync(join(elsewhere, 'f.txt'), 'old');
  mkdirSync(dest);
  symlinkSync('../elsewhere', join(dest, 'x'), 'dir');
  return { src, dest, elsewhere };
}

function assertNotWrittenThrough(dest, elsewhere) {
  assert.strictEqual(readFileSync(join(elsewhere, 'f.txt'), 'utf8'), 'old');
  assert.ok(lstatSync(join(dest, 'x')).isSymbolicLink());
}

{
  const { src, dest, elsewhere } = tree();
  assert.throws(
    () => cpSync(src, dest, mustNotMutateObjectDeep({ recursive: true })),
    { code: 'ERR_FS_CP_DIR_TO_NON_DIR' },
  );
  assertNotWrittenThrough(dest, elsewhere);
}

{
  const { src, dest, elsewhere } = tree();
  assert.throws(
    () => cpSync(src, dest, mustNotMutateObjectDeep({
      recursive: true,
      force: false,
    })),
    { code: 'ERR_FS_CP_DIR_TO_NON_DIR' },
  );
  assertNotWrittenThrough(dest, elsewhere);
}

// A filter keeps the walk in JavaScript. The refusal has to happen there too.
{
  const { src, dest, elsewhere } = tree();
  assert.throws(
    () => cpSync(src, dest, mustNotMutateObjectDeep({
      recursive: true,
      filter: () => true,
    })),
    { code: 'ERR_FS_CP_DIR_TO_NON_DIR' },
  );
  assertNotWrittenThrough(dest, elsewhere);
}

{
  const { src, dest, elsewhere } = tree();
  await assert.rejects(
    promises.cp(src, dest, mustNotMutateObjectDeep({ recursive: true })),
    { code: 'ERR_FS_CP_DIR_TO_NON_DIR' },
  );
  assertNotWrittenThrough(dest, elsewhere);
}

{
  const { src, dest, elsewhere } = tree();
  await assert.rejects(
    promises.cp(src, dest, mustNotMutateObjectDeep({
      recursive: true,
      filter: () => true,
    })),
    { code: 'ERR_FS_CP_DIR_TO_NON_DIR' },
  );
  assertNotWrittenThrough(dest, elsewhere);
}

// dereference follows the link, which is what fs.promises.cp() does with stat().
{
  const { src, dest, elsewhere } = tree();
  cpSync(src, dest, mustNotMutateObjectDeep({
    recursive: true,
    dereference: true,
  }));
  assert.strictEqual(readFileSync(join(elsewhere, 'f.txt'), 'utf8'), 'new');
  assert.ok(lstatSync(join(dest, 'x')).isSymbolicLink());
}

{
  const { src, dest, elsewhere } = tree();
  cpSync(src, dest, mustNotMutateObjectDeep({
    recursive: true,
    dereference: true,
    filter: () => true,
  }));
  assert.strictEqual(readFileSync(join(elsewhere, 'f.txt'), 'utf8'), 'new');
  assert.ok(lstatSync(join(dest, 'x')).isSymbolicLink());
}

{
  const { src, dest, elsewhere } = tree();
  await promises.cp(src, dest, mustNotMutateObjectDeep({
    recursive: true,
    dereference: true,
  }));
  assert.strictEqual(readFileSync(join(elsewhere, 'f.txt'), 'utf8'), 'new');
  assert.ok(lstatSync(join(dest, 'x')).isSymbolicLink());
}
