[![npm](https://img.shields.io/npm/v/startle.svg)](https://www.npmjs.com/package/startle)[![Build Status](https://travis-ci.org/nomilous/startle.svg?branch=master)](https://travis-ci.org/nomilous/startle)[![Coverage Status](https://coveralls.io/repos/github/nomilous/startle/badge.svg?branch=master)](https://coveralls.io/github/nomilous/startle?branch=master)

# startle

Client and Server agents for starting, stopping and messaging remote scripts.

Intended primarily for use in capacity testing distributed applications where processes spanning multiple servers are required. Remote processes can be started, stopped, instrumented and communicated with via a single test script running on one developer workstation. 

See also [netrix](https://www.npmjs.com/package/netrix) for easily collecting metrics from the running test.



```
npm install startle --save-dev
```



# Startle Server

Each host upon which scripts are to be run needs a running Startle Server. This can be found at `node_modules/.bin/startle` if not installed globally. 

```
// on hosts 1 through 10
startle run-server --path . --token sEcrEt --group servers --debug

// on hosts 11 through x
startle run-server --path . --token sEcrEt --group clients --debug
```

* `path` Must point to the root of the clone of the repo housing the scripts to be called upon remotely.
* `token` A security token for the websocket/https server.
* `group` Used by the controlling process to direct specific processes to only spawn at specific servers.

The server runs a websocket (socket.io) over an https server. A self-signed ssl keys and certs are auto generated unless paths for the keys are provided.

See `startle —help` and `startle run-server —help`.

The cli wraps an instance of the [StartleServer](#class-startleserver) class.



# Remote Script API

```javascript
const startle = require('startle');
```

These methods are used in the scripts installed on each host running the Startle Server. They will be called upon remotely to start/stop by the [controlling process](#controlling-process-api).

### startle.onStart(handler)

- `handler` \<Function> Handler to run when this script is called to start.

### startle.onStop(handler)

- `handler` \<Function> Handler to run when this script is called to stop.

### startle.on(eventName, handler)

- `eventName` \<string> Event name as sent from the controlling process.
- `handler` \<Function>

Subscribe to receive events from the controlling process.

### startle.send(eventName[, …args])

- `eventName` \<string> Event name to send to the controlling process.
- `…args` 

Remote scripts can be instrumented by incrementing counters and setting gauges. These metrics are aggregated (per second) and emitted at the Controlling Process. 

### startle.increment(counterName)

* `counterName` \<string> Increment an instrumentation counter.

### startle.gauge(gaugeName, value)

* `gaugeName` \<string> The gauge to set.
* `value` \<number> The value

##### Example1

```javascript
startle.onStart((opts, done) => {
  // start the service and call done once it's up.
  done();
});

startle.onStop((opts, done) => {
  // stop the service and call done once it's down.
  done();
});

startle.on('ping', function (timbre) { 
  startle.send('pong', {assentionRate: 777});
});
```

```javascript
// anywhere in the remote script
const {increment, gauge} = require('startle');

increment('counter_name');
gauge('gauge_name', 3.14);
```





# Controlling Process API

These methods are used in the test script running on your workstation. They allow for spawning, terminating and interacting with all the [remote script](#remote-script-api) processes at all the hosts running the StartleServer.

### startle.createAgent(connections[, defaults])

* `connections` \<Object> Connection parameters (or Array of connection parameters) of StartleServer(s) to connect to.
  * `token` \<string> Required. The security token with which the server was initialised.
  * `host` \<string> Hostname or ipaddress where the server is listening.
  * `port` \<number> Server's port.
  * `rejectUnauthorized` \<boolean> Set true if the server is using self-signed cert.
* `defaults` \<Object> Defaults to apply across `connections` array.
* Returns \<Promise> Resolves with a connected instance of [class StartleAgent](#class-startleagent)

Create an agent connected to all StartleServers for remote controlling processes at each. 

##### Example2

```javascript
// (mocha, ES6)
var agent;

before('start agent', async function () {
  var connections = [{
    host: '172.34.1.32',
    // token: 'sEcrEt',
    // rejectUnauthorized: false,
  }, {
    host: '172.34.1.32',
    // token: 'sEcrEt',
    // rejectUnauthorized: false,
  }, {
    host: '172.34.1.32',
    // token: 'sEcrEt',
    // rejectUnauthorized: false
  }];
  
  var defaults = {
    token: 'sEcrEt',
    rejectUnauthorized: false
  }
  
  agent = await startle.createAgent(connections, defaults);
  
  agent.on('metrics', (timestamp, metrics) => {
    // use metrics collected from remote processes
  });
});

after('stop agent', async function () {
  if (agent) await agent.destroy();
});
```

##### Example3

```javascript
// (mocha, ES5)
var agent;

before('start agent', function() {
  // var...
  return startle.createAgent(connections, defaults)
    .then(function (_agent) {
      agent = _agent;
    });
});

after('stop agent', function () {
  if (!agent) return;
  return agent.destroy();
});
```





## class StartleAgent

```javascript
const { StartleAgent } = require('startle');
```

Agent interface for connecting to multiple [Startle Servers](#startle-server) and spawning processes on each.

### new StartleAgent(connections[, defaults]) 

* `connections` \<Object> Same as `startle.createAgent()`
* `defaults` \<Object> Same as `startle.createAgent()`
* Returns \<StartleAgent>

**Used internally.**  See [startle.createAgent(connections[, defaults])](#startlecreateagentconnections-defaults).

`StartleAgent` is an EventEmitter and emits the following events:

### Event: 'metrics'

* `timestamp` \<number> EPOCH Milliseconds.
* `metrics` \<Object>
  * `counters` \<Object> Aggregated counter values.
  * `gauges` \<Object> Aggregated guage values including count or processes by group name.

Emitted every second with instrumentaion data collected from all remote processes using the `startle.increment()` and `startle.gauge()` functions. 

### agent.connect()

* Returns \<Promise> Resolves with the agent instance.

Connects to all Startle Servers passes into the `connections`  parameter of the constructor.

**Used internally.**  See [startle.createAgent(connections[, defaults])](#startlecreateagentconnections-defaults).

### agent.destroy()

* Returns \<Promise>

Disconnects from all Startle Servers. 

See example in [mocha after hook](#example3).

This method is typically run in an "after hook" and should only be run once all remote processes have been stopped. See [startleProcess.stop([localOpts]\[, opts])](#startleprocessstoplocalopts-opts). If it runs when remote processes are still busy an error is logged to console. Note that the Startle Server will terminate any stray processes on the disconnection anyway.

### agent.reset()

Resets metrics. Removes all counters and gauges.

### agent.start(script[, opts])

* `script` \<string || Object> Path of the remote script to run. Or object containing:
  * `script` \<string> Required. Path of the remote script to run.
  * `group` \<string> The server group within which to run the script.
  * `timeout` \<number> Timeout waiting for script to start. Default 10 seconds.
* `opts` \<Object || Function> Options to pass to the remote script's onStart handler.
* Returns \<Promise> Resolves with running instance if [class StartleProcess](#class-startleprocess)

The `script` parameter must contain the script's path relative to the remote repo root as passed to the Startle Server.

##### Example5

```
// at remote
startle run-server --path /home/you/git_repos/repo-name
```

```javascript
// in local test will start remote script at path:
// /home/you/git_repos/repo-name/test/procs/some-script.js
agent.start('test/procs/some-script').then...
```

Specifying the `group` allows for the starting of multiple scripts that will be spread evenly across all Startle Servers that were started with that group name.

**Important:** In hooks and tests the mocha timeout should be disabled because the `agent.start()` method will not know when the test of hook times out and will continue in the background. Instead the 

##### Example6

```javascript
var servers;

before('start 10 servers', async function () {
  this.timeout(0); // !must! allow agent.start() to handle timeout
  
  var promises = [];
  for (var i = 0; i < 10; i++) {
    promises.push(agent.start({
      script: 'test/procs/cluster-server',
      group: 'servers', // spread across all servers in this group
      timeout: 10000    // the default timeout
    }));
  }
  
  servers = await Promise.all(promises)
});

after('stop servers', async function () {
  this.timeout(0);
  await Promise.all(servers.map(server => server.stop()));
});

```

The `opts` are passed to the remote script's onStart handler ([Example1](#example1)). `opts` can either be an Object or a Function. The function will be run locally to generate the `opts` that will be passed to the remote server. The function is passed a `state` containing details of all the processes already started arranged by `group` as well as the `count` of processes already present in the given group and the `target` server where the process will be started.

##### Example7

```javascript
// opts as object

agent.start('test/procs/cluster-client', {opt: 'ions'})


// opts as function

agent.start('test/procs/cluster-server', function (state) {
  // return an object to become the [opts]
  return {
    // eg. only the first server started seeds the cluster
    seedTheCluster: state.count == 0
  }
})
```

## class StartleProcess

### new StartleProcess(opts) 

**Used internally.**

### startleProcess.hostname

The hostname of the server where this process was started.

### startleProcess.address

The first public IP address of the server where this process was started.

### startleProcess.run

The run options passed to this process.

### startleProcess.opts

The script start opts passed to this process.

### startleProcess.state

`starting`, `running`, `stopping`, `killing`, `ended`

### startleProcess.timestamp

The state's timestamp.

### startleProcess.stop([localOpts]\[, opts])

* `localOpts`
  * `timeout` \<number> Timeout for stop. Default 10 seconds.
* Returns \<Promise> Waits for stop confirmation from the remote server.

Stop the remote process cleanly. This calls then onStop() handler in the remote script and passes`opts` to it  ([Example1](#example1)). The handler is expected to tear down the process and it should then exit gracefully. If it does not then some or other resources are not being relinquished. Try `startleProcess.kill()` if all else fails.

See after hook in [Example6](#example6)

**Important:** For stops that take long the mocha timeout should be disabled. Use `localOpts.timeout` argument instead.

### startleProcess.kill([localOpts])

* `localOpts`
  * `timeout` \<number> Timeout for stop. Default 10 seconds.
* Returns \<Promise> Waits for kill confirmation from the remote server.

Kill the remote process.

### startleProcess.send(eventName[, …args])

Send event to the remote process.

### startleProcess.on(eventName, handler)

Subscribe to receive event from the remote process.

##### Example 8

Assume we already have an agent per [Example3](#example3) and spawning process in [Example1](#example1)

```javascript
var remoteProcess; // becomes instance of startleProcess

before('start remote process', function () {
  this.timeout(0);
  return agent.start('test/procs/process1', {op: 'tions'})
    .then(function (rp) {
      remoteProcess= rp;
    })
});

after('stop remote process', function () {
  if (!remoteProcess) return;
  this.timeout(0);
  return remoteProcess.stop({op: 'tions'});
});

it('e.g. sends message to process', function (done) {
  remoteProcess.send('ping', 23);
  remoteProcess.on('pong', function (natureOfPong) {
    // 
  });
});
```



## class StartleServer

```javascript
const { StartleServer } = require('startle');
```

**Used internally.**



## class StartleClient

```javascript
  const { StartleClient } = require('startle');
```

**Used internally.**



##Remote Script API supports async/await 

##### Example9

```javascript
const startle = require('startle');
const Server = require('...');
var server;

startle.onStart(async opts => server = await Server.create(opts));

startle.onStop(async opts => await server.stop(opts));
```

