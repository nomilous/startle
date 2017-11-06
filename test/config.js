const expect = require('expect.js');
const path = require('path');
const startle = require('..');
const { StartleServer, StartleAgent } = require('..');

describe('config', function () {

  var server;
  var agent;

  before('start server', async function () {
    server = await StartleServer.create({
      path: path.resolve(__dirname, '..'),
      token: 'XXX'
    });
  });

  before('start agent', async function () {
    agent = await startle.createAgent({
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

  it('supports process start opts as function', async function () {
    var optsFn = (opts) => {
      return {
        x: opts.sequence
      }
    }

    var proc1 = await agent.start('test/procs/ok', optsFn);
    var proc2 = await agent.start('test/procs/ok', optsFn);

    expect(agent.servers[0].procs[0].opts).to.eql({x: 0});
    expect(agent.servers[0].procs[1].opts).to.eql({x: 1});

    await proc1.stop();
    await proc2.stop();
  });

  it('supports mixed agent start opts', function () {

    var agent1 = new StartleAgent({port: 1}, {token: 'XXX'});
    var agent2 = new StartleAgent([{port: 1},{port: 2}], {token: 'XXX'});

    expect(agent1.connections).to.eql([{port: 1, token: 'XXX'}]);
    expect(agent2.connections).to.eql([{
      port: 1,
      token: 'XXX'
    }, {
      port: 2,
      token: 'XXX'
    }]);


  });
});
