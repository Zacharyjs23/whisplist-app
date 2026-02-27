import type { Wish } from '@/types/Wish';
import {
  getSupportUrgencyScore,
  getRemainingCents,
  isChipInAvailable,
  sortSupportPosts,
  toSupportPost,
} from '@/features/mvp/supportPosts';

describe('supportPosts mapping', () => {
  it('maps split-pay fields into feed-friendly values', () => {
    const wish: Wish = {
      id: 'wish_splitpay',
      text: 'Trying to cover rent after reduced hours.',
      category: 'support',
      likes: 0,
      userId: 'owner_1',
      displayName: 'Alex',
      splitPayEnabled: true,
      targetAmount: 7500,
      fundedAmount: 2300,
      fundingSupporters: 4,
      fundingCurrency: 'usd',
      status: 'funding',
      supportRequest: {
        reason: 'Rent for this month',
      },
      timestamp: { seconds: 1_700_000_000 } as any,
    };

    const post = toSupportPost(wish);

    expect(post.goalAmount).toBe(75);
    expect(post.raisedAmount).toBe(23);
    expect(post.targetAmountCents).toBe(7500);
    expect(post.fundedAmountCents).toBe(2300);
    expect(post.fundingCurrency).toBe('usd');
    expect(post.supporterCount).toBe(4);
    expect(post.splitPayStatus).toBe('funding');
    expect(isChipInAvailable(post)).toBe(true);
    expect(getRemainingCents(post)).toBe(5200);
  });

  it('disables chip-in for fulfilled split-pay wishes', () => {
    const wish: Wish = {
      id: 'wish_fulfilled',
      text: 'Goal reached, thank you everyone',
      category: 'support',
      likes: 0,
      splitPayEnabled: true,
      targetAmount: 3000,
      fundedAmount: 3000,
      status: 'fulfilled',
    };

    const post = toSupportPost(wish);
    expect(isChipInAvailable(post)).toBe(false);
    expect(getRemainingCents(post)).toBe(null);
  });

  it('keeps legacy funding values when split-pay is not configured', () => {
    const wish: Wish = {
      id: 'wish_legacy',
      text: 'Need help replacing tools',
      category: 'support',
      likes: 0,
      fundingGoal: 400,
      fundingRaised: 125,
      fundingSupporters: 6,
      supportRequest: {
        amount: 400,
        reason: 'Replacement tools',
      },
    };

    const post = toSupportPost(wish);
    expect(post.goalAmount).toBe(400);
    expect(post.raisedAmount).toBe(125);
    expect(post.targetAmountCents).toBe(null);
    expect(post.fundedAmountCents).toBe(0);
    expect(isChipInAvailable(post)).toBe(false);
  });

  it('sorts urgent active split-pay posts ahead of stale or completed posts', () => {
    const now = 1_700_500_000_000;

    const urgent = toSupportPost({
      id: 'urgent',
      text: 'Need to close this today',
      category: 'support',
      likes: 0,
      splitPayEnabled: true,
      targetAmount: 10000,
      fundedAmount: 9400,
      fundingSupporters: 8,
      status: 'funding',
      videoUrl: 'https://cdn.example.com/u.mp4',
      timestamp: { seconds: Math.floor((now - 60 * 60 * 1000) / 1000) } as any,
    });
    const stale = toSupportPost({
      id: 'stale',
      text: 'Old request',
      category: 'support',
      likes: 0,
      splitPayEnabled: true,
      targetAmount: 10000,
      fundedAmount: 1200,
      status: 'funding',
      timestamp: { seconds: Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000) } as any,
    });
    const complete = toSupportPost({
      id: 'complete',
      text: 'Done',
      category: 'support',
      likes: 0,
      splitPayEnabled: true,
      targetAmount: 10000,
      fundedAmount: 10000,
      status: 'fulfilled',
      timestamp: { seconds: Math.floor((now - 2 * 60 * 60 * 1000) / 1000) } as any,
    });

    const sorted = sortSupportPosts([stale, complete, urgent], now);
    expect(sorted.map((post) => post.id)).toEqual(['urgent', 'stale', 'complete']);
    expect(getSupportUrgencyScore(urgent, now)).toBeGreaterThan(
      getSupportUrgencyScore(stale, now),
    );
    expect(getSupportUrgencyScore(stale, now)).toBeGreaterThan(
      getSupportUrgencyScore(complete, now),
    );
  });
});
