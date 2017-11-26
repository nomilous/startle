const debug = require('debug')('startle:server');
const { EventEmitter } = require('events');
const child_process = require('child_process');
const socketIO = require('socket.io');
const https = require('https');
const path = require('path');
const util = require('util');
const pem = require('pem');
const os = require('os');
const fs = require('fs');

module.exports = class StartleServer extends EventEmitter {

  static create(opts) {
    var server = new StartleServer(opts);
    return server.start();
  }

  constructor(opts) {
    super();
    opts = opts || {};
    this.path = opts.path;
    this.token = opts.token || process.env.TOKEN;
    this.groups = opts.groups || ['any'];
    this.host = opts.host || '0.0.0.0';
    this.port = opts.port || 59595;
    this.sslKeyFile = opts.sslKeyFile;
    this.sslCertFile = opts.sslCertFile;
    this.metricsInterval;

    Object.defineProperty(this, 'key', {
      value: null,
      writable: true
    });
    Object.defineProperty(this, 'cert', {
      value: null,
      writable: true
    });
    Object.defineProperty(this, 'server', {
      value: null,
      writable: true
    });
    Object.defineProperty(this, 'io', {
      value: null,
      writable: true
    });
    Object.defineProperty(this, 'sockets', {
      value: []
    });
  }

  async start() {
    debug('starting');
    this._validate();
    this.metricsInterval = setInterval(this._sendMetrics.bind(this), 500);
    await this._ensureCertificate();
    await this._startServer();
    await this._configureServer();
    return this;
  }

  destroy() {
    return new Promise((resolve, reject) => {
      let socket;

      clearInterval(this.metricsInterval);

      if (!this.server) return resolve();

      this.server.close();
      this.io.close(() => {
        debug('stoppped');
        resolve();
      });

      debug('closing %d sockets', this.sockets.length);
      while (socket = this.sockets.pop()) {
        socket.disconnect();
      }
    });
  }

  _ensureCertificate() {
    return new Promise((resolve, reject) => {
      if (this.key && this.cert) {
        debug('using provided certificate');
        return resolve();
      }

      pem.createCertificate({
        selfSigned: true
      }, (err, keys) => {
        if (err) return reject(err);

        debug('created certificate');
        this.key = keys.serviceKey;
        this.cert = keys.certificate;
        resolve();
      });
    });
  }

  _startServer() {
    return new Promise((resolve, reject) => {
      let onRunningError = err => this.emit('error', err);

      let onListenError = err => {
        delete this.server;
        reject(err);
      };

      let onListening = () => {
        var addr = this.server.address();
        debug('started https server %s:%d', addr.address, addr.port);
        this.server.removeListener('error', onListenError);
        this.server.on('error', onRunningError);
        resolve();
      };

      this.server = https.createServer({
        key: this.key,
        cert: this.cert
      }, function (req, res) {
        res.writeHead(200);
        res.end('OK');
      });

      this.io = socketIO(this.server);
      this.server.on('error', onListenError);
      this.server.on('listening', onListening);
      this.server.listen(this.port, this.host);
    });
  }

  _configureServer() {
    return new Promise((resolve, reject) => {
      this.io.on('error', err => this.emit('error', err));
      this.io.on('connection', this._onConnection.bind(this));
      resolve();
    });
  }

  _onConnection(socket) {
    debug('connected %s from %s', socket.id, socket.handshake.address);

    socket.metrics = {
      counters: {},
      gauges: {}
    }

    if (socket.handshake.query.token !== this.token) {
      return socket.disconnect(true);
    }

    this.sockets.push(socket);
    socket.procs = [];

    socket.on('disconnect', () => this._onDisconnect(socket));
    socket.on(socket.id, action => this._onMessage(socket, action));

    socket.emit('info', {
      id: socket.id,
      hostname: os.hostname(),
      address: this._firstPublicIpV4(),
      groups: this.groups
    });
  }

  _firstPublicIpV4() {
    var all = os.networkInterfaces();
    for (var iface in all) {
      var interfaces = all[iface];
      for (var i = 0; i < interfaces.length; i++) {
        if (interfaces[i].family == 'IPv6') continue;
        if (interfaces[i].internal) continue;
        return interfaces[i].address;
      }
    }
  }

  _onDisconnect(socket) {
    debug('disconnect %s', socket.id);
    this.sockets.splice(this.sockets.indexOf(socket), 1);
    this._killAllProcesses(socket);
  }

  _onMessage(socket, msg) {
    switch (msg.action) {
      case 'message':
        this._deliverMessage(socket, msg);
        break;

      case 'start':
        this._doProcessStart(socket, msg);
        break;

      case 'stop':
        this._doProcessStop(socket, msg);
        break;

      case 'kill':
        this._doProcessKill(socket, msg);
        break;
    }
  }

  _deliverMessage(socket, msg) {
    var proc = socket.procs.find(proc => proc.id == msg.id);
    if (!proc) {
      debug('no such process for message (%s)', msg.id);
      return;
    }
    proc.child.send(msg);
  }

  _doProcessStart(socket, msg) {
    var script = msg.run.script;
    var id = msg.id;
    var proc = { id: id, run: msg.run, opts: msg.opts };
    var child;

    debug('start %s (%s)', script, id);
    script = this._fixScriptPath(script);

    if (!fs.existsSync(script)) {
      debug('missing %s (%s)', script, msg.id);
      return socket.emit(msg.id, {
        action: 'startError',
        id: msg.id,
        name: 'Error',
        message: util.format('Missing remote script %s', script),
      })
    }

    socket.procs.push(proc);

    let onExit1 = (code) => {
      socket.emit(proc.id, {
        action: 'startError',
        id: proc.id,
        name: 'Error',
        message: util.format(
          'Remote child exited immediately with code %d, ' +
          'perhaps missing onStart()',
          code
        )
      });
    }

    let onExit2 = (code) => {
      debug('process %s (%s) exited with code %d', msg.run.script, id, code);
      var index = socket.procs.indexOf(proc);
      if (index >= 0) socket.procs.splice(index, 1);
      // socket.procs.splice(socket.procs.indexOf(proc), 1);
    }

    child = proc.child = child_process.fork(script);
    child.once('exit', onExit1);
    child.on('exit', onExit2);

    child.on('message', message => {
      var error;

      switch (message.action) {
        case 'metrics':
          this._updateMetrics(proc.id, socket, message.metrics);
          break;

        case 'message':
          socket.emit(proc.id, {
            action: 'message',
            args: message.args
          });
          break;

        case 'started':
          debug('started %s (%s)', proc.run.script, proc.id);
          child.removeListener('exit', onExit1);
          socket.emit(proc.id, {
            action: 'started'
          });
          return;

        case 'startError':
          debug('error %s (%s)', proc.run.script, proc.id);
          child.removeListener('exit', onExit1);
          this._doProcessKill(socket, proc, true);
          socket.emit(proc.id, {
            action: 'startError',
            name: message.name,
            message: message.message
          });
          return;
      }
    });

    child.send({
      action: 'start',
      opts: proc.opts
    });

  }

  _sendMetrics() {
    this.sockets.forEach(socket => {
      var metrics = socket.metrics;
      for (var name in metrics.counters) {
        metrics.counters[name] = this._reduceCounters(metrics.counters[name]);
      }

      socket.emit('metrics', socket.metrics);
      socket.metrics = {
        counters: {},
        gauges: {}
      };
    });
  }

  _reduceCounters(countersData) {
    var perClient = [];
    for (var id in countersData) {
      perClient.push(this._averageArray(countersData[id]));
      countersData[id] = [];
    }
    return this._sumArray(perClient);
  }

  _averageArray(array) {
    return this._sumArray(array) / array.length;
  }

  _sumArray(array) {
    return array.reduce((total, num) => total + num)
  }

  _updateMetrics(id, socket, newMetrics) {
    const metrics = socket.metrics;

    for (var name in newMetrics.counters) {
      metrics.counters[name] = metrics.counters[name] || {};
      metrics.counters[name][id] = newMetrics.counters[name][id] || [];
      metrics.counters[name][id].push(newMetrics.counters[name]);
    }

    for (var name in newMetrics.gauges) {
      metrics.gauges[name] = metrics.gauges[name] || { count: 0, total: 0 };
      metrics.gauges[name].count += newMetrics.gauges[name].count;
      metrics.gauges[name].total += newMetrics.gauges[name].total;
    }
  }

  _doProcessStop(socket, msg) {
    var proc = socket.procs.find(proc => proc.id == msg.id);

    var respondStopOk = () => {
      socket.emit(msg.id, {
        action: 'stopped'
      });
    }

    var deleteProcess = () => {
      var index = socket.procs.indexOf(proc);
      if (index >= 0) socket.procs.splice(index, 1);
    }

    if (!proc) {
      debug('no such process for stop (%s)', msg.id);
      respondStopOk();
      return;
    }

    try {
      process.kill(proc.child.pid, 0);
    } catch (error) {
      // child not running
      debug('process not running for stop %s (%s)', proc.run.script, proc.id);
      deleteProcess();
      respondStopOk();
      return;
    }

    debug('stop %s (%s)', proc.run.script, proc.id);

    var onExit = () => {
      debug('stopped %s (%s)', proc.run.script, proc.id);
      deleteProcess();
      socket.emit(proc.id, {
        action: 'stopped'
      });
    }

    proc.child.on('exit', onExit);

    proc.child.on('message', (message) => {
      var error;

      switch (message.action) {
        case 'stopError':
          debug('stop error %s (%s)', proc.run.script, proc.id);
          socket.emit(proc.id, {
            action: 'stopError',
            id: proc.id,
            name: message.name,
            message: message.message
          });

          proc.child.removeListener('exit', onExit);
          this._doProcessKill(socket, msg, true);
          break;
      }
    });

    proc.child.send({
      action: 'stop',
      opts: msg.opts
    });
  }

  _doProcessKill(socket, msg, skipResponse) {
    var proc = socket.procs.find(proc => proc.id == msg.id);

    var respondKillOk = () => {
      if (skipResponse) return;
      socket.emit(msg.id, {
        action: 'killed'
      });
    }

    var deleteProcess = () => {
      var index = socket.procs.indexOf(proc);
      if (index >= 0) socket.procs.splice(index, 1);
    }

    if (!proc) {
      debug('no such process for kill (%s)', msg.id);
      respondKillOk();
      return;
    }

    try {
      process.kill(proc.child.pid, 0);
    } catch (error) {
      // child not running
      debug('process not running for kill %s (%s)', proc.run.script, proc.id);
      deleteProcess();
      respondKillOk();
      return;
    }

    debug('kill %s (%s)', proc.run.script, proc.id);

    proc.child.once('exit', function () {
      debug('killed %s (%s)', proc.run.script, proc.id);
      deleteProcess();
      respondKillOk();
    });

    proc.child.kill();
  }

  _fixScriptPath(script) {
    // allow for win32
    var parts = script.split('/');
    parts.unshift(this.path);
    var fixed = path.resolve.apply(null, parts);
    if (!fixed.substring(fixed.length - 3) != '.js') {
      fixed += '.js';
    }
    return fixed;
  }


  _killAllProcesses(socket) {
    var proc;
    while (proc = socket.procs.pop()) {
      if (proc.child) {
        try {
          process.kill(proc.child.pid);
        } catch (e) {}
      }
    }
  }

  _validate() {
    if (!this.path) {
      throw new Error('Missing [opts.path]');
    }

    if (!fs.existsSync(path.resolve(this.path))) {
      throw new Error('No such [opts.path] ' + this.path);
    }

    if (!this.token) {
      throw new Error('Missing [opts.token]');
    }

    if (this.groups.length == 0) {
      this.groups = ['any'];
    }

    if (this.sslKeyFile && !this.sslCertFile) {
      throw new Error('Require both [opts.sslKeyFile] and [opts.sslCertFile]');
    }

    if (!this.sslKeyFile && this.sslCertFile) {
      throw new Error('Require both [opts.sslKeyFile] and [opts.sslCertFile]');
    }

    if (this.sslKeyFile) {
      if (!fs.existsSync(path.resolve(this.sslKeyFile))) {
        throw new Error('No such [opts.sslKeyFile] ' + this.sslKeyFile);
      }
    }

    if (this.sslCertFile) {
      if (!fs.existsSync(path.resolve(this.sslCertFile))) {
        throw new Error('No such [opts.sslCertFile] ' + this.sslCertFile);
      }
    }

    if (this.sslKeyFile && this.sslCertFile) {
      try {
        this.key = fs.readFileSync(this.sslKeyFile.toString())
        this.cert = fs.readFileSync(this.sslCertFile.toString())
      } catch (e) {
        throw e;
      }
    }
  }

}
