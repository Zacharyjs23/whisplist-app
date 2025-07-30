import { useEffect, useState } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '../firebase';

export default function usePushNotifications() {
  const { user } = useAuth();
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
    const register = async () => {
      if (!Device.isDevice) return;
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const res = await Notifications.requestPermissionsAsync();
        status = res.status;
      }
      if (status !== 'granted') return;

      const { data } = await Notifications.getExpoPushTokenAsync();
      setToken(data);
      try {
        await updateDoc(doc(db, 'users', user.uid), { fcmToken: data });
      } catch (err) {
        console.error('Failed to save push token', err);
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
