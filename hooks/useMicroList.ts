import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MicroList } from '@/types/MicroList';
import { listenMicroList, saveMicroList } from '@/helpers/microList';
import { useAuthSession } from '@/contexts/AuthSessionContext';

type UseMicroListResult = {
  microList: MicroList | null;
  loading: boolean;
  error: Error | null;
  canEdit: boolean;
  persist: (input: Omit<MicroList, 'updatedAt'>) => Promise<void>;
};

export function useMicroList(
  profileId: string | null | undefined,
): UseMicroListResult {
  const [microList, setMicroList] = useState<MicroList | null>(null);
  const [loading, setLoading] = useState<boolean>(!!profileId);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuthSession();
  const viewerId = user?.uid ?? null;

  useEffect(() => {
    if (!profileId) {
      setMicroList(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = listenMicroList(profileId, (value) => {
      setMicroList(value);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profileId]);

  const persist = useCallback(
    async (input: Omit<MicroList, 'updatedAt'>) => {
      if (!profileId) return;
      try {
        await saveMicroList(profileId, input);
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err : new Error('Failed to save micro list');
        setError(message);
        throw err;
      }
    },
    [profileId],
  );

  const canEdit = useMemo(
    () => !!profileId && profileId === viewerId,
    [profileId, viewerId],
  );

  return {
    microList,
    loading,
    error,
    canEdit,
    persist,
  };
}
