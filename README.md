[![npm](https://img.shields.io/npm/v/startle.svg)](https://www.npmjs.com/package/startle)[![Build Status](https://travis-ci.org/nomilous/startle.svg?branch=master)](https://travis-ci.org/nomilous/startle)[![Coverage Status](https://coveralls.io/repos/github/nomilous/startle/badge.svg?branch=master)](https://coveralls.io/github/nomilous/startle?branch=master)

# startle

Client and Server agents for starting, stopping and messaging remote scripts.

Intended primarily for use in capacity testing distributed applications where processes spanning multiple servers are required. Remote processes can be started, stopped and communicated with via a single test script running on one developer workstation. 

See also [netrix](https://www.npmjs.com/package/netrix) for easily collecting metrics from the running test.



* The timeout thing...



```
npm install startle --save-dev
```

```javascript
const startle = require('startle');
```



# Startle Server

Each host upon which scripts are to be run needs a running startle server. This can be found at `node_modules/.bin/startle` if not installed globally. 

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





# Remote Script API

These methods are used in the scripts installed on each host running the StartleServer. They will be called upon remotely to start/stop by the [controlling process](controlling-process-api).

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

Example:

```javascript
startle.onStart((opts, done) => {
  // start the service and call done once it's up.
  done();
});

startle.onStop((opts, done) => {
  // stop the service and call done once it's down.
  done();
});

startle.on('switch-mode', function (newMode) {
  // do something
  startle.send('switch-mode-done');
});
```





# Controlling Process API

These methods are used in the test script running on your workstation. They allow for spawning, terminating and interacting with all the [remote script](remote-script-api) processes at all the hosts running the StartleServer.

### startle.createAgent(connections[, defaults])

* `connections` \<Array of Objects> Connection parameters of StartleServer(s) to connect to.
* `defaults` \<Object> Defaults to apply across `connections` array.
* Returns \<Promise> Resolves with a connected instance of [class starle.StartleAgent](class-startlestartleagent)

Create an agent connected to all StartleServers for remote controlling processes at each.

Each parameters item in the `connections` array contains:

* `token` \<string> Required. The security token with which the server was initialised.
* `host` \<string> Hostname or ipaddress where the server is listening.
* `port` \<number> Server's port.
* `rejectUnauthorized` \<boolean> Set true if the server is using self-signed cert.

Example (mocha, ES6):

```javascript
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
  
  agent = await startle.createAgent(connections, defaults)
});

after('stop agent', async function () {
  await agent.destroy();
});
```

Example (mocha, ES5):

```javascript
var agent;

before('start agent', function() {
  // var...
  return startle.createAgent(connections, defaults)
    .then(function (_agent) {
      agent = _agent;
    });
});

after('stop agent', function () {
  return agent.destroy();
});
```



## class startle.StartleAgent

### new startle.StartleAgent(connections[, defaults]) 

See [startle.createAgent(connections[, defaults])](startlecreateagentconnections-defaults)

