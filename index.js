const EventEmitter = require('events').EventEmitter;
const emitter = new EventEmitter();
const child = require('./lib/child')

module.exports = emitter;

module.exports.StartleServer = require('./lib/StartleServer.js');
module.exports.StartleAgent = require('./lib/StartleAgent.js');
module.exports.StartleClient = require('./lib/StartleClient.js');

module.exports.onStart = fn => child.start(fn, emitter);
module.exports.onStop = child.stop;
