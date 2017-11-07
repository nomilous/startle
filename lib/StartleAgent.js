const debug = require('debug')('startle:agent');
const { EventEmitter } = require('events');
const StartleClient = require('./StartleClient');

module.exports = class StartleAgent extends EventEmitter {

  static create(connections, defaults) {
    var agent = new StartleAgent(connections, defaults);
    return agent.connect();
  }

  constructor(connections, defaults) {
    super();
    connections = connections || {};
    if (!Array.isArray(connections)) connections = [connections];
    this.connections = JSON.parse(JSON.stringify(connections));
    this._applyDefaults(defaults);
  }

  async connect() {
    this._validate();
    var promises = this.connections.map(opts => StartleClient.create(opts));
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

    run = JSON.parse(JSON.stringify(run));

    if (typeof opts == 'function') {
      // opts = opts({ count: this._getGroupCount(group) });
      opts = opts(this._getOptsArgs(group));
    }

    opts = opts ? JSON.parse(JSON.stringify(opts)) : null;

    var proc = await server.spawnProcess(run, opts);
    return proc;
  }

  _applyDefaults(defaults) {
    if (!defaults) return;
    for (var key in defaults) {
      for(var i = 0; i < this.connections.length; i++) {
        this.connections[i][key] = defaults[key];
      }
    }
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

  _getOptsArgs(group) {
    var groups = {};
    this.servers.forEach(server => {
      server.procs.forEach(proc => {
        var group = proc.run.group;
        groups[group] = groups[group] || [];
        groups[group].push(proc);
      });
    });
    return {
      count: this._getGroupCount(group),
      groups: groups
    };
  }

  _getGroupCount(group) {
    var count = 0;
    this.servers.forEach(server => count += server.countOfGroup(group));
    return count;
  }

  _validate() {
    for (var i = 0; i < this.connections.length; i++) {
      if (!this.connections[i].token) {
        throw new Error('Missing [opts.token] in connections item');
      }
    }
  }

}
