'use strict';
// Accidental-network guard for local checks, not a sandbox for hostile code.
// Explicit fixture fetch mocks remain possible; no actual outbound sockets.
const { syncBuiltinESMExports } = require('node:module');
function blocked() { throw new Error('Validation stage disallows outbound network calls.'); }
for (const name of ['node:http', 'node:https']) {
  const module = require(name);
  module.request = blocked;
  module.get = blocked;
}
const net = require('node:net');
net.connect = blocked;
net.createConnection = blocked;
net.Socket.prototype.connect = blocked;
require('node:tls').connect = blocked;
globalThis.fetch = async () => blocked();
syncBuiltinESMExports();
