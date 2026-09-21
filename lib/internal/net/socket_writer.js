'use strict';

const {
  Promise,
  PromiseReject,
  PromiseResolve,
  PromiseWithResolvers,
  SymbolAsyncDispose,
  SymbolDispose,
} = primordials;

const {
  codes: {
    ERR_INVALID_STATE,
    ERR_SOCKET_CLOSED,
    ERR_STREAM_WRITE_AFTER_END,
  },
} = require('internal/errors');
const { validateBoolean, validateObject } = require('internal/validators');
const {
  convertChunks,
  getWriterSignal,
  toWriterUint8Array,
} = require('internal/streams/iter/utils');
const { kHandle } = require('internal/stream_base_commons');

const kIterWriter = Symbol('kIterWriter');

function queueSize(socket) {
  return socket[kHandle]?.writeQueueSize ?? 0;
}

function byteLengthOf(buffers) {
  let len = 0;
  for (let i = 0; i < buffers.length; i++) {
    len += buffers[i].byteLength;
  }
  return len;
}

function createSocketWriter(socket, writeBuffers, options = { __proto__: null }) {
  validateObject(options, 'options');
  const { autoClose = false } = options;
  validateBoolean(autoClose, 'options.autoClose');

  if (socket[kIterWriter]) {
    throw new ERR_INVALID_STATE(
      'The Socket already has an active stream/iter writer');
  }
  if (socket.destroyed || socket.writableEnded) {
    throw new ERR_INVALID_STATE('The Socket is not writable');
  }

  const hwm = socket.writableHighWaterMark ?? 16384;
  let totalBytes = 0;
  let closed = false;
  let closing = false;
  let errored = false;
  let error;
  let pendingEnd = null;
  let pending = 0;

  function isOpen() {
    return !errored && !closed && !closing && !socket.destroyed;
  }

  function shutdownSocket() {
    if (!socket.destroyed && socket.writable) {
      socket.end();
    }
    if (autoClose && !socket.destroyed) {
      socket.destroySoon();
    }
  }

  function failWriter(reason) {
    if (closed || errored) return;
    errored = true;
    error = reason;
    closing = false;
    closed = true;
    socket[kIterWriter] = undefined;
    pendingEnd?.reject(reason);
    pendingEnd = null;
    if (!socket.destroyed) {
      socket.destroy(reason);
    }
  }

  function finishEnd() {
    if (!closing || errored || pending !== 0) return;
    shutdownSocket();
    closing = false;
    closed = true;
    socket[kIterWriter] = undefined;
    const done = pendingEnd;
    pendingEnd = null;
    done?.resolve(totalBytes);
  }

  // Returns undefined when uv_try_write consumed the batch (pipeTo's
  // sync success path), or a Promise that fulfills when an async
  // uv_write completes. writevSync is always false so we never accept
  // an in-flight write as sync (that would let pipeTo flood libuv).
  function writeAsync(buffers, signal) {
    if (errored) return PromiseReject(error);
    if (!isOpen()) {
      return PromiseReject(new ERR_STREAM_WRITE_AFTER_END());
    }
    if (signal?.aborted) {
      return PromiseReject(signal.reason);
    }
    if (!socket.connecting && socket[kHandle] == null) {
      return PromiseReject(new ERR_SOCKET_CLOSED());
    }

    const len = byteLengthOf(buffers);
    if (len === 0) return;

    let asyncResolve;
    let asyncReject;
    let syncErr;
    pending++;
    const req = writeBuffers(socket, buffers, (err) => {
      pending--;
      if (err) {
        syncErr = err;
        failWriter(err);
        if (asyncReject) {
          asyncReject(err);
        }
        return;
      }
      totalBytes += len;
      finishEnd();
      if (asyncResolve) {
        asyncResolve();
      }
    });
    if (req.async) {
      return new Promise((resolve, reject) => {
        asyncResolve = resolve;
        asyncReject = reject;
        if (syncErr) {
          reject(syncErr);
        }
      });
    }
    if (syncErr) {
      return PromiseReject(syncErr);
    }
    // Sync try_write: return undefined so pipeTo skips Promise allocation.
    return undefined;
  }

  const writer = {
    __proto__: null,

    get canWrite() {
      if (!isOpen()) return null;
      if (socket.connecting) return true;
      if (socket[kHandle] == null) return null;
      return queueSize(socket) < hwm;
    },

    write(chunk, options) {
      const bytes = toWriterUint8Array(chunk);
      const signal = getWriterSignal(options);
      return writeAsync([bytes], signal);
    },

    writev(chunks, options) {
      const buffers = convertChunks(chunks);
      const signal = getWriterSignal(options);
      return writeAsync(buffers, signal);
    },

    writeSync(chunk) {
      toWriterUint8Array(chunk);
      return false;
    },

    writevSync(chunks) {
      convertChunks(chunks);
      return false;
    },

    end(options) {
      getWriterSignal(options);
      if (errored) return PromiseReject(error);
      if (pendingEnd) return pendingEnd.promise;
      if (closed) return PromiseResolve(totalBytes);
      closing = true;
      pendingEnd = PromiseWithResolvers();
      const { promise } = pendingEnd;
      if (pending === 0) {
        finishEnd();
      }
      return promise;
    },

    endSync() {
      if (errored) return -1;
      if (closed) return totalBytes;
      if (closing || pending !== 0) return -1;
      closing = true;
      shutdownSocket();
      closed = true;
      socket[kIterWriter] = undefined;
      return totalBytes;
    },

    fail(reason) {
      failWriter(reason);
    },

    [SymbolAsyncDispose]() {
      if (closing) {
        return pendingEnd?.promise ?? PromiseResolve();
      }
      if (!closed && !errored) {
        this.fail();
      }
      return PromiseResolve();
    },

    [SymbolDispose]() {
      this.fail();
    },
  };

  socket[kIterWriter] = writer;

  socket.once('close', () => {
    if (!closed && !errored) {
      failWriter(new ERR_SOCKET_CLOSED());
    }
  });
  socket.once('error', (err) => {
    failWriter(err);
  });

  return writer;
}

module.exports = {
  createSocketWriter,
  kIterWriter,
};
