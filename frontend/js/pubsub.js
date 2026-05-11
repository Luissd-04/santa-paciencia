(function () {
  const events = {};

  function on(event, callback) {
    if (!events[event]) events[event] = [];
    events[event].push(callback);
    return function off() {
      events[event] = events[event].filter(cb => cb !== callback);
    };
  }

  function emit(event, data) {
    (events[event] || []).forEach(cb => cb(data));
  }

  function off(event, callback) {
    if (!events[event]) return;
    events[event] = events[event].filter(cb => cb !== callback);
  }

  window.PubSub = { on, emit, off };
})();
