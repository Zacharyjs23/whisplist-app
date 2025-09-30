import { optimizeImageForUpload } from '@/helpers/image';

const manipulator = {
  manipulateAsync: jest.fn(async () => ({ uri: 'file:///optimized.jpg' })),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
};

describe('optimizeImageForUpload', () => {
  beforeAll(() => {
    (globalThis as any).__expoImageManipulatorMock = manipulator;
  });

  afterAll(() => {
    delete (globalThis as any).__expoImageManipulatorMock;
  });

  beforeEach(() => {
    manipulator.manipulateAsync.mockClear();
  });

  test('returns optimized uri when manipulator succeeds', async () => {
    const out = await optimizeImageForUpload('content://image/123', { compress: 0.8, maxWidth: 800 });
    expect(manipulator.manipulateAsync).toHaveBeenCalled();
    expect(out).toBe('file:///optimized.jpg');
  });

  test('falls back to original uri when manipulator throws', async () => {
    const uri = 'file:///path/to/image.jpg';
    manipulator.manipulateAsync.mockRejectedValueOnce(new Error('missing module'));
    const out = await optimizeImageForUpload(uri, { compress: 0.5, maxWidth: 1024 });
    expect(out).toBe(uri);
  });
});
