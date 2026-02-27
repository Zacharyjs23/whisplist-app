jest.mock('@/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
}));

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateCommentReaction } from '@/helpers/comments';

describe('updateCommentReaction', () => {
  beforeEach(() => {
    (doc as jest.Mock).mockReturnValue('ref');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('adds a new reaction', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        reactions: { '😊': 1 },
        userReactions: { user2: '😊' },
      }),
    });

    await updateCommentReaction('wish1', 'comment1', '👍', undefined, 'user1');

    expect(updateDoc).toHaveBeenCalledWith('ref', {
      reactions: { '😊': 1, '👍': 1 },
      userReactions: { user2: '😊', user1: '👍' },
    });
  });

  it('changes an existing reaction', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        reactions: { '😊': 2, '👍': 1 },
        userReactions: { user1: '😊', user2: '👍' },
      }),
    });

    await updateCommentReaction('wish1', 'comment1', '❤️', '😊', 'user1');

    expect(updateDoc).toHaveBeenCalledWith('ref', {
      reactions: { '😊': 1, '👍': 1, '❤️': 1 },
      userReactions: { user1: '❤️', user2: '👍' },
    });
  });

  it('removes a reaction when tapped twice', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        reactions: { '😊': 1, '👍': 2 },
        userReactions: { user1: '😊', user2: '👍' },
      }),
    });

    await updateCommentReaction('wish1', 'comment1', '😊', '😊', 'user1');

    expect(updateDoc).toHaveBeenCalledWith('ref', {
      reactions: { '👍': 2 },
      userReactions: { user2: '👍' },
    });
  });
});
