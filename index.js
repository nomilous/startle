const EventEmitter = require('events').EventEmitter;
const emitter = new EventEmitter();
const child = require('./lib/child');
const StartleServer = require('./lib/StartleServer.js');
const StartleAgent = require('./lib/StartleAgent.js');
const StartleClient = require('./lib/StartleClient.js');

module.exports = emitter;

module.exports.onStart = fn => child.start(fn, emitter);
module.exports.onStop = child.stop;
module.exports.send = child.send;

module.exports.createAgent = StartleAgent.create;

module.exports.StartleServer = StartleServer;
module.exports.StartleAgent = StartleAgent;
module.exports.StartleClient = StartleClient;
