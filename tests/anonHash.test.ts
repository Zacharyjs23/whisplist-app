jest.mock('@/services/installations', () => ({
  getInstallationId: jest.fn().mockResolvedValue('install-1234'),
}));

const { getInstallationId } = require('@/services/installations');

describe('getAnonDeviceHash', () => {
  const loadModule = () => {
    jest.resetModules();
    return require('@/helpers/anonHash') as typeof import('@/helpers/anonHash');
  };

  it('returns deterministic hash for same salt', async () => {
    const { getAnonDeviceHash } = loadModule();
    const hash1 = await getAnonDeviceHash('salt-a');
    const hash2 = await getAnonDeviceHash('salt-a');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different hash when salt changes', async () => {
    const mod = loadModule();
    const hash1 = await mod.getAnonDeviceHash('salt-a');
    const hash2 = await mod.getAnonDeviceHash('salt-b');
    expect(hash1).not.toBe(hash2);
  });

  it('recomputes when the underlying installation id changes', async () => {
    const mod = loadModule();
    const hash1 = await mod.getAnonDeviceHash('salt-a');
    (getInstallationId as jest.Mock).mockResolvedValueOnce('install-9999');
    const hash2 = await mod.getAnonDeviceHash('salt-b');
    expect(hash1).not.toBe(hash2);
  });
});
