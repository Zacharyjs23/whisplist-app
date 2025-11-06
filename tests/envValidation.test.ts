describe('env validation', () => {
  const originalEnv = { ...process.env };

  const setValidEnv = () => {
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY = 'test-api-key';
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = 'auth.test';
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'project-test';
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET = 'bucket-test';
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = 'sender-test';
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID = 'app-test';
    process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID = 'measure-test';
    delete process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION;
  };

  const loadEnvModule = () => {
    let mod: typeof import('../env') | undefined;
    jest.isolateModules(() => {
      mod = require('../env');
    });
    return mod!;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    setValidEnv();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('exports typed env object when configuration is valid', () => {
    const module = loadEnvModule();
    expect(module.env.EXPO_PUBLIC_FIREBASE_API_KEY).toBe('test-api-key');
    expect(module.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION).toBeUndefined();
  });

  it('throws when a required variable is missing', () => {
    const module = loadEnvModule();
    const baseEnv = {
      EXPO_PUBLIC_ENV: 'development',
      EXPO_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'auth.test',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'project-test',
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'bucket-test',
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'sender-test',
      EXPO_PUBLIC_FIREBASE_APP_ID: 'app-test',
      EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: 'measure-test',
      EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: undefined,
    };

    expect(() =>
      module.__test.parseEnv({
        ...baseEnv,
        EXPO_PUBLIC_FIREBASE_API_KEY: undefined,
      } as any),
    ).toThrow(/EXPO_PUBLIC_FIREBASE_API_KEY/);
  });

  it('throws when a required variable is empty', () => {
    const module = loadEnvModule();
    const baseEnv = {
      EXPO_PUBLIC_ENV: 'development',
      EXPO_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'auth.test',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'project-test',
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'bucket-test',
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'sender-test',
      EXPO_PUBLIC_FIREBASE_APP_ID: 'app-test',
      EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: 'measure-test',
      EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: undefined,
    };

    expect(() =>
      module.__test.parseEnv({
        ...baseEnv,
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: '',
      }),
    ).toThrow(/EXPO_PUBLIC_FIREBASE_PROJECT_ID/);
  });
});
