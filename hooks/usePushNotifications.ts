import { useEffect, useState } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { db } from '../firebase';
import * as logger from '@/shared/logger';
import {
  handleEphemeralDeepLinkOpen,
  handleEphemeralDropPushOpen,
} from '@/apps/mobile/src/notifications/DropPushHandler';

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
      logger.warn(
        'Skipping push notification registration on web: VAPID key not configured',
      );
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

  useEffect(() => {
    if (!user?.uid) return;
    const responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
        const experimentKey = (data.experiment || data.experiment_key || data.exp) as
          | string
          | undefined;
        if (experimentKey !== 'ephemeral_drop_push') return;
        const pushId =
          (data.push_id as string | undefined) ||
          (data.pushId as string | undefined) ||
          response.notification.request.identifier;
        const variant = (data.variant as string | undefined) || null;
        handleEphemeralDropPushOpen(user.uid, {
          push_id: pushId,
          variant,
        });
        const deepLink =
          (typeof data.path === 'string' && data.path) ||
          (typeof data.deepLink === 'string' ? data.deepLink : null);
        if (deepLink) {
          handleEphemeralDeepLinkOpen(user.uid, deepLink, {
            push_id: pushId,
            variant,
          });
        }
      },
    );
    const deepLinkListener = Linking.addEventListener('url', ({ url }) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const experimentKey =
        (parsed?.queryParams?.experiment as string | undefined) ||
        (parsed?.queryParams?.exp as string | undefined) ||
        (parsed?.queryParams?.experiment_key as string | undefined);
      if (experimentKey !== 'ephemeral_drop_push') return;
      const pushId =
        (parsed?.queryParams?.push_id as string | undefined) ||
        (parsed?.queryParams?.pushId as string | undefined) ||
        null;
      handleEphemeralDeepLinkOpen(user.uid, url, {
        push_id: pushId,
      });
    });
    return () => {
      responseListener.remove();
      deepLinkListener.remove();
    };
  }, [user?.uid]);

  return token;
}
