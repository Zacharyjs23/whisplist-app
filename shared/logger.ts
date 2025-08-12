export type TelemetryMeta = {
  userId?: string;
  severity?: string;
};

export type TelemetryFn = (
  level: 'log' | 'warn' | 'error',
  meta: TelemetryMeta | undefined,
  ...args: any[]
) => void;

let telemetry: TelemetryFn | null = null;

export function setTelemetry(fn: TelemetryFn) {
  telemetry = fn;
}

function emit(level: 'log' | 'warn' | 'error', args: any[]) {
  let meta: TelemetryMeta | undefined;
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

export const log = (...args: any[]) => emit('log', args);
export const warn = (...args: any[]) => emit('warn', args);
export const error = (...args: any[]) => emit('error', args);
