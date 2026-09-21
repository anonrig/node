'use strict';

const assert = require('assert');
const net = require('net');

const socket = new net.Socket();
assert.strictEqual(socket.writer, undefined);
socket.destroy();
