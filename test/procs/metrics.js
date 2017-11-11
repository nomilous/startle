const startle = require('../..');
var interval;

startle.onStart(async opts => {
  interval = setInterval(() => {
    startle.gauge('gauge_name', 0.5);
    startle.increment('counter_name');
  }, 20);

});

startle.onStop(async opts => {
  clearInterval(interval);
});
