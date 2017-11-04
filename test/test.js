const expect = require('expect.js');
const { resolve } = require('path');
const { StartleServer, StartleAgent } = require('..');

describe('test', function () {

  var server;
  var agent;

  var pause = function (time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  before('start server', async function () {
    server = await StartleServer.create({
      path: resolve(__dirname, '..'),
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

  context('start', function () {

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

  context('stop', function () {

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

  context('kill', function () {

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

  context('messages', function () {

    it('can send and receive messages');

  });

  context('multiple with groups', function () {

    it('spreads according to specified group');

    it('spreads according to unspecified group');

    it('errors if no group match');

  });

});
