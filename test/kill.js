const expect = require('expect.js');
const path = require('path');
const { StartleServer, StartleAgent } = require('..');

describe('kill', function () {

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

  it('kills the remote process', async function () {
    var proc = await agent.start('test/procs/ok');
    var pid = server.sockets[0].procs[0].child.pid;
    await proc.kill();
    expect(agent.servers[0].procs.length).to.be(0);
    expect(server.sockets[0].procs.length).to.be(0);
    try {
      process.kill(pid, 0);
    } catch (e) {
      // process is gone
      return;
    }
    throw new Error('child not gone');
  });

  it('cleans up on kill timeout', async function () {
    var proc = await agent.start('test/procs/ok');
    var pid = server.sockets[0].procs[0].child.pid;
    try {
      await proc.kill({ timeout: 1 });
    } catch (e) {
      await pause(200);
      expect(e.message).to.be('Timeout of 1ms exceeded');
      expect(agent.servers[0].procs.length).to.be(0);
      expect(server.sockets[0].procs.length).to.be(0);
      return;
    }
    throw new Error('missing error');
  });

});
