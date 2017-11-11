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
    this.metricsInterval;
    this.accumulateMetrics = {
      counters: {},
      gauges: {}
    };
    this.metrics = {
      counters: {},
      gauges: {}
    };
  }

  async connect() {
    this._validate();
    var promises = this.connections.map(opts => StartleClient.create(opts));
    this.servers = await Promise.all(promises);
    this.servers.forEach(server => {
      server.on('error', err => this.emit('error', err));
      server.on('metrics', this._onMetrics.bind(this));
    });
    this.metricsInterval = setInterval(this._emitMetrics.bind(this), 1000);
    return this;
  }

  async destroy() {
    var promises = this.servers.map(client => client.destroy());
    clearInterval(this.metricsInterval);
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
      opts = opts(this._getOptsArgs(server, group));
    }

    opts = opts ? JSON.parse(JSON.stringify(opts)) : null;

    var proc = await server.spawnProcess(run, opts);
    return proc;
  }

  reset() {
    this.accumulateMetrics = {
      counters: {},
      gauges: {}
    };
    this.metrics = {
      counters: {},
      gauges: {}
    };
  }

  _onMetrics(metrics) {
    const accum = this.accumulateMetrics;
    for (var name in metrics.counters) {
      accum.counters[name] = accum.counters[name] || 0;
      accum.counters[name] += metrics.counters[name];
    }
    for (var name in metrics.gauges) {
      accum.gauges[name] = accum.gauges[name] || { count: 0, total: 0 };
      accum.gauges[name].count += metrics.gauges[name].count;
      accum.gauges[name].total += metrics.gauges[name].total;
    }
  }

  _emitMetrics() {
    const accum = this.accumulateMetrics;
    const metrics = this.metrics;
    const groups = this._getGroupCounts();
    for (var name in accum.counters) {
      metrics.counters[name] = accum.counters[name];
    }
    for (var name in accum.gauges) {
      metrics.gauges[name] = accum.gauges[name].total / accum.gauges[name].count;
    }
    for (var name in groups) {
      metrics.gauges[name] = groups[name];
    }
    this.emit('metrics', Date.now(), JSON.parse(JSON.stringify(metrics)));
    for (var name in metrics.counters) {
      metrics.counters[name] = 0;
    }
    accum.counters = {};
    accum.gauges = {};
  }

  _applyDefaults(defaults) {
    if (!defaults) return;
    for (var key in defaults) {
      for (var i = 0; i < this.connections.length; i++) {
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

  _getOptsArgs(server, group) {
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
      target: server,
      groups: groups
    };
  }

  _getGroupCount(group) {
    var count = 0;
    this.servers.forEach(server => count += server.countOfGroup(group));
    return count;
  }

  _getGroupCounts() {
    var groups = {};
    this.servers.forEach(server => {
      server.procs.forEach(proc => {
        var group = proc.run.group;
        groups[group] = groups[group] || 0;
        groups[group]++;
      });
    });
    return groups;
  }

  _validate() {
    for (var i = 0; i < this.connections.length; i++) {
      if (!this.connections[i].token) {
        throw new Error('Missing [opts.token] in connections item');
      }
    }
  }

}
