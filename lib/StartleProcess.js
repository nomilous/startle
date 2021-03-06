const { EventEmitter } = require('events');
const shortid = require('shortid');

module.exports = class StartleProcess extends EventEmitter {

  constructor(server, run, opts) {
    super();
    Object.defineProperty(this, 'server', {
      value: server
    });

    this.id = shortid.generate();
    this.hostname = server.hostname;
    this.address = server.address;
    this.run = run;
    this.opts = opts;
    this.state = 'starting';
    this.timestamp = Date.now();
  }

  stop(run, opts) {
    return this.server.stopProcess(this.id, run, opts);
  }

  kill(run) {
    return this.server.killProcess(this.id, run);
  }

  send(eventName, ...args) {
    return this.server.sendMessage(this.id, eventName, args);
  }

}
