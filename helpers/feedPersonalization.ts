import { normalizePostType, type PostType } from '@/types/post';
import type { Wish } from '@/types/Wish';
import {
  WISH_STAGE_COPY,
  DEFAULT_WISH_STAGE,
  type WishStage,
} from '@/types/WishStage';
import { getPreferredPostType } from '@/helpers/postPreferences';
import { getWhispOfTheDay } from '@/helpers/wishes';
import * as logger from '@/shared/logger';

const SURPRISE_TTL_MS = 1000 * 60 * 60; // 1 hour cache per session
let surpriseCache: { wish: Wish | null; expiresAt: number } | null = null;

const stageWeight: Record<WishStage, number> = {
  seed: 0,
  shared: -0.2,
  nurturing: -0.6,
  celebrating: -0.4,
};

const computeScore = (
  wish: Wish,
  index: number,
  preferredType: PostType | null,
): number => {
  let score = index;
  const normalizedType = normalizePostType(wish.type);
  if (preferredType && normalizedType === preferredType) {
    score -= 3;
  }
  if (wish.boostedUntil) {
    score -= 1;
  }
  const stage: WishStage =
    wish.stage && WISH_STAGE_COPY[wish.stage as WishStage]
      ? (wish.stage as WishStage)
      : DEFAULT_WISH_STAGE;
  score += stageWeight[stage] ?? 0;
  if (wish.reactions) {
    const reactionTotal = Object.values(wish.reactions).reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    );
    score -= Math.min(2, reactionTotal / 10);
  }
  if (typeof wish.commentCount === 'number' && wish.commentCount > 0) {
    score -= Math.min(2, wish.commentCount / 4);
  }
  return score;
};

const fetchSurpriseWish = async (
  existingIds: Set<string>,
): Promise<Wish | null> => {
  if (surpriseCache && surpriseCache.expiresAt > Date.now()) {
    const cached = surpriseCache.wish;
    if (cached && !existingIds.has(cached.id)) {
      return cached;
    }
    if (!cached) return null;
  }

  try {
    const candidate = await getWhispOfTheDay();
    surpriseCache = {
      wish: candidate,
      expiresAt: Date.now() + SURPRISE_TTL_MS,
    };
    if (candidate && !existingIds.has(candidate.id)) {
      return candidate;
    }
  } catch (err) {
    logger.warn('Failed to fetch surprise wish', err);
    surpriseCache = { wish: null, expiresAt: Date.now() + SURPRISE_TTL_MS };
  }
  return null;
};

export type PersonalizedFeedResult = {
  items: Wish[];
  surpriseWish: Wish | null;
  preferredType: PostType | null;
};

export const personalizeFeed = async (
  base: Wish[],
  options: { userId?: string | null } = {},
): Promise<PersonalizedFeedResult> => {
  const { userId } = options;
  let preferredType: PostType | null = null;
  if (userId) {
    try {
      preferredType = await getPreferredPostType(userId);
    } catch (err) {
      logger.warn('Failed to resolve preferred post type for feed', err, {
        userId,
      });
    }
  }

  const sorted = [...base]
    .map((wish, index) => ({
      wish,
      index,
      score: computeScore(wish, index, preferredType),
    }))
    .sort((a, b) => {
      if (a.score === b.score) return a.index - b.index;
      return a.score - b.score;
    })
    .map((item) => item.wish);

  const surpriseWish = await fetchSurpriseWish(
    new Set(sorted.map((w) => w.id)),
  );

  return {
    items: sorted,
    surpriseWish,
    preferredType,
  };
};
