import { useEffect, useState } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { db } from '../firebase';
import * as logger from '@/shared/logger';

export default function usePushNotifications() {
  const { user } = useAuthSession();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    if (Platform.OS === 'web') {
      logger.warn('Skipping push notification registration on web: VAPID key not configured');
      return;
    }
    const register = async () => {
      if (!Device.isDevice) return;
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const res = await Notifications.requestPermissionsAsync();
        status = res.status;
      }
      if (status !== 'granted') return;

      const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      setToken(data);
      if (!db) {
        logger.warn('Firebase is unavailable; skipping push token save');
        return;
      }
      try {
        // Save Expo push token under `pushToken` for server-side Expo delivery.
        await updateDoc(doc(db, 'users', user.uid), { pushToken: data });
      } catch (err) {
        logger.error('Failed to save push token', err);
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }
    };
    register();
  }, [user]);

  return token;
}
