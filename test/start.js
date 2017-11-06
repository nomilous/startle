const expect = require('expect.js');
const path = require('path');
const { StartleServer, StartleAgent } = require('..');

describe('start', function () {

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

  it('errors on missing remote script', async function () {
    try {
      var proc = await agent.start('test/procs/missing');
    } catch (e) {
      expect(e.name).to.be('Error');
      expect(e.message).to.match(/^Missing remote script/);
      expect(agent.servers[0].procs.length).to.be(0);
      expect(server.sockets[0].procs.length).to.be(0);
    }
  });

  it('starts the remote process', async function () {
    var proc = await agent.start('test/procs/ok');
    expect(agent.servers[0].procs.length).to.be(1);
    expect(server.sockets[0].procs.length).to.be(1);
    var pid = server.sockets[0].procs[0].child.pid;

    try {
      process.kill(pid, 0);
    } catch (e) {
      throw new Error('missing child');
    }

    await proc.kill();
  });

  it('cleans up on start timeout', async function () {
    try {
      await agent.start({
        script: 'test/procs/start-timeout',
        timeout: 200
      });
    } catch (e) {
      await pause(200);
      expect(e.message).to.be('Timeout of 200ms exceeded');
      expect(agent.servers[0].procs.length).to.be(0);
      expect(server.sockets[0].procs.length).to.be(0);
    }
  });

  it('cleans up on start error', async function () {
    try {
      await agent.start({
        script: 'test/procs/start-error',
      });
    } catch (e) {
      await pause(200);
      expect(e.message).to.be('Start error');
      expect(agent.servers[0].procs.length).to.be(0);
      expect(server.sockets[0].procs.length).to.be(0);
      return;
    }
    throw new Error('missing error');
  });


});
