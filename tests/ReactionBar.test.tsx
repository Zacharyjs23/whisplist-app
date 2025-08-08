import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ReactionBar, { ReactionKey } from '@/components/ReactionBar';
import type { Wish } from '@/types/Wish';
import { Text, StyleSheet } from 'react-native';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: { tint: '#123', input: '#eee' } }),
}));

describe('ReactionBar', () => {
  const wish: Wish = {
    id: '1',
    text: 'test',
    category: 'gen',
    likes: 0,
    reactions: { pray: 1, lightbulb: 0, hug: 0, heart: 0 },
  };

  it('calls onReact when a reaction is pressed', () => {
    const onReact = jest.fn();
    const { getByTestId } = render(
      <ReactionBar
        wish={wish}
        userReaction={null}
        onReact={onReact}
        onToggleSave={jest.fn()}
        isSaved={false}
      />,
    );

    fireEvent.press(getByTestId('reaction-pray'));
    expect(onReact).toHaveBeenCalledWith('pray');
  });

  it('calls onToggleSave when bookmark pressed', () => {
    const onToggleSave = jest.fn();
    const { getByTestId } = render(
      <ReactionBar
        wish={wish}
        userReaction={null}
        onReact={jest.fn()}
        onToggleSave={onToggleSave}
        isSaved={false}
      />,
    );

    fireEvent.press(getByTestId('save-button'));
    expect(onToggleSave).toHaveBeenCalled();
  });

  it('highlights selected reaction', () => {
    const { getByTestId } = render(
      <ReactionBar
        wish={wish}
        userReaction={'pray' as ReactionKey}
        onReact={jest.fn()}
        onToggleSave={jest.fn()}
        isSaved={false}
      />,
    );

    const btn = getByTestId('reaction-pray');
    const flattened = StyleSheet.flatten(btn.props.style);
    expect(flattened.backgroundColor).toBe('#eee');
  });
});

