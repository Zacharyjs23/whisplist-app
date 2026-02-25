import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from '@testing-library/react-native';
import Page from '@/app/public/index';

const mockTheme = {
  name: 'light',
  text: '#111',
  background: '#fff',
  tint: '#0af',
  card: '#f7f7f8',
  input: '#f0f0f0',
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/firebase', () => ({ db: {} }));

const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockGetDocs = jest.fn();

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => {
    mockCollection(...args);
    return {};
  },
  query: (...args: unknown[]) => {
    mockQuery(...args);
    return {};
  },
  where: (...args: unknown[]) => {
    mockWhere(...args);
    return {};
  },
  orderBy: (...args: unknown[]) => {
    mockOrderBy(...args);
    return {};
  },
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

const translationMap: Record<
  string,
  string | ((options?: Record<string, any>) => string)
> = {
  'publicUsers.heading': 'Meet the voices behind WhispList…',
  'publicUsers.loading': 'Loading public profiles…',
  'publicUsers.error':
    "We couldn't load the community right now. Please try again later.",
  'publicUsers.empty': 'No public profiles yet.',
  'publicUsers.lastWish': (options) => `Last wish: ${options?.wish ?? ''}`,
  'publicUsers.wishCount': (options) =>
    `${options?.count ?? 0} ${(options?.count ?? 0) === 1 ? 'wish' : 'wishes'}`,
  'publicUsers.accessibility.listLabel': 'Public WhispList profiles',
  'publicUsers.accessibility.openProfile': (options) =>
    `Open @${options?.displayName}'s public profile`,
  'publicUsers.accessibility.openProfileHint': () => 'Open profile',
  'publicUsers.accessibility.profilePhoto': (options) =>
    `Profile photo for @${options?.displayName}`,
  'publicUsers.accessibility.noPhoto': () => 'Default profile avatar',
};

const translate = (key: string, options?: Record<string, any>) => {
  const message = translationMap[key];
  if (typeof message === 'function') {
    return message(options);
  }
  if (typeof message === 'string') {
    return message;
  }
  return key;
};

jest.mock('@/contexts/I18nContext', () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

describe('Public users screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows loading state while fetching', async () => {
    mockGetDocs.mockImplementation(() => new Promise(() => {}));
    render(<Page />);
    await act(async () => {
      await flushPromises();
    });
    expect(screen.getByText('Loading public profiles…')).toBeTruthy();
  });

  it('renders users and navigates on card press', async () => {
    const userDoc = {
      id: 'u1',
      data: () => ({
        displayName: 'whisperer',
        bio: 'Bio text',
        photoURL: null,
      }),
    };

    const wishDoc = {
      data: () => ({ text: 'Stay kind' }),
    };

    mockGetDocs
      .mockResolvedValueOnce({ docs: [userDoc] })
      .mockResolvedValueOnce({ docs: [wishDoc], empty: false, size: 3 });

    render(<Page />);
    await act(async () => {
      await flushPromises();
    });

    await screen.findByText('@whisperer');
    await screen.findByText('Last wish: Stay kind');
    await screen.findByText('3 wishes');

    fireEvent.press(
      await screen.findByLabelText("Open @whisperer's public profile"),
    );

    expect(mockPush).toHaveBeenCalledWith('/profile/whisperer');
  });

  it('falls back to legacy displayName wishes when userId wishes are missing', async () => {
    const userDoc = {
      id: 'u-legacy',
      data: () => ({
        displayName: 'legacyUser',
        bio: 'Legacy bio',
        photoURL: null,
      }),
    };

    const wishDoc = {
      data: () => ({ text: 'Legacy wish text' }),
    };

    mockGetDocs
      .mockResolvedValueOnce({ docs: [userDoc] })
      .mockResolvedValueOnce({ docs: [], empty: true, size: 0 })
      .mockResolvedValueOnce({ docs: [wishDoc], empty: false, size: 2 });

    render(<Page />);
    await act(async () => {
      await flushPromises();
    });

    await screen.findByText('@legacyUser');
    await screen.findByText('Last wish: Legacy wish text');
    await screen.findByText('2 wishes');
  });

  it('renders an error message when loading fails', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('firestore down'));
    render(<Page />);
    await act(async () => {
      await flushPromises();
    });

    await screen.findByText(
      "We couldn't load the community right now. Please try again later.",
    );
  });
});
