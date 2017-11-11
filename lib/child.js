var gotStop = false;
var metricsInterval;
var metrics = {
  counters: {},
  gauges: {}
};

module.exports.start = (fn, emitter) => {
  var promised = false;
  var doneCount = 0;

  var done = error => {
    doneCount++;

    if (promised && doneCount > 1) return;

    if (error && error instanceof Error) {
      return process.send({
        action: 'startError',
        name: error.name,
        message: error.message
      });
    }

    metricsInterval = setInterval(() => {
      process.send({
        action: 'metrics',
        metrics: metrics
      });
      metrics.counters = {};
      metrics.gauges = {};
    }, 200);

    process.send({
      action: 'started'
    });
  };

  process.on('message', message => {
    var result;

    switch (message.action) {
      case 'start':
        result = fn(message.opts, done);
        if (result && typeof result.then == 'function' &&
          typeof result.catch == 'function') {
          promised = true;
          result.then(done).catch(done);
        }
        return;

      case 'message':
        emitter.emit.apply(emitter, message.args);
        return;

      case 'stop':
        if (gotStop) return;
        process.send({
          action: 'stopError',
          name: 'Error',
          message: 'Child missing onStop()'
        });
        return;
    }
  });
};


module.exports.stop = fn => {
  var promised = false;
  var doneCount = 0;

  var done = error => {
    doneCount++;

    if (promised && doneCount > 1) return;

    if (error && error instanceof Error) {
      return process.send({
        action: 'stopError',
        name: error.name,
        message: error.message
      });
    }

    process.removeAllListeners('message');
  };

  gotStop = true;

  process.on('message', message => {
    var result;

    if (message.action == 'stop') {
      clearInterval(metricsInterval);

      result = fn(message.opts, done);

      if (result && typeof result.then == 'function' &&
        typeof result.catch == 'function') {
        promised = true;
        result.then(done).catch(done);
      }
    }
  });
};

module.exports.send = (event, ...args) => {
  args.unshift(event);

  if (event == 'exit') throw new Error('cannot send exit event');

  try {
    process.send({
      action: 'message',
      args: args
    });
  } catch (error) {
    // parent is gone
  }
}

module.exports.increment = (counterName, value) => {
  if (typeof value == 'undefined') value = 1;
  metrics.counters[counterName] = metrics.counters[counterName] || 0;
  metrics.counters[counterName] += value;
}

module.exports.gauge = (gaugeName, value) => {
  metrics.gauges[gaugeName] = metrics.gauges[gaugeName] || {count: 0, total: 0};
  metrics.gauges[gaugeName].count++;
  metrics.gauges[gaugeName].total += value;
}
