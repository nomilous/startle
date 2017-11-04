const shortid = require('shortid');

module.exports = class StartleProcess {

  constructor(server, run, opts) {
    Object.defineProperty(this, 'server', {
      value: server
    });

    this.id = shortid.generate();
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

}
