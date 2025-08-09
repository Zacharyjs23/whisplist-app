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
import * as logger from '@/shared/logger';

export interface NotificationDoc {
  type: string;
  message: string;
  timestamp: Timestamp;
  read?: boolean;
}

export type NotificationItem = NotificationDoc & { id: string };

export default function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    if (!db) {
      const err = new Error('Firestore not initialized');
      logger.error(err.message);
      setError(err);
      return;
    }
    const notificationsRef = collection(
      db,
      'users',
      user.uid,
      'notifications',
    ).withConverter<NotificationDoc>({
      fromFirestore: (snapshot) => snapshot.data() as NotificationDoc,
      toFirestore: (data: NotificationDoc) => data,
    });
    const q = query(notificationsRef, orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        try {
          setItems(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            })),
          );
        } catch (err) {
          logger.error('Error processing notifications snapshot', err);
          setError(err as Error);
        }
      },
      (err) => {
        logger.error('Error listening to notifications', err);
        setError(err);
      },
    );
    return unsub;
  }, [user]);

  const markAllRead = async () => {
    if (!user?.uid) return;
    if (!db) {
      const err = new Error('Firestore not initialized');
      logger.error('Error marking notifications read', err);
      setError(err);
      return;
    }
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
      logger.error('Error marking notifications read', err);
      throw err;
    }
  };

  const unread = items.filter((i) => !i.read).length;

  return { items, markAllRead, unread, error };
}
