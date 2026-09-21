// Compare classic socket.write, fromWritable(socket), and socket.writer()
// when the source yields multi-chunk batches (the case writev is meant for).
'use strict';

const common = require('../common.js');
const net = require('net');

const bench = common.createBenchmark(main, {
  api: ['classic', 'fromWritable', 'writer'],
  chunkSize: [64, 1024],
  chunksPerBatch: [1, 16, 64],
  dur: [3],
}, {
  flags: ['--experimental-stream-iter'],
  test: { chunkSize: 64, chunksPerBatch: 8, dur: 0.5 },
});

function main({ api, chunkSize, chunksPerBatch, dur }) {
  const chunk = Buffer.alloc(chunkSize, 'x');
  const batch = [];
  for (let i = 0; i < chunksPerBatch; i++)
    batch.push(chunk);

  let received = 0;
  const server = net.createServer((socket) => {
    socket.on('data', (c) => {
      received += c.length;
    });
  });

  server.listen(common.PORT, () => {
    const socket = net.connect(common.PORT);
    socket.on('connect', () => {
      bench.start();
      const stopAt = Date.now() + dur * 1000;

      function done() {
        const bytes = received;
        const gbits = (bytes * 8) / (1024 * 1024 * 1024);
        bench.end(gbits);
        socket.destroy();
        server.close();
      }

      switch (api) {
        case 'classic':
          return runClassic(socket, batch, stopAt, done);
        case 'fromWritable':
          return runFromWritable(socket, batch, stopAt, done);
        case 'writer':
          return runWriter(socket, batch, stopAt, done);
      }
    });
  });
}

function runClassic(socket, batch, stopAt, done) {
  socket.on('drain', write);
  write();

  function write() {
    if (Date.now() >= stopAt) {
      socket.removeListener('drain', write);
      done();
      return;
    }
    socket.cork();
    for (let i = 0; i < batch.length; i++) {
      socket.write(batch[i]);
    }
    socket.uncork();
    if (Date.now() < stopAt)
      setImmediate(write);
  }
}

function runFromWritable(socket, batch, stopAt, done) {
  const { fromWritable, pipeTo } = require('stream/iter');

  async function* source() {
    while (Date.now() < stopAt)
      yield batch;
  }

  pipeTo(source(), fromWritable(socket, { backpressure: 'unbounded' }), {
    preventClose: true,
  }).then(done, (err) => {
    throw err;
  });
}

function runWriter(socket, batch, stopAt, done) {
  const { pipeTo } = require('stream/iter');

  async function* source() {
    while (Date.now() < stopAt)
      yield batch;
  }

  pipeTo(source(), socket.writer(), {
    preventClose: true,
  }).then(done, (err) => {
    throw err;
  });
}
