let telemetry = null;
function emit(level, args) {
  if (telemetry) {
    try {
      telemetry(level, ...args);
    } catch {
      // ignore telemetry errors
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    console[level](...args);
  }
}
module.exports = {
  setTelemetry: (fn) => {
    telemetry = fn;
  },
  log: (...args) => emit('log', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args),
};
