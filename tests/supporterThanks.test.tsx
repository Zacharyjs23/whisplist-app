import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('@/firebase', () => ({ db: {} }));

const mockCollectionGroup = jest.fn();
const mockDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockLimit = jest.fn();
const mockOrderBy = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();

jest.mock('firebase/firestore', () => ({
  collectionGroup: (...args: unknown[]) => mockCollectionGroup(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
}));

import useSupporterThanks from '@/hooks/useSupporterThanks';

describe('useSupporterThanks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockImplementation((db: unknown, col: string, id: string) => ({
      path: `${col}/${id}`,
    }));
    mockQuery.mockImplementation(() => ({}));
    mockCollectionGroup.mockReturnValue({});
    mockLimit.mockReturnValue({});
    mockOrderBy.mockReturnValue({});
    mockWhere.mockReturnValue({});
  });

  const Consumer = ({ userId }: { userId?: string | null }) => {
    const { items, loading } = useSupporterThanks(userId);
    return (
      <>
        <Text testID="loading">{loading ? 'loading' : 'ready'}</Text>
        <Text testID="count">{items.length}</Text>
        {items.map((item) => (
          <Text key={item.id} testID={`item-${item.id}`}>
            {item.supporterName}·{item.wishSnippet}·{item.amount}
          </Text>
        ))}
      </>
    );
  };

  it('maps completed gifts with supporter and wish context', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'gift-1',
          data: () => ({
            status: 'completed',
            supporterId: 'user-2',
            wishId: 'wish-7',
            amount: 42,
          }),
        },
        {
          id: 'gift-2',
          data: () => ({
            status: 'pending',
            supporterId: 'user-3',
            wishId: 'wish-8',
          }),
        },
      ],
    });
    mockGetDoc.mockImplementation((ref: { path: string }) => {
      if (ref.path.startsWith('users/')) {
        const id = ref.path.split('/')[1];
        return {
          exists: () => id === 'user-2',
          data: () => ({ displayName: 'Nova', photoURL: 'https://cdn/avatar' }),
        };
      }
      if (ref.path.startsWith('wishes/')) {
        const id = ref.path.split('/')[1];
        return {
          exists: () => id === 'wish-7',
          data: () => ({ text: 'A lunar telescope' }),
        };
      }
      return { exists: () => false, data: () => ({}) };
    });

    render(<Consumer userId="user-1" />);

    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('ready'));
    expect(screen.getByTestId('count').props.children).toBe(1);
    const rendered = screen.getByTestId('item-user-2-wish-7-gift-1').props.children;
    const text = Array.isArray(rendered) ? rendered.join('') : rendered;
    expect(text).toBe('Nova·A lunar telescope·42');
  });

  it('clears items when user id missing', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    render(<Consumer userId={null} />);

    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('ready'));
    expect(screen.getByTestId('count').props.children).toBe(0);
  });
});
