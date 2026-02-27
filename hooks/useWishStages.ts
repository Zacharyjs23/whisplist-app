import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { setWishStage } from '@/helpers/wishes';
import { trackEvent } from '@/helpers/analytics';
import type { Wish } from '@/types/Wish';
import {
  DEFAULT_WISH_STAGE,
  WISH_STAGE_COPY,
  WISH_STAGE_ORDER,
  type WishStage,
} from '@/types/WishStage';
import * as logger from '@/shared/logger';

export type WishStageOption = {
  value: WishStage;
  title: string;
  description: string;
};

export const useWishStages = (wish?: Wish | null) => {
  const stage: WishStage =
    wish?.stage && WISH_STAGE_ORDER.includes(wish.stage)
      ? wish.stage
      : DEFAULT_WISH_STAGE;

  const stageMeta = WISH_STAGE_COPY[stage];

  const options: WishStageOption[] = useMemo(
    () =>
      WISH_STAGE_ORDER.map((value) => ({
        value,
        title: WISH_STAGE_COPY[value].title,
        description: WISH_STAGE_COPY[value].description,
      })),
    [],
  );

  const changeStage = useCallback(
    async (nextStage: WishStage) => {
      if (!wish?.id) {
        logger.warn('Attempted to change stage on wish without id', {
          nextStage,
        });
        return;
      }
      if (nextStage === stage) return;
      try {
        await setWishStage(wish.id, nextStage);
        logger.log('Wish stage updated', { id: wish.id, nextStage });
        try {
          trackEvent('wish_stage_change', {
            wish_id: wish.id,
            from_stage: stage,
            to_stage: nextStage,
          });
        } catch {}
      } catch (err) {
        logger.warn('Failed to update wish stage', err, {
          id: wish.id,
          nextStage,
        });
        Alert.alert(
          'Update failed',
          'We could not update the wish stage. Please try again.',
        );
        throw err;
      }
    },
    [wish?.id, stage],
  );

  return {
    stage,
    stageMeta,
    options,
    changeStage,
  };
};

export const getStageNudge = (stage: WishStage) => WISH_STAGE_COPY[stage].nudge;
