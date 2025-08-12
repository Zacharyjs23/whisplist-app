let telemetry = null;
function emit(level, args) {
  let meta;
  const last = args[args.length - 1];
  if (last && typeof last === 'object' && ('userId' in last || 'severity' in last)) {
    meta = args.pop();
  }
  if (telemetry) {
    try {
      telemetry(level, meta, ...args);
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
