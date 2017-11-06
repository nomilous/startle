const startle = require('../..');
var interval;

startle.onStart(function (opts, done) {

  interval = setInterval(() => {
    console.log('running', __filename);
  }, 1000);
  done();

});

startle.onStop(function (opts, done) {

  clearInterval(interval);
  done();

});
