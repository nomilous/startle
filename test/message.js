const expect = require('expect.js');
const path = require('path');
const { StartleServer, StartleAgent } = require('..');

describe('message', function () {

  var server;
  var agent;

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

  it('can send and receive messages', function (done) {
    var proc;
    agent.start('test/procs/message')
      .then(_proc => {
        proc = _proc;
        return new Promise((resolve, reject) => {
          proc.send('message-name', 1, { value: 1 });
          proc.on('message-name-reply', (arg1, arg2) => {
            expect(arg1).to.be(2);
            expect(arg2).to.eql({ value: 2 });
            resolve();
          });
        });
      })
      .then(() => {
        return proc.stop();
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

});
