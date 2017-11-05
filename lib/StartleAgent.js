const debug = require('debug')('startle:agent');
const { EventEmitter } = require('events');
const StartleClient = require('./StartleClient');

module.exports = class StartleAgent extends EventEmitter {

  static create(optsArray) {
    var agent = new StartleAgent(optsArray);
    return agent.connect();
  }

  constructor(optsArray) {
    super();
    optsArray = optsArray || {};
    if (!Array.isArray(optsArray)) optsArray = [optsArray];
    this.optsArray = JSON.parse(JSON.stringify(optsArray));
  }

  async connect() {
    this._validate();
    var promises = this.optsArray.map(opts => StartleClient.create(opts));
    this.servers = await Promise.all(promises);
    this.servers.forEach(server => {
      server.on('error', err => this.emit('error', err));
    });
    return this;
  }

  async destroy() {
    var promises = this.servers.map(client => client.destroy());
    await Promise.all(promises);
    this.servers.length = 0;
  }

  async start(run, opts) {
    if (typeof run == 'string') run = { script: run };
    if (!run.group) run.group = 'any';
    if (this.servers.length == 0) throw new Error('No servers');

    var group = run.group;
    var server = this._getNextServer(group);
    if (!server) throw new Error('No servers in group ' + group);

    var proc = await server.spawnProcess(run, opts);
    return proc;
  }

  _getNextServer(group) {
    var server = this.servers
      .filter(server => server.isMember(group))
      .sort((a, b) => {
        if (a.countOfGroup(group) < b.countOfGroup(group)) return -1;
        if (a.countOfGroup(group) > b.countOfGroup(group)) return 1;
        return 0;
      })
      .shift();

    return server;
  }

  _validate() {
    for (var i = 0; i < this.optsArray.length; i++) {
      if (!this.optsArray[i].token) {
        throw new Error('Missing [opts.token] in optsArray item');
      }
    }
  }

}
