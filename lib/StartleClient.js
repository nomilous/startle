const debug = require('debug')('startle:client');
const { EventEmitter } = require('events');
const util = require('util');
const socketIO = require('socket.io-client');
const StartleProcess = require('./StartleProcess');

module.exports = class StartleClient extends EventEmitter {

  static create(opts) {
    var client = new StartleClient(opts);
    return client.connect();
  }

  constructor(opts) {
    super();
    opts = opts || {};
    this.connected = false;
    this.id = null;
    this.hostname = null;
    this.groups = null;
    this.procs = [];
    Object.defineProperty(this, 'token', {
      value: opts.token
    });
    Object.defineProperty(this, 'host', {
      value: opts.host || 'localhost'
    });
    Object.defineProperty(this, 'port', {
      value: opts.port || 59595
    });
    Object.defineProperty(this, 'transports', {
      value: opts.transports || ['websocket']
    });
    Object.defineProperty(this, 'rejectUnauthorized', {
      value: typeof opts.rejectUnauthorized == 'boolean' ?
        opts.rejectUnauthorized : true
    });
    Object.defineProperty(this, 'socket', {
      value: null,
      writable: true
    });
  }

  async connect() {
    this._validate();
    await this._connectClient();
    return this;
  }

  destroy() {
    return new Promise((resolve, reject) => {
      if (!this.connected) return resolve();
      debug('disconnecting');
      this.socket.on('disconnect', () => {
        debug('disconnected');
        resolve();
      });
      this.socket.disconnect();
    });
  }

  isMember(group) {
    if (this.groups.indexOf('any') >= 0) return true;
    if (this.groups.indexOf(group) >= 0) return true;
    return false;
  }

  countOfGroup(group) {
    return this.procs.filter(proc => proc.run.group == group).length;
  }

  spawnProcess(run, opts) {
    return new Promise((resolve, reject) => {
      let proc = new StartleProcess(this, run, opts);
      let script = run.script;
      let id = proc.id;
      let hostname = this.hostname;
      let wait = run.timeout || 10000;
      let timedout = false;
      let timeout;
      this.procs.push(proc);

      debug('start %s (%s) at %s', script, id, hostname);

      this.socket.on(proc.id, message => {
        if (timedout) return;
        switch (message.action) {
          case 'message':
            proc.emit.apply(proc, message.args);
            break;
        }
      });

      this.socket.once(proc.id, result => {
        if (timedout) return;
        switch (result.action) {
          case 'started':
            debug('started %s (%s) at %s', script, id, hostname);
            clearTimeout(timeout);
            proc.state = 'running';
            proc.timestamp = Date.now();
            return resolve(proc);

          case 'startError':
            debug('start error %s (%s) at %s', script, id, hostname);
            clearTimeout(timeout);
            var e = new Error();
            e.name = result.name;
            e.message = result.message;
            // TODO: stack?
            this.procs.splice(this.procs.indexOf(proc), 1);
            return reject(e);
        }
      });

      if (run.timeout != 0) {
        timeout = setTimeout(() => {
          timedout = true;
          debug('start timeout %s (%s) at %s', script, id, hostname);
          this.killProcess(id, null, true);
          reject(new Error('Timeout of ' + wait + 'ms exceeded'));
        }, wait);
      }

      this.socket.emit(this.id, {
        action: 'start',
        id: proc.id,
        run: run,
        opts: opts
      });
    });
  }

  sendMessage(id, eventName, args) {
    args.unshift(eventName);
    this.socket.emit(this.id, {
      action: 'message',
      id: id,
      args: args
    });
  }

  stopProcess(id, run, opts) {
    return new Promise((resolve, reject) => {
      run = run || {};
      let proc = this.procs.find(proc => proc.id == id);
      let wait = run.timeout || 10000;
      let timedout = false;
      let timeout;

      if (!proc) {
        debug('no such process (%s)', id);
        return resolve();
      }

      proc.state = 'stopping';
      proc.timestamp = Date.now();

      let script = proc.run.script;
      let hostname = this.hostname;

      debug('stop %s (%s) at %s', script, id, hostname);

      let deleteProcess = () => {
        this.procs.splice(this.procs.indexOf(proc), 1);
      }

      this.socket.once(proc.id, function (result) {
        switch (result.action) {
          case 'stopped':
            debug('stopped %s (%s) at %s', script, id, hostname);
            clearTimeout(timeout);
            deleteProcess();
            return resolve();

          case 'stopError':
            debug('stop error %s (%s) at %s', script, id, hostname);
            clearTimeout(timeout);
            var e = new Error();
            e.name = result.name;
            e.message = result.message;
            deleteProcess();
            return reject(e);
        }
      });

      if (run.timeout != 0) {
        timeout = setTimeout(() => {
          timedout = true;
          debug('stop timeout %s (%s) at %s', script, id, hostname);
          this.killProcess(id, null, true);
          reject(new Error('Timeout of ' + wait + 'ms exceeded'));
        }, wait);
      }

      this.socket.emit(this.id, {
        action: 'stop',
        id: proc.id,
        run: run,
        opts: opts
      });
    });
  }

  killProcess(id, run, fireAndForget) {
    return new Promise((resolve, reject) => {
      run = run || {};
      let proc = this.procs.find(proc => proc.id == id);
      let wait = run.timeout || 10000;
      let timedout = false;
      let timeout;

      if (!proc) {
        debug('no such process (%s)', id);
        return resolve();
      }

      proc.state = 'killing';
      proc.timestamp = Date.now();

      let script = proc.run.script;
      let hostname = this.hostname;

      debug('kill %s (%s) at %s', script, id, hostname);

      let deleteProcess = () => {
        this.procs.splice(this.procs.indexOf(proc), 1);
      }

      if (!fireAndForget) {
        this.socket.once(proc.id, function (result) {
          switch (result.action) {
            case 'killed':
              debug('kill %s (%s) at %s', script, id, hostname);
              clearTimeout(timeout);
              deleteProcess();
              return resolve();
          }
        });

        if (run.timeout != 0) {
          timeout = setTimeout(() => {
            timedout = true;
            debug('kill timeout %s (%s) at %s', script, id, hostname);
            this.killProcess(id, null, true);
            reject(new Error('Timeout of ' + wait + 'ms exceeded'));
          }, wait);
        }
      }

      this.socket.emit(this.id, {
        action: 'kill',
        id: proc.id
      });

      if (fireAndForget) {
        deleteProcess();
        return resolve();
      }
    });
  }

  _connectClient() {
    return new Promise((resolve, reject) => {
      let onConnectError = err => reject(unhideError(err));
      let onRunningError = err => this.emit('error', unhideError(err));
      let unhideError = (err) => {
        if (err.description instanceof Error == true) {
          return err.description;
        }
        return err;
      };

      let onConnectTimeout = () => {
        reject(new Error(
          util.format(
            'Timeout connecting to %s:%s',
            this.host, this.port
          )
        ));
      };

      let onConnect = () => {
        debug('connected');
        this.connected = true;
      }

      let onDisconnect = () => {
        debug('disconnected');
        this.connected = false;

        // TODO: Reconnect strategys.
        // A more friendly one.
        // This one is intended for tests where there is no point
        // in continuing if server is "gone".
        if (this.procs.length > 0) {
          var message = util.format(
            'Disconnected from %s while processes running. ' +
            'Processes will be killed automatically at server.',
            this.hostname
          );

          // server kills all this client's children when
          // socket disconnects.
          this.procs.length = 0;
          // this.emit('error', new Error(message));
          console.error(new Error(message));
        }

        // resolves/rejects only call is not already called
        reject(new Error('StartleClient disconnected or bad token'));
      }

      let url = util.format(
        'wss://%s:%d?token=%s',
        this.host,
        this.port,
        this.token
      );

      debug('connecting to %s', url);

      this.socket = socketIO(url, {
        rejectUnauthorized: this.rejectUnauthorized,
        transports: this.transports,
        reconnection: false
      });

      this.socket.on('connect_error', onConnectError);
      this.socket.on('connect_timeout', onConnectTimeout);
      this.socket.on('error', onRunningError);
      this.socket.on('connect', onConnect);
      this.socket.on('disconnect', onDisconnect);

      this.socket.on('info', info => {
        debug('in groups [%s]', info.groups.join(', '));
        debug('id %s', info.id);
        this.id = info.id;
        this.hostname = info.hostname;
        this.groups = info.groups;
        resolve();
      });
    });
  }

  _validate() {
    if (!this.token) {
      throw new Error('Missing [opts.token]');
    }
  }

}
