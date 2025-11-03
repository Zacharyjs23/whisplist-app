const crypto = require('node:crypto');

class TokenServiceError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'TokenServiceError';
    this.code = code;
  }
}

class TokenService {
  constructor({
    ttlMs = 2 * 60 * 1000,
    skewMs = 5 * 1000,
    cleanupIntervalMs = 60 * 1000,
    now = () => Date.now(),
    logger = console,
  } = {}) {
    this.ttlMs = ttlMs;
    this.skewMs = skewMs;
    this.now = now;
    this.logger = logger;
    this.store = new Map();
    this.locks = new Map();
    this.shutdownHandlers = new Set();
    if (cleanupIntervalMs > 0) {
      this.scheduleCleanup(cleanupIntervalMs);
    }
  }

  log(event, payload) {
    try {
      this.logger.info?.(event, payload);
    } catch {
      // no-op
    }
  }

  scheduleCleanup(intervalMs) {
    const runCleanup = () => {
      this.cleanupExpired();
      const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(intervalMs / 2)));
      const timeout = setTimeout(runCleanup, intervalMs + jitter);
      if (timeout.unref) timeout.unref();
      this.shutdownHandlers.add(() => clearTimeout(timeout));
    };
    const initialTimeout = setTimeout(runCleanup, intervalMs);
    if (initialTimeout.unref) initialTimeout.unref();
    this.shutdownHandlers.add(() => clearTimeout(initialTimeout));
  }

  cleanupExpired() {
    const now = this.now();
    for (const [tokenId, record] of this.store.entries()) {
      if (now > record.expiresAt + this.skewMs) {
        this.log('token.cleanup', {
          token_id: tokenId,
          state: `${record.state}->deleted`,
          charge_id: record.chargeId ?? null,
        });
        this.store.delete(tokenId);
      }
    }
  }

  async withLock(tokenId, fn) {
    const current = this.locks.get(tokenId) ?? Promise.resolve();
    let release;
    const next = new Promise((resolve, reject) => {
      release = async () => {
        try {
          const value = await fn();
          resolve(value);
        } catch (err) {
          reject(err);
        } finally {
          if (this.locks.get(tokenId) === next) {
            this.locks.delete(tokenId);
          }
        }
      };
    });
    this.locks.set(
      tokenId,
      current.finally(() => release()),
    );
    return next;
  }

  issueToken({ tokenId = crypto.randomUUID(), chargeId = null, metadata = {} } = {}) {
    const now = this.now();
    const record = {
      tokenId,
      chargeId,
      metadata,
      state: 'issued',
      createdAt: now,
      expiresAt: now + this.ttlMs,
      consumedAt: null,
    };
    this.store.set(tokenId, record);
    this.log('token.issued', {
      token_id: tokenId,
      state: 'issued',
      charge_id: chargeId,
    });
    return { ...record };
  }

  getToken(tokenId) {
    const record = this.store.get(tokenId);
    return record ? { ...record } : null;
  }

  async consumeToken(tokenId, { chargeId = null } = {}) {
    if (!tokenId) {
      throw new TokenServiceError('invalid_token', 'tokenId is required');
    }

    return this.withLock(tokenId, async () => {
      const record = this.store.get(tokenId);
      if (!record) {
        throw new TokenServiceError('not_found', 'Token does not exist');
      }
      const now = this.now();
      if (now > record.expiresAt + this.skewMs) {
        record.state = 'expired';
        this.store.set(tokenId, record);
        this.log('token.expired', {
          token_id: tokenId,
          state: 'issued->expired',
          charge_id: record.chargeId ?? null,
        });
        throw new TokenServiceError('expired', 'Token has expired');
      }

      if (record.state === 'consumed') {
        this.log('token.consume.duplicate', {
          token_id: tokenId,
          state: 'consumed->consumed',
          charge_id: record.chargeId ?? null,
        });
        return {
          tokenId,
          chargeId: record.chargeId ?? chargeId,
          consumed: false,
          alreadyConsumed: true,
          consumedAt: record.consumedAt,
        };
      }

      const stateBefore = record.state;
      const finalChargeId = chargeId ?? record.chargeId ?? null;
      const consumedAt = now;
      const nextRecord = {
        ...record,
        state: 'consumed',
        chargeId: finalChargeId,
        consumedAt,
      };
      this.store.set(tokenId, nextRecord);
      this.log('token.consume', {
        token_id: tokenId,
        state: `${stateBefore}->consumed`,
        charge_id: finalChargeId,
      });
      return {
        tokenId,
        chargeId: finalChargeId,
        consumed: true,
        alreadyConsumed: false,
        consumedAt,
      };
    });
  }

  size() {
    return this.store.size;
  }

  shutdown() {
    for (const stop of this.shutdownHandlers) {
      try {
        stop();
      } catch {
        // ignore
      }
    }
    this.shutdownHandlers.clear();
    this.locks.clear();
    this.store.clear();
  }
}

module.exports = {
  TokenService,
  TokenServiceError,
};
