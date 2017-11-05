const expect = require('expect.js');
const path = require('path');
const { StartleServer, StartleAgent } = require('..');

describe('stop', function () {

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

  it('stops the remote process', async function () {
    var proc = await agent.start('test/procs/ok');
    await proc.stop(null, { stop: 'opts' });
    expect(agent.servers[0].procs.length).to.be(0);
    expect(server.sockets[0].procs.length).to.be(0);
  });

  it('cleans up on stop timeout', async function () {
    var proc = await agent.start('test/procs/ok');
    try {
      await proc.stop({ timeout: 1 });
    } catch (e) {
      await pause(200);
      expect(e.message).to.be('Timeout of 1ms exceeded');
      expect(agent.servers[0].procs.length).to.be(0);
      expect(server.sockets[0].procs.length).to.be(0);
      return;
    }
    throw new Error('missing error');
  });

  it('cleans up on stop error', async function () {
    var proc = await agent.start('test/procs/stop-error');
    try {
      await proc.stop();
    } catch (e) {
      await pause(200);
      expect(e.message).to.be('Stop error');
      expect(agent.servers[0].procs.length).to.be(0);
      expect(server.sockets[0].procs.length).to.be(0);
      return;
    }
    throw new Error('missing error');
  });

});
