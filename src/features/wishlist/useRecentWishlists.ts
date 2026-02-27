import { useEffect, useState } from 'react';
import type { RecentWishlistEntry } from './recentService';
import { subscribeRecentWishlists } from './recentService';

export function useRecentWishlists(
  userId: string | null | undefined,
  limit?: number,
) {
  const [items, setItems] = useState<RecentWishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const unsubscribe = subscribeRecentWishlists(userId ?? null, (entries) => {
      if (!mounted) return;
      setItems(
        typeof limit === 'number' ? entries.slice(0, limit) : entries,
      );
      setLoading(false);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [limit, userId]);

  return { items, loading };
}
