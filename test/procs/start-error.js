const startle = require('../..');
var interval;

startle.onStart(function (opts, done) {

  interval = setInterval(() => {}, 1000);
  done(new Error('Start error'));

});
