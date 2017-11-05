const expect = require('expect.js');
const path = require('path');
const { StartleServer, StartleAgent } = require('..');

describe('group', function () {

  var server1, server2, server3, server4, server5, agent;

  before('start servers', async function () {
    server1 = await StartleServer.create({
      path: path.resolve(__dirname, '..'),
      groups: ['right'],
      token: 'XXX',
      port: 59590
    });
    server2 = await StartleServer.create({
      path: path.resolve(__dirname, '..'),
      groups: ['right', 'wrong'],
      token: 'XXX',
      port: 59591
    });
    server3 = await StartleServer.create({
      path: path.resolve(__dirname, '..'),
      groups: ['wrong'],
      token: 'XXX',
      port: 59592
    });
    server4 = await StartleServer.create({
      path: path.resolve(__dirname, '..'),
      groups: ['right'],
      token: 'XXX',
      port: 59593
    });
    server5 = await StartleServer.create({
      path: path.resolve(__dirname, '..'),
      groups: ['wrong'],
      token: 'XXX',
      port: 59594
    });
  });

  before('start agent', async function () {
    agent = await StartleAgent.create([{
      rejectUnauthorized: false,
      token: 'XXX',
      port: 59590
    }, {
      rejectUnauthorized: false,
      token: 'XXX',
      port: 59591
    }, {
      rejectUnauthorized: false,
      token: 'XXX',
      port: 59592
    }, {
      rejectUnauthorized: false,
      token: 'XXX',
      port: 59593
    }, {
      rejectUnauthorized: false,
      token: 'XXX',
      port: 59594
    }]);
  });

  after('stop agent', async function () {
    if (agent) await agent.destroy();
  });

  after('stop server', async function () {
    if (server1) await server1.destroy();
    if (server2) await server2.destroy();
    if (server3) await server3.destroy();
    if (server4) await server4.destroy();
    if (server5) await server5.destroy();
  });


  it('spreads onto servers according to process group', async function () {
    this.timeout(10000);
    var procs = [];

    for (var i = 0; i < 7; i++) {
      procs.push(await agent.start({
        script: 'test/procs/ok',
        group: 'right'
      }));
    }

    expect(agent.servers[0].procs.length).to.be(3);
    expect(agent.servers[1].procs.length).to.be(2);
    expect(agent.servers[2].procs.length).to.be(0);
    expect(agent.servers[3].procs.length).to.be(2);
    expect(agent.servers[4].procs.length).to.be(0);

    for (var i = 0; i < 7; i++) {
      await procs[i].stop();
    }
  });

  it('errors if no group match', async function () {
    try {
      await agent.start({
        script: 'test/procs/ok',
        group: 'group'
      });
    } catch (e) {
      expect(e.message).to.match(/No servers in group/);
      return;
    }
    throw new Error('missing error');
  });

});
