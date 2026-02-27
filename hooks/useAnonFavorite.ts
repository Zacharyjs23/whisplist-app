import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type FirestoreError,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/firebase';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { getAnonDeviceHash } from '@/helpers/anonHash';
import * as logger from '@/shared/logger';

const NOTE_MAX = 90;

type RateLimiterResponse = {
  allowed: boolean;
};

type UseAnonFavoriteResult = {
  enabled: boolean;
  loading: boolean;
  toggled: boolean;
  error: Error | null;
  toggle: (next: boolean, opts?: { note?: string }) => Promise<boolean>;
  entryId: string | null;
};

const rateLimiter = httpsCallable<
  { wishId: string; anonHash: string },
  RateLimiterResponse
>(functions, 'rateLimiter');

const entriesCollectionPath = (wishId: string) =>
  ['wishFavorites', wishId, 'entries'] as const;

export function useAnonFavorite(
  wishId: string | null | undefined,
): UseAnonFavoriteResult {
  const { anonFav, anonFavSalt } = useFeatureFlags();
  const enabled = anonFav && !!anonFavSalt;
  const [entryId, setEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !wishId) {
      setEntryId(null);
      setToggled(false);
      setError(null);
      return;
    }
    getAnonDeviceHash(anonFavSalt)
      .then((hash) => {
        if (!cancelled) {
          setEntryId(hash);
        }
      })
      .catch((err) => {
        logger.warn('Failed to compute anon hash', err);
        if (!cancelled) {
          setEntryId(null);
          setError(
            err instanceof Error ? err : new Error('Failed to compute hash'),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [anonFavSalt, enabled, wishId]);

  useEffect(() => {
    if (!enabled || !wishId || !entryId) return () => {};
    const ref = doc(db, ...entriesCollectionPath(wishId), entryId);
    setLoading(true);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setToggled(snapshot.exists());
        setLoading(false);
      },
      (err: FirestoreError) => {
        logger.warn('anon favorite listener failed', err, { wishId });
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [enabled, entryId, wishId]);

  const notifyError = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Action failed', message);
    }
  }, []);

  const toggle = useCallback(
    async (next: boolean, opts?: { note?: string }) => {
      if (!enabled || !wishId || !entryId) return false;
      setLoading(true);
      setError(null);
      try {
        const note =
          opts?.note && opts.note.trim().length > 0
            ? opts.note.trim().slice(0, NOTE_MAX)
            : undefined;
        const ref = doc(db, ...entriesCollectionPath(wishId), entryId);
        if (next) {
          const res = await rateLimiter({ wishId, anonHash: entryId });
          if (!res.data?.allowed) {
            notifyError('You can favorite this wish again in a little while.');
            setLoading(false);
            return false;
          }
          await setDoc(
            ref,
            {
              anonHash: entryId,
              note,
              createdAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          await deleteDoc(ref);
        }
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to update favorite';
        setError(err instanceof Error ? err : new Error(message));
        notifyError(message);
        logger.warn('Failed to toggle anonymous favorite', err, { wishId });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [enabled, entryId, notifyError, wishId],
  );

  return useMemo(
    () => ({
      enabled,
      loading,
      toggled,
      error,
      toggle,
      entryId,
    }),
    [enabled, error, loading, toggled, toggle, entryId],
  );
}
