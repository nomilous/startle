const startle = require('../..');
var interval;

startle.onStart(function (opts, done) {

  interval = setInterval(() => {}, 1000);
  done();

  startle.on('message-name', (arg1, arg2) => {

    arg1++;
    arg2.value++;
    startle.send('message-name-reply', arg1, arg2);

  });

});

startle.onStop(function (opts, done) {

  clearInterval(interval);
  done();

});
