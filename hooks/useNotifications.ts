import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '../firebase';

export interface NotificationItem {
  id: string;
  type: string;
  message: string;
  timestamp: Timestamp | null;
  read?: boolean;
}

export default function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('timestamp', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as NotificationItem[],
      );
    });
    return unsub;
  }, [user]);

  const markAllRead = async () => {
    if (!user?.uid) return;
    await Promise.all(
      items
        .filter((i) => !i.read)
        .map((i) =>
          updateDoc(doc(db, 'users', user.uid, 'notifications', i.id), {
            read: true,
          }),
        ),
    );
  };

  const unread = items.filter((i) => !i.read).length;

  return { items, markAllRead, unread };
}
