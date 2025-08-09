jest.mock('@/shared/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
