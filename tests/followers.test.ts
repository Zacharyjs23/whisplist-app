jest.mock('@/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  getDocs: jest.fn(),
}));

import { getDocs } from 'firebase/firestore';
import { getFollowingIds } from '@/helpers/followers';

describe('getFollowingIds', () => {
  it('returns ids from firestore docs', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [{ id: 'a' }, { id: 'b' }],
    });

    const ids = await getFollowingIds('user1');

    expect(getDocs).toHaveBeenCalled();
    expect(ids).toEqual(['a', 'b']);
  });

  it('returns empty array when no docs', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });

    const ids = await getFollowingIds('user1');

    expect(ids).toEqual([]);
  });
});

