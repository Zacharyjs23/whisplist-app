import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { UserCard } from '@/app/components/UserCard';
import type { PublicUser } from '@/app/public/types';

const mockTheme = {
  name: 'light',
  text: '#111',
  background: '#fff',
  tint: '#0af',
  card: '#f7f7f8',
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

const translationMap: Record<
  string,
  string | ((options?: Record<string, any>) => string)
> = {
  'publicUsers.lastWish': (options) => `Last wish: ${options?.wish ?? ''}`,
  'publicUsers.wishCount': (options) =>
    `${options?.count ?? 0} ${(options?.count ?? 0) === 1 ? 'wish' : 'wishes'}`,
  'publicUsers.accessibility.openProfile': (options) =>
    `Open @${options?.displayName}'s public profile`,
  'publicUsers.accessibility.openProfileHint': () => 'Opens profile',
  'publicUsers.accessibility.profilePhoto': (options) =>
    `Profile photo for @${options?.displayName}`,
  'publicUsers.accessibility.noPhoto': () => 'Default avatar',
};

jest.mock('@/contexts/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, any>) => {
      const message = translationMap[key];
      if (typeof message === 'function') {
        return message(options);
      }
      if (typeof message === 'string') {
        return message;
      }
      return key;
    },
  }),
}));

describe('UserCard', () => {
  const user: PublicUser = {
    id: 'u1',
    displayName: 'whisperer',
    bio: 'Bio text',
    lastWish: 'Stay positive',
    photoURL: undefined,
    wishCount: 3,
  };

  it('renders user information and responds to press', () => {
    const onPress = jest.fn();
    render(<UserCard user={user} onPress={onPress} />);

    expect(screen.getByText('@whisperer')).toBeTruthy();
    expect(screen.getByText('Bio text')).toBeTruthy();
    expect(screen.getByText('Last wish: Stay positive')).toBeTruthy();
    expect(screen.getByText('3 wishes')).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Open @whisperer's public profile"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('handles singular wish count translation', () => {
    const onPress = jest.fn();
    render(<UserCard user={{ ...user, wishCount: 1 }} onPress={onPress} />);

    expect(screen.getByText('1 wish')).toBeTruthy();
  });
});
