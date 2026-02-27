import type { Wish } from '@/types/Wish';

export type SupportRequestType = 'money' | 'gift' | 'both';

export type SupportPost = {
  id: string;
  creatorId: string | null;
  creatorName: string;
  creatorAvatar: string | null;
  story: string;
  needReason: string;
  requestType: SupportRequestType;
  goalAmount: number | null;
  raisedAmount: number;
  supporterCount: number;
  giftLabel: string | null;
  giftLink: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  createdAtMs: number | null;
  splitPayEnabled: boolean;
  splitPayStatus: 'open' | 'funding' | 'fulfilled' | 'expired' | null;
  targetAmountCents: number | null;
  fundedAmountCents: number;
  fundingCurrency: string;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toTimestampMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof candidate.seconds === 'number') {
      return candidate.seconds * 1000;
    }
  }
  return null;
}

function hasMoneyRequest(wish: Wish): boolean {
  const goal = toNumber(wish.fundingGoal);
  const supportAmount = toNumber(wish.supportRequest?.amount);
  return Boolean((goal && goal > 0) || (supportAmount && supportAmount > 0));
}

function hasGiftRequest(wish: Wish): boolean {
  return Boolean(
    (wish.giftLabel && wish.giftLabel.trim()) ||
      (wish.giftLink && wish.giftLink.trim()),
  );
}

export function isSupportPost(wish: Wish): boolean {
  if ((wish.type || '').toLowerCase() === 'support') {
    return true;
  }
  return (
    hasMoneyRequest(wish) ||
    hasGiftRequest(wish) ||
    Boolean(wish.supportRequest?.reason && wish.supportRequest.reason.trim())
  );
}

function inferRequestType(wish: Wish): SupportRequestType {
  const splitPayConfigured =
    wish.splitPayEnabled === true &&
    typeof wish.targetAmount === 'number' &&
    wish.targetAmount > 0;
  const hasMoney = hasMoneyRequest(wish);
  const hasGift = hasGiftRequest(wish);

  if (splitPayConfigured && hasGift) return 'both';
  if (splitPayConfigured) return 'money';
  if (hasMoney && hasGift) return 'both';
  if (hasGift) return 'gift';
  return 'money';
}

export function toSupportPost(wish: Wish): SupportPost {
  const splitPayEnabled = wish.splitPayEnabled === true;
  const splitPayStatus =
    wish.status === 'open' ||
    wish.status === 'funding' ||
    wish.status === 'fulfilled' ||
    wish.status === 'expired'
      ? wish.status
      : null;
  const targetAmountCents =
    splitPayEnabled &&
    typeof wish.targetAmount === 'number' &&
    wish.targetAmount > 0
      ? Math.max(0, Math.trunc(wish.targetAmount))
      : null;
  const fundedAmountCents =
    splitPayEnabled && typeof wish.fundedAmount === 'number'
      ? Math.max(0, Math.trunc(wish.fundedAmount))
      : 0;
  const splitPayGoalAmount =
    typeof targetAmountCents === 'number' ? targetAmountCents / 100 : null;
  const splitPayRaisedAmount =
    typeof targetAmountCents === 'number' ? fundedAmountCents / 100 : null;
  const goalAmount =
    splitPayGoalAmount ??
    toNumber(wish.fundingGoal) ??
    toNumber(wish.supportRequest?.amount);
  const raisedAmount =
    splitPayRaisedAmount ??
    toNumber(wish.fundingRaised) ??
    toNumber(wish.fundedAmount) ??
    0;
  const supporterCount = toNumber(wish.fundingSupporters) ?? 0;
  const creatorName =
    typeof wish.displayName === 'string' && wish.displayName.trim().length
      ? wish.displayName.trim()
      : 'Anonymous';

  const reason =
    typeof wish.supportRequest?.reason === 'string'
      ? wish.supportRequest.reason.trim()
      : '';

  const giftLabel =
    typeof wish.giftLabel === 'string' && wish.giftLabel.trim().length
      ? wish.giftLabel.trim()
      : null;

  const giftLink =
    typeof wish.giftLink === 'string' && wish.giftLink.trim().length
      ? wish.giftLink.trim()
      : null;

  const story =
    typeof wish.text === 'string' && wish.text.trim().length
      ? wish.text.trim()
      : '';

  const imageUrl =
    typeof wish.imageUrl === 'string' && wish.imageUrl.trim().length
      ? wish.imageUrl.trim()
      : null;

  const videoUrl =
    typeof wish.videoUrl === 'string' && wish.videoUrl.trim().length
      ? wish.videoUrl.trim()
      : null;

  return {
    id: wish.id,
    creatorId:
      typeof wish.userId === 'string' && wish.userId.trim().length
        ? wish.userId
        : null,
    creatorName,
    creatorAvatar:
      typeof wish.photoURL === 'string' && wish.photoURL.trim().length
        ? wish.photoURL.trim()
        : null,
    story,
    needReason: reason || giftLabel || 'Support request',
    requestType: inferRequestType(wish),
    goalAmount: goalAmount && goalAmount > 0 ? goalAmount : null,
    raisedAmount: Math.max(0, raisedAmount),
    supporterCount: Math.max(0, Math.trunc(supporterCount)),
    giftLabel,
    giftLink,
    imageUrl,
    videoUrl,
    createdAtMs: toTimestampMillis(wish.timestamp),
    splitPayEnabled,
    splitPayStatus,
    targetAmountCents,
    fundedAmountCents,
    fundingCurrency:
      typeof wish.fundingCurrency === 'string' && wish.fundingCurrency.trim()
        ? wish.fundingCurrency
        : 'USD',
  };
}

export function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function getProgress(post: SupportPost): number {
  if (!post.goalAmount || post.goalAmount <= 0) return 0;
  return Math.min(1, Math.max(0, post.raisedAmount / post.goalAmount));
}

export function isChipInAvailable(post: SupportPost): boolean {
  if (!post.splitPayEnabled) return false;
  if (post.splitPayStatus === 'fulfilled' || post.splitPayStatus === 'expired') {
    return false;
  }
  if (typeof post.targetAmountCents !== 'number' || post.targetAmountCents <= 0) {
    return false;
  }
  return true;
}

export function getRemainingCents(post: SupportPost): number | null {
  if (!isChipInAvailable(post) || typeof post.targetAmountCents !== 'number') {
    return null;
  }
  return Math.max(post.targetAmountCents - post.fundedAmountCents, 0);
}

export function getSupportUrgencyScore(
  post: SupportPost,
  nowMs = Date.now(),
): number {
  let score = 0;

  if (isChipInAvailable(post)) {
    score += 120;
    const remaining = getRemainingCents(post);
    if (typeof remaining === 'number') {
      if (remaining <= 5000) score += 35;
      if (remaining <= 2500) score += 25;
      if (remaining <= 1000) score += 20;

      if (
        typeof post.targetAmountCents === 'number' &&
        post.targetAmountCents > 0
      ) {
        const completionRatio =
          1 - Math.min(1, Math.max(0, remaining / post.targetAmountCents));
        score += Math.round(completionRatio * 40);
      }
    }
  }

  if (post.videoUrl) {
    score += 18;
  }

  if (post.supporterCount > 0) {
    score += Math.min(20, post.supporterCount * 2);
  }

  if (typeof post.createdAtMs === 'number') {
    const ageMs = Math.max(0, nowMs - post.createdAtMs);
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours <= 6) score += 24;
    else if (ageHours <= 24) score += 14;
    else if (ageHours <= 72) score += 8;
    else if (ageHours <= 168) score += 3;
  }

  if (post.splitPayStatus === 'fulfilled') {
    score -= 120;
  } else if (post.splitPayStatus === 'expired') {
    score -= 90;
  }

  return score;
}

export function sortSupportPosts(
  posts: SupportPost[],
  nowMs = Date.now(),
): SupportPost[] {
  return [...posts].sort((a, b) => {
    const scoreDiff =
      getSupportUrgencyScore(b, nowMs) - getSupportUrgencyScore(a, nowMs);
    if (scoreDiff !== 0) return scoreDiff;
    const timeA = typeof a.createdAtMs === 'number' ? a.createdAtMs : 0;
    const timeB = typeof b.createdAtMs === 'number' ? b.createdAtMs : 0;
    return timeB - timeA;
  });
}
