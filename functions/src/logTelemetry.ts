import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import type { Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';

type TelemetryLevel = 'log' | 'warn' | 'error';

const sanitizeLevel = (value: unknown): TelemetryLevel => {
  if (value === 'warn') return 'warn';
  if (value === 'error') return 'error';
  return 'log';
};

const bearerToken = (header: string | null | undefined): string | null => {
  if (!header) return null;
  const match = header.match(/\s*Bearer\s+(.*)$/i);
  return match && match[1] ? match[1].trim() : null;
};

const verifyRequest = async (
  req: Request,
): Promise<DecodedIdToken | null> => {
  const token = bearerToken(req.header('authorization'));
  if (!token) {
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    functions.logger.warn('Telemetry request token verification failed', err);
    return null;
  }
};

export const logTelemetry = functions.https.onRequest(async (req: Request, res: Response) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const decoded = await verifyRequest(req);
    if (!decoded) {
      res.status(401).send('Unauthorized');
      return;
    }

    const { level, message, meta, timestamp } = (req.body ?? {}) as Record<string, unknown>;
    const logLevel = sanitizeLevel(level);
    const safeMessage =
      typeof message === 'string'
        ? message
        : (() => {
            try {
              return JSON.stringify(message ?? '');
            } catch {
              return String(message ?? '');
            }
          })();

    const metaObject =
      meta && typeof meta === 'object'
        ? { ...(meta as Record<string, unknown>), uid: decoded.uid }
        : { uid: decoded.uid };

    const isoTimestamp = (() => {
      const numeric = typeof timestamp === 'number' ? timestamp : toNumber(timestamp);
      if (numeric) return new Date(numeric).toISOString();
      return new Date().toISOString();
    })();

    const payload = {
      message: safeMessage,
      meta: metaObject,
      timestamp: isoTimestamp,
    };

    switch (logLevel) {
      case 'warn':
        functions.logger.warn(payload);
        break;
      case 'error':
        functions.logger.error(payload);
        break;
      default:
        functions.logger.log(payload);
    }

    res.json({ ok: true });
  } catch (err) {
    functions.logger.error('Failed to record telemetry', err);
    res.status(500).json({ error: 'Failed to record telemetry' });
  }
});

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
