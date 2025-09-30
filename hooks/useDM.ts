import { useEffect, useMemo, useState } from 'react';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { listenThreads } from '@/services/dm';

export type DMThreadItem = any;

export default function useDM() {
  const { user } = useAuthSession();
  const [threads, setThreads] = useState<DMThreadItem[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenThreads(user.uid, setThreads);
    return unsub;
  }, [user?.uid]);

  const unread = useMemo(() => {
    if (!user?.uid) return 0;
    return threads.reduce((acc, t: any) => {
      const lastSender = t.lastSender;
      const updatedAt = t.updatedAt?.toMillis ? t.updatedAt.toMillis() : 0;
      const rec = t.readReceipts?.[user.uid];
      const recMs = rec?.toMillis ? rec.toMillis() : 0;
      const isUnread = lastSender && lastSender !== user.uid && updatedAt > recMs;
      return acc + (isUnread ? 1 : 0);
    }, 0);
  }, [threads, user?.uid]);

  return { threads, unread };
}

