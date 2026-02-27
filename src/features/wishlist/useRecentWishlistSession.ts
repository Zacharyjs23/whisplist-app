import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  flushRecentWishlists,
  hydrateRecentWishlists,
} from './recentService';

const normalize = (userId: string | null | undefined): string | null => {
  if (typeof userId !== 'string') return null;
  const trimmed = userId.trim();
  return trimmed.length ? trimmed : null;
};

export function useRecentWishlistSession(userId: string | null | undefined) {
  const previousRef = useRef<string | null>(null);

  useEffect(() => {
    const current = normalize(userId);
    const previous = previousRef.current;
    if (previous && previous !== current) {
      void flushRecentWishlists(previous);
    }
    if (current && current !== previous) {
      void hydrateRecentWishlists(current).catch(() => {
        /* ignore */
      });
    }
    previousRef.current = current;
    return () => {
      if (current) {
        void flushRecentWishlists(current);
      }
    };
  }, [userId]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const current = normalize(userId);
    if (!current) return;
    const handleUnload = () => {
      void flushRecentWishlists(current);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [userId]);
}
