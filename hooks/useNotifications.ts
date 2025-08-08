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
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('timestamp', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        try {
          setItems(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            })) as NotificationItem[],
          );
        } catch (err) {
          console.error('Error processing notifications snapshot', err);
          setError(err as Error);
        }
      },
      (err) => {
        console.error('Error listening to notifications', err);
        setError(err);
      },
    );
    return unsub;
  }, [user]);

  const markAllRead = async () => {
    if (!user?.uid) return;
    try {
      await Promise.all(
        items
          .filter((i) => !i.read)
          .map((i) =>
            updateDoc(doc(db, 'users', user.uid, 'notifications', i.id), {
              read: true,
            }),
          ),
      );
    } catch (err) {
      console.error('Error marking notifications read', err);
      throw err;
    }
  };

  const unread = items.filter((i) => !i.read).length;

  return { items, markAllRead, unread, error };
}
