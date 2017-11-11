const expect = require('expect.js');
const path = require('path');
const { StartleServer, StartleAgent } = require('..');

describe('disconnect', function () {

  var server;
  var agent;

  function pause(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  before('start server', async function () {
    server = await StartleServer.create({
      path: path.resolve(__dirname, '..'),
      token: 'XXX'
    });
  });

  before('start agent', async function () {
    agent = await StartleAgent.create({
      rejectUnauthorized: false,
      token: 'XXX'
    });
  });

  after('stop agent', async function () {
    if (!agent) return;
    await agent.destroy();
  });

  after('stop server', async function () {
    if (!server) return;
    await server.destroy();
  });

  before(function () {
    this.consoleError = console.error;
  });

  after(function () {
    console.error = this.consoleError;
  });

  it('logs error from client if disconnect while processes running',
    async function () {
      // and kill processes on server
      var message;
      // agent.on('error', err => error = err);
      var proc = await agent.start('test/procs/ok');
      var pid = server.sockets[0].procs[0].child.pid;

      console.error = msg => message = msg;

      await server.destroy();
      await pause(200);

      // expect(error.message).to.match(/^Disconnected from/);
      // expect(agent.servers[0].procs.length).to.be(0);
      // expect(server.sockets.length).to.be(0);

      // reconnect
      // await server.start();
      // await agent.connect();

      expect(message).to.match(/Disconnected from/);

      try {
        process.kill(pid, 0);
      } catch (e) {
        // good, no such process
        return;
      }
      throw new Error('child still present');
    }
  );


});
