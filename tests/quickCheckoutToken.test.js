const { TokenService, TokenServiceError } = require('@/services/checkout/tokenService.js');

describe('TokenService', () => {
  let now = 0;
  let service;

  const advance = (ms) => {
    now += ms;
  };

  beforeEach(() => {
    now = 0;
    service = new TokenService({
      ttlMs: 2000,
      skewMs: 50,
      cleanupIntervalMs: 0,
      now: () => now,
      logger: console,
    });
  });

  afterEach(() => {
    service.shutdown();
  });

  it('consumes a token once with atomic guard under concurrency', async () => {
    const { tokenId } = service.issueToken();
    const attempts = Array.from({ length: 100 }, (_, idx) =>
      service.consumeToken(tokenId, { chargeId: `charge-${idx}` }),
    );

    const results = await Promise.allSettled(attempts);
    const successes = results.filter(
      (result) => result.status === 'fulfilled' && result.value.consumed,
    );
    const duplicates = results.filter(
      (result) => result.status === 'fulfilled' && result.value.alreadyConsumed,
    );
    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(99);
    const winner = successes[0].value;
    duplicates.forEach((result) => {
      expect(result.value.chargeId).toBe(winner.chargeId);
    });
  });

  it('rejects expired tokens and marks them expired', async () => {
    const { tokenId } = service.issueToken();
    advance(3000);
    await expect(service.consumeToken(tokenId)).rejects.toThrow(TokenServiceError);
    const record = service.getToken(tokenId);
    expect(record.state).toBe('expired');
  });

  it('returns duplicate response when consuming twice sequentially', async () => {
    const { tokenId } = service.issueToken();
    const first = await service.consumeToken(tokenId, { chargeId: 'charge-1' });
    expect(first.consumed).toBe(true);
    const second = await service.consumeToken(tokenId, { chargeId: 'charge-2' });
    expect(second.alreadyConsumed).toBe(true);
    expect(second.chargeId).toBe(first.chargeId);
    expect(second.consumed).toBe(false);
  });

  it('cleans up expired tokens via cleanupExpired', () => {
    service.issueToken();
    advance(5000);
    service.cleanupExpired();
    expect(service.size()).toBe(0);
  });
});
