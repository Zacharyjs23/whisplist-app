describe('redirectValidation helpers', () => {
  const loadModule = () =>
    // Re-require each time so env-driven configuration is rebuilt per test
    require('../functions/src/redirectValidation') as typeof import('../functions/src/redirectValidation');

  const resetEnv = () => {
    delete process.env.ALLOWED_REDIRECT_HOSTS;
    delete process.env.ALLOWED_INSECURE_REDIRECT_HOSTS;
    delete process.env.ALLOWED_REDIRECT_SCHEMES;
  };

  beforeEach(() => {
    jest.resetModules();
    resetEnv();
  });

  afterAll(() => {
    resetEnv();
  });

  it('allows default https hosts', () => {
    const { assertValidRedirectUrl } = loadModule();
    expect(
      assertValidRedirectUrl('https://whisplist.app/success', 'successUrl'),
    ).toBe('https://whisplist.app/success');
  });

  it('rejects unknown https hosts', () => {
    const { assertValidRedirectUrl, RedirectUrlError } = loadModule();
    expect(() =>
      assertValidRedirectUrl('https://example.org', 'successUrl'),
    ).toThrow(RedirectUrlError);
  });

  it('allows localhost http redirects by default', () => {
    const { assertValidRedirectUrl } = loadModule();
    expect(
      assertValidRedirectUrl('http://localhost:3000/path', 'cancelUrl'),
    ).toBe('http://localhost:3000/path');
  });

  it('supports custom https hosts defined via env', () => {
    process.env.ALLOWED_REDIRECT_HOSTS = 'example.org, another.domain';
    const { assertValidRedirectUrl } = loadModule();
    expect(
      assertValidRedirectUrl('https://example.org/path', 'successUrl'),
    ).toBe('https://example.org/path');
  });

  it('guards custom schemes unless explicitly allowed', () => {
    const { assertValidRedirectUrl, RedirectUrlError } = loadModule();
    expect(() => assertValidRedirectUrl('myapp://route', 'successUrl')).toThrow(
      RedirectUrlError,
    );

    jest.resetModules();
    process.env.ALLOWED_REDIRECT_SCHEMES = 'myapp';
    const moduleWithCustomScheme = loadModule();
    expect(
      moduleWithCustomScheme.assertValidRedirectUrl(
        'myapp://route',
        'successUrl',
      ),
    ).toBe('myapp://route');
  });
});
