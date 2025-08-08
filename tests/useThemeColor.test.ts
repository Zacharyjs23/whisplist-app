import { useTheme } from '@/contexts/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

const mockedUseTheme = useTheme as unknown as jest.Mock;

describe('useThemeColor', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      theme: { name: 'light', text: '#000', background: '#fff' } as any,
    });
  });

  it('returns color from props when provided', () => {
    const color = useThemeColor({ light: '#123456' }, 'text');
    expect(color).toBe('#123456');
  });

  it('returns theme color when prop not provided', () => {
    const color = useThemeColor({}, 'text');
    expect(color).toBe('#000');
  });
});

