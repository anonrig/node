'use strict';

const {
  ArrayPrototypePush,
  PromisePrototypeThen,
  PromiseReject,
  PromiseResolve,
  PromiseWithResolvers,
  SafeSet,
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
  const waiters = new SafeSet();

  function isOpen() {
    return !errored && !closed && !closing && !socket.destroyed;
  }

  function canAcceptSync() {
    return isOpen() &&
           !socket.connecting &&
           socket[kHandle] != null &&
           queueSize(socket) < hwm;
  }

  function rejectWaiters(err) {
    for (const waiter of waiters) {
      waiter.reject(err);
    }
    waiters.clear();
  }

  function resolveWaiters() {
    if (waiters.size === 0 || queueSize(socket) >= hwm) {
      return;
    }
    const list = [];
    for (const waiter of waiters) {
      ArrayPrototypePush(list, waiter);
    }
    waiters.clear();
    for (let i = 0; i < list.length; i++) {
      list[i].resolve();
    }
  }

  function waitForSpace() {
    if (canAcceptSync() || (isOpen() && socket.connecting)) {
      return PromiseResolve();
    }
    if (!isOpen()) {
      return PromiseReject(error ?? new ERR_STREAM_WRITE_AFTER_END());
    }
    const { promise, resolve, reject } = PromiseWithResolvers();
    waiters.add({ __proto__: null, resolve, reject });
    return promise;
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
    rejectWaiters(reason);
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

  function dispatch(buffers, len) {
    pending++;
    let syncErr;
    const req = writeBuffers(socket, buffers, (err) => {
      pending--;
      if (err) {
        syncErr = err;
        failWriter(err);
        return;
      }
      resolveWaiters();
      finishEnd();
    });
    if (req.async === false && syncErr) {
      return { __proto__: null, ok: false, err: syncErr };
    }
    totalBytes += len;
    return { __proto__: null, ok: true };
  }

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
    if (len === 0) return PromiseResolve();

    return PromisePrototypeThen(waitForSpace(), () => {
      if (errored) throw error;
      if (!isOpen()) throw new ERR_STREAM_WRITE_AFTER_END();
      if (signal?.aborted) throw signal.reason;
      const result = dispatch(buffers, len);
      if (!result.ok) throw result.err;
    });
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
      const bytes = toWriterUint8Array(chunk);
      if (!canAcceptSync()) return false;
      if (bytes.byteLength === 0) return true;
      return dispatch([bytes], bytes.byteLength).ok;
    },

    writevSync(chunks) {
      const buffers = convertChunks(chunks);
      if (!canAcceptSync()) return false;
      const len = byteLengthOf(buffers);
      if (len === 0) return true;
      return dispatch(buffers, len).ok;
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
