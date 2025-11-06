import type { Timestamp } from 'firebase/firestore';
import type { Wish } from '@/types/Wish';
import type { PostType } from '@/types/post';
import type { WishStage } from '@/types/WishStage';
import type { AccountabilityCircle } from '@/hooks/useAccountabilityCircles';
import type { WishScope } from '@/types/WishScope';
import { normalizeWishScope } from '@/types/WishScope';

export const MAX_WISH_LENGTH = 280;
export const MAX_LINK_LENGTH = 2000;

export const sanitizeInput = (text: string) => text.replace(/[<>]/g, '').trim();

export type WishPayloadInput = {
  text: string;
  type: PostType;
  userId: string;
  displayName?: string | null;
  photoURL?: string | null;
  scope: WishScope;
  stage: WishStage;
  accountabilityCircle?: AccountabilityCircle | null;
  accountabilityCircleId?: string | null;
  accountabilityCircleName?: string | null;
  enableExternalGift: boolean;
  giftLink: string;
  giftType: string;
  giftLabel: string;
  fundingEnabled: boolean;
  fundingGoalValue: number;
  fundingPresetValues: number[];
  isPoll: boolean;
  optionA: string;
  optionB: string;
  audioUrl?: string;
  imageUrl?: string;
  autoDelete: boolean;
  expiresAt?: Timestamp;
  supportAmountValue: number;
  supportReason: string;
};

export const buildWishPayload = ({
  text,
  type,
  userId,
  displayName,
  photoURL,
  scope,
  stage,
  accountabilityCircle,
  accountabilityCircleId,
  accountabilityCircleName,
  enableExternalGift,
  giftLink,
  giftType,
  giftLabel,
  fundingEnabled,
  fundingGoalValue,
  fundingPresetValues,
  isPoll,
  optionA,
  optionB,
  audioUrl,
  imageUrl,
  autoDelete,
  expiresAt,
  supportAmountValue,
  supportReason,
}: WishPayloadInput): Omit<Wish, 'id' | 'likes' | 'reactions'> => {
  const circle = accountabilityCircle ?? null;
  const resolvedScope = normalizeWishScope(scope);
  const includeIdentity = resolvedScope !== 'anon';
  return {
    text,
    category: type,
    type,
    userId,
    stage,
    displayName: includeIdentity ? displayName || '' : '',
    photoURL: includeIdentity ? photoURL || '' : '',
    isAnonymous: resolvedScope === 'anon',
    scope: resolvedScope,
    ...(circle
      ? {
          accountabilityCircleId: circle.id,
          accountabilityCircleName: circle.name ?? null,
        }
      : accountabilityCircleId
        ? {
            accountabilityCircleId,
            accountabilityCircleName: accountabilityCircleName ?? null,
          }
        : {}),
    ...(enableExternalGift && giftLink
      ? {
          giftLink,
          ...(giftType ? { giftType } : {}),
          ...(giftLabel ? { giftLabel } : {}),
        }
      : {}),
    ...(fundingEnabled &&
    Number.isFinite(fundingGoalValue) &&
    fundingGoalValue > 0
      ? {
          fundingGoal: fundingGoalValue,
          fundingCurrency: 'usd',
          ...(fundingPresetValues.length
            ? { fundingPresets: fundingPresetValues }
            : {}),
        }
      : {}),
    ...(isPoll
      ? {
          isPoll: true,
          optionA,
          optionB,
          votesA: 0,
          votesB: 0,
        }
      : {}),
    ...(audioUrl ? { audioUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(autoDelete && expiresAt ? { expiresAt } : {}),
    ...((Number.isFinite(supportAmountValue) && supportAmountValue > 0) ||
    supportReason
      ? {
          supportRequest: {
            ...(Number.isFinite(supportAmountValue) && supportAmountValue > 0
              ? { amount: supportAmountValue }
              : {}),
            ...(supportReason ? { reason: supportReason } : {}),
          },
        }
      : {}),
  };
};
