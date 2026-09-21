// Flags: --experimental-stream-iter
'use strict';

const common = require('../common');
const assert = require('assert');
const net = require('net');
const { from, pipeTo, fromWritable } = require('stream/iter');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, common.mustCall(() => {
      resolve(server.address().port);
    }));
  });
}

function collect(socket) {
  const chunks = [];
  socket.on('data', (c) => chunks.push(c));
  return {
    text: () => Buffer.concat(chunks).toString(),
    bytes: () => Buffer.concat(chunks),
  };
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port);
    socket.on('error', reject);
    socket.on('connect', () => {
      socket.off('error', reject);
      resolve(socket);
    });
  });
}

async function withEchoPair(fn) {
  let received;
  const server = net.createServer((socket) => {
    received = collect(socket);
    socket.on('end', () => socket.end());
  });
  const port = await listen(server);
  const socket = await connect(port);
  try {
    await fn(socket, () => received);
  } finally {
    socket.destroy();
    server.close();
  }
}

async function testWriteAndEnd() {
  await withEchoPair(async (socket, getReceived) => {
    const w = socket.writer();
    await w.write(Buffer.from('Hello '));
    await w.write('World!');
    const total = await w.end();
    assert.strictEqual(total, 12);
    await onceEnd(socket);
    assert.strictEqual(getReceived().text(), 'Hello World!');
  });
}

async function testWritevKeepsBatch() {
  await withEchoPair(async (socket, getReceived) => {
    const w = socket.writer();
    assert.strictEqual(w.writevSync([Buffer.from('pre')]), false);
    await w.writev([
      Buffer.from('aaa'),
      Buffer.from('bbb'),
      Buffer.from('ccc'),
    ]);
    const total = await w.end();
    assert.strictEqual(total, 9);
    await onceEnd(socket);
    assert.strictEqual(getReceived().text(), 'aaabbbccc');
  });
}

async function testPipeToMultiChunkBatches() {
  await withEchoPair(async (socket, getReceived) => {
    async function* source() {
      yield [Buffer.from('ab'), Buffer.from('cd')];
      yield [Buffer.from('ef'), Buffer.from('gh'), Buffer.from('ij')];
    }
    const total = await pipeTo(source(), socket.writer());
    assert.strictEqual(total, 10);
    await onceEnd(socket);
    assert.strictEqual(getReceived().text(), 'abcdefghij');
  });
}

async function testFromStringPipeTo() {
  await withEchoPair(async (socket, getReceived) => {
    const total = await pipeTo(from('hello world'), socket.writer());
    assert.strictEqual(total, 11);
    await onceEnd(socket);
    assert.strictEqual(getReceived().text(), 'hello world');
  });
}

async function testLockedWriter() {
  await withEchoPair(async (socket) => {
    const w = socket.writer();
    assert.throws(() => socket.writer(), {
      code: 'ERR_INVALID_STATE',
      message: /active stream\/iter writer/,
    });
    await w.end();
    assert.throws(() => socket.writer(), {
      code: 'ERR_INVALID_STATE',
      message: /not writable/,
    });
  });
}

async function testWriteWhileConnecting() {
  const server = net.createServer((socket) => {
    socket.on('data', () => {});
    socket.on('end', () => socket.end());
  });
  const port = await listen(server);
  const socket = net.connect(port);
  assert.strictEqual(socket.connecting, true);
  const w = socket.writer();
  const writePromise = w.write(Buffer.from('queued'));
  await writePromise;
  const total = await w.end();
  assert.strictEqual(total, 6);
  socket.destroy();
  server.close();
}

async function testFailDestroysSocket() {
  await withEchoPair(async (socket) => {
    const w = socket.writer();
    const err = new Error('boom');
    w.fail(err);
    assert.ok(socket.destroyed);
    await assert.rejects(w.write(Buffer.from('x')), err);
  });
}

async function testEmptyWrite() {
  await withEchoPair(async (socket) => {
    const w = socket.writer();
    await w.write(Buffer.alloc(0));
    await w.writev([]);
    const total = await w.end();
    assert.strictEqual(total, 0);
  });
}

async function testInvalidAutoClose() {
  await withEchoPair(async (socket) => {
    assert.throws(() => socket.writer({ autoClose: 'yes' }), {
      code: 'ERR_INVALID_ARG_TYPE',
    });
  });
}

async function testWriterMatchesFromWritableBytes() {
  // Same payload through the native writer and the classic adapter must
  // produce the same bytes. The native path is the one that keeps writev
  // intact; this only checks correctness.
  const payload = [];
  for (let i = 0; i < 32; i++) {
    payload.push(Buffer.alloc(16, i));
  }
  async function* source() {
    yield payload;
  }

  let nativeBytes;
  await withEchoPair(async (socket, getReceived) => {
    await pipeTo(source(), socket.writer());
    await onceEnd(socket);
    nativeBytes = getReceived().bytes();
  });

  let classicBytes;
  await withEchoPair(async (socket, getReceived) => {
    await pipeTo(source(), fromWritable(socket, { backpressure: 'unbounded' }));
    socket.end();
    await onceEnd(socket);
    classicBytes = getReceived().bytes();
  });

  assert.deepStrictEqual(nativeBytes, classicBytes);
  assert.strictEqual(nativeBytes.length, 32 * 16);
}

function onceEnd(socket) {
  return new Promise((resolve) => {
    if (socket.readableEnded) {
      resolve();
      return;
    }
    socket.once('end', resolve);
    // Peer may close without a readable end if we destroyed first.
    socket.once('close', resolve);
  });
}

Promise.all([
  testWriteAndEnd(),
  testWritevKeepsBatch(),
  testPipeToMultiChunkBatches(),
  testFromStringPipeTo(),
  testLockedWriter(),
  testWriteWhileConnecting(),
  testFailDestroysSocket(),
  testEmptyWrite(),
  testInvalidAutoClose(),
  testWriterMatchesFromWritableBytes(),
]).then(common.mustCall());
