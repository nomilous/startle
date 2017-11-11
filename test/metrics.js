const expect = require('expect.js');
const path = require('path');
const { StartleServer, StartleAgent } = require('..');

describe('metrics', function () {

  var servers;
  var agent;
  var procs;

  before('start servers', async function () {
    servers = await Promise.all([
      StartleServer.create({
        path: path.resolve(__dirname, '..'),
        port: 59590,
        token: 'XXX'
      }),
      StartleServer.create({
        path: path.resolve(__dirname, '..'),
        port: 59591,
        token: 'XXX'
      })
    ]);
  });

  before('start agent', async function () {
    agent = await StartleAgent.create([
      { port: 59590 },
      { port: 59591 }
    ], {
      rejectUnauthorized: false,
      token: 'XXX'
    });
  });

  before('start procs', async function () {
    procs = await Promise.all([
      agent.start('test/procs/metrics'),
      agent.start('test/procs/metrics'),
      agent.start('test/procs/metrics'),
      agent.start('test/procs/metrics')
    ])
  });

  after('stop procs', async function () {
    if (!procs) return;
    await Promise.all(procs.map(proc => proc.stop()));
  });

  after('stop agent', async function () {
    if (!agent) return;
    await agent.destroy();
  });


  after('stop servers', async function () {
    if (!servers) return;
    await Promise.all(servers.map(server => server.destroy()));
  });

  it('collects metrics', function (done) {
    this.timeout(0);
    var collected;

    const onMetrics = (timestamp, metrics) => {
      collected = metrics;
    }

    agent.on('metrics', onMetrics);

    setTimeout(() => {
      agent.removeListener('metrics', onMetrics);
      expect(collected.counters.counter_name).to.be.greaterThan(100);
      expect(collected.gauges.gauge_name).to.be(0.5);
      expect(collected.gauges.any).to.be(4); // 4 processes in group any
      done();
    }, 2000);

  });

});
