export type TelemetryFn = (level: 'log' | 'warn' | 'error', ...args: any[]) => void;

let telemetry: TelemetryFn | null = null;

export function setTelemetry(fn: TelemetryFn) {
  telemetry = fn;
}

function emit(level: 'log' | 'warn' | 'error', args: any[]) {
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

export const log = (...args: any[]) => emit('log', args);
export const warn = (...args: any[]) => emit('warn', args);
export const error = (...args: any[]) => emit('error', args);
