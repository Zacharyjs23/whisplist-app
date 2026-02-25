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
  const hasMoney = hasMoneyRequest(wish);
  const hasGift = hasGiftRequest(wish);

  if (hasMoney && hasGift) return 'both';
  if (hasGift) return 'gift';
  return 'money';
}

export function toSupportPost(wish: Wish): SupportPost {
  const goalAmount =
    toNumber(wish.fundingGoal) ?? toNumber(wish.supportRequest?.amount);
  const raisedAmount =
    toNumber(wish.fundingRaised) ?? toNumber(wish.fundedAmount) ?? 0;
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
