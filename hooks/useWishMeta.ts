import * as React from 'react';
import type { Wish } from '@/types/Wish';
import { getWishMeta, WishMeta } from '@/helpers/wishMeta';
import { useAuthSession } from '@/contexts/AuthSessionContext';

const DEFAULT: WishMeta = {
  giftCount: 0,
  hasGiftMessage: false,
  isSupporter: false,
  giftTotal: 0,
};

export function useWishMeta(wish: Pick<Wish, 'id' | 'userId'> | null | undefined) {
  const [meta, setMeta] = React.useState<WishMeta>(DEFAULT);
  const [loading, setLoading] = React.useState<boolean>(!!wish?.id);
  const wishId = wish?.id || null;
  const ownerId = wish?.userId;
  const { user } = useAuthSession();
  const viewerId = user?.uid ?? null;

  React.useEffect(() => {
    let cancelled = false;
    if (!wishId) {
      setMeta(DEFAULT);
      setLoading(false);
      return;
    }
    setLoading(true);
    getWishMeta(wishId, ownerId, viewerId)
      .then((data) => {
        if (!cancelled) {
          setMeta(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMeta(DEFAULT);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wishId, ownerId, viewerId]);

  return { ...meta, loading };
}
