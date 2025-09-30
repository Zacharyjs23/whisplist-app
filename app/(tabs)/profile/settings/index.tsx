import { ThemedText } from '@/components/ThemedText';
import ThemedButton from '@/components/ThemedButton';
import { useTheme, ThemeName } from '@/contexts/ThemeContext';
import { Colors } from '@/constants/Colors';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useProfile } from '@/hooks/useProfile';
import { useTranslation, useI18n } from '@/contexts/I18nContext';
// Ionicons is used for the collapsible section chevrons
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ToastAndroid,
  View,
  Pressable,
  Text,
  Alert,
  Image,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  SafeAreaView,
  ViewStyle,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as Audio from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import ReferralNameDialog from '@/components/ReferralNameDialog';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import * as React from 'react';
import { auth, db, storage, functions } from '@/firebase';
import type { Href } from 'expo-router';
import { getAllWishes, getWishesByNickname } from '@/helpers/wishes';
import { getWishComments } from '@/helpers/comments';
import type { Profile } from '@/types/Profile';
import * as logger from '@/shared/logger';
import { postJson } from '@/services/functions';
import { getQueueStatus, flushPendingWishes as flushPendingWishesHelper, clearQueue } from '@/helpers/offlineQueue';
import { optimizeImageForUpload } from '@/helpers/image';
import { useSubscription } from '@/contexts/SubscriptionContext';

export default function Page() {
  const { theme, setTheme } = useTheme();
  const { user, profile: profileData } = useAuthSession();
  const { updateProfile } = useProfile();
  const profile = profileData as (Profile & { isDev?: boolean }) | null;
  const router = useRouter();
  const { t } = useTranslation();
  const { setLanguage: setI18nLanguage } = useI18n();
  const { loading: subLoading, sub } = useSubscription();

  const themeOptions = Object.keys(Colors) as ThemeName[];

  type ThemeSwatchProps = { name: ThemeName; key?: React.Key };
  const ThemeSwatch: React.FC<ThemeSwatchProps> = ({ name }) => {
    const active = theme.name === name;
    return (
      <TouchableOpacity
        onPress={() => void setTheme(name)}
        style={[
          styles.themeItem,
          {
            backgroundColor: Colors[name].background,
            borderColor: active ? theme.tint : 'transparent',
          },
        ]}
      >
        <View style={[styles.swatch, { backgroundColor: Colors[name].tint }]} />
        <ThemedText style={active ? { color: theme.tint } : undefined}>
          {name}
          {active ? ' ✓' : ''}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  interface LocalUser {
    id: string;
    nickname: string;
  }

  const [localUser, setLocalUser] = React.useState<LocalUser | null>(null);

  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = React.useState(false);
  const [avatarProgress, setAvatarProgress] = React.useState<number | null>(null);
  const [defaultCategory, setDefaultCategory] = React.useState('general');
  const [language, setLanguage] = React.useState('en');
  const [feedback, setFeedback] = React.useState('');
  const [anonymize, setAnonymize] = React.useState(false);
  const [devMode, setDevMode] = React.useState(profile?.developerMode === true);
  const [dailyQuote, setDailyQuote] = React.useState(false);
  const [dailyQuoteStyle, setDailyQuoteStyle] = React.useState<'uplifting' | 'stoic' | 'growth'>('uplifting');
  const [dailyQuoteReminder, setDailyQuoteReminder] = React.useState(false);
  const [dailyQuoteTime, setDailyQuoteTime] = React.useState<{ hour: number; minute: number }>({ hour: 9, minute: 0 });
  const [publicProfileEnabled, setPublicProfileEnabled] = React.useState(
    profile?.publicProfileEnabled !== false,
  );
  const [stripeEnabled, setStripeEnabled] = React.useState(
    profile?.giftingEnabled === true,
  );
  const [shareAnalytics, setShareAnalytics] = React.useState(true);
  const [refDialogVisible, setRefDialogVisible] = React.useState(false);
  const [pushPrefs, setPushPrefs] = React.useState({
    wish_boosted: true,
    new_comment: true,
    referral_bonus: true,
    gift_received: true,
  });
  const [analytics, setAnalytics] = React.useState({
    wishCount: 0,
    boostCount: 0,
    giftCount: 0,
    userCount: 0,
  });
  const [diagCopied, setDiagCopied] = React.useState(false);
  const [queueStatus, setQueueStatus] = React.useState<{ size: number; oldestMs: number | null; nextRetryMs: number | null }>({ size: 0, oldestMs: null, nextRetryMs: null });

  const toJsDate = React.useCallback((value: unknown): Date | undefined => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    if (typeof value === 'object' && value) {
      const maybe: any = value;
      if (typeof maybe.toDate === 'function') {
        try {
          return maybe.toDate();
        } catch {}
      }
      if (typeof maybe.seconds === 'number') {
        return new Date(maybe.seconds * 1000);
      }
    }
    return undefined;
  }, []);

  const membershipSummary = React.useMemo(() => {
    if (subLoading) {
      return {
        badge: t('settings.membership.badge.loading', 'Checking…'),
        detail: t('settings.membership.detail.loading', "We're refreshing your membership status."),
        status: 'loading' as const,
      };
    }
    if (!sub?.status) {
      return {
        badge: t('settings.membership.badge.free', 'Free'),
        detail: t('settings.membership.detail.free', 'Unlock premium experiences with WhispList+.'),
        status: 'free' as const,
      };
    }
    const statusLabelMap: Record<string, string> = {
      active: t('settings.membership.badge.active', 'Active'),
      trialing: t('settings.membership.badge.trial', 'Trial'),
      past_due: t('settings.membership.badge.pastDue', 'Past Due'),
      canceled: t('settings.membership.badge.canceled', 'Canceled'),
      unpaid: t('settings.membership.badge.unpaid', 'Unpaid'),
    };
    const readableStatus = statusLabelMap[sub.status] || sub.status;
    const renewal = toJsDate((sub as any)?.currentPeriodEnd)?.toLocaleDateString();
    if (sub.cancelAtPeriodEnd && renewal) {
      return {
        badge: t('settings.membership.badge.canceling', 'Canceling'),
        detail: t('settings.membership.detail.canceling', 'Ends on {{date}}', { date: renewal }),
        status: sub.status,
      };
    }
    if (renewal) {
      return {
        badge: readableStatus,
        detail: t('settings.membership.detail.renews', 'Renews on {{date}}', { date: renewal }),
        status: sub.status,
      };
    }
    return {
      badge: readableStatus,
      detail: t('settings.membership.detail.active', 'Membership is active.'),
      status: sub.status,
    };
  }, [subLoading, sub, t, toJsDate]);

  const goToMembership = React.useCallback(() => {
    router.push('/(tabs)/profile/settings/subscriptions' as Href);
  }, [router]);

  const accountPhoto = avatarUrl || profile?.photoURL || null;

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await Clipboard.setStringAsync(value);
      if (Platform.OS === 'android') {
        ToastAndroid.show(`${t('common.copied', 'Copied')} ${label}`, ToastAndroid.SHORT);
      } else {
        Alert.alert(t('common.copied', 'Copied'), label);
      }
    } catch {}
  };

  const SettingsSection: React.FC<
    { title: string } & React.PropsWithChildren
  > = ({ title, children }) => {
    const [open, setOpen] = React.useState(true);
    return (
      <View style={styles.sectionContainer}>
        <TouchableOpacity
          onPress={() => setOpen((o: boolean) => !o)}
          style={styles.sectionHeader}
        >
          <ThemedText style={styles.section}>{title}</ThemedText>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.text}
          />
        </TouchableOpacity>
        {open && <View style={{ marginTop: 8 }}>{children}</View>}
      </View>
    );
  };

  type SectionCardProps = React.PropsWithChildren<{ style?: ViewStyle }>;
  const SectionCard: React.FC<SectionCardProps> = ({ children, style }) => (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: theme.input, borderColor: theme.placeholder },
        style,
      ]}
    >
      {children}
    </View>
  );

  type SettingRowProps = {
    title: string;
    description?: string;
    trailing?: React.ReactNode;
    onPress?: () => void;
    accessibilityHint?: string;
  };

  const SettingRow: React.FC<SettingRowProps> = ({
    title,
    description,
    trailing,
    onPress,
    accessibilityHint,
  }) => (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.settingRow,
        onPress && pressed ? styles.settingRowPressed : null,
      ]}
    >
      <View style={styles.settingRowText}>
        <Text style={[styles.settingRowTitle, { color: theme.text }]} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text
            style={[styles.settingRowDescription, { color: theme.placeholder }]}
            numberOfLines={2}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.settingRowTrailing}>{trailing}</View> : null}
    </Pressable>
  );

  React.useEffect(() => {
    const load = async () => {
      const a = await AsyncStorage.getItem('avatarUrl');
      const cat = await AsyncStorage.getItem('defaultCategory');
      const lang = await AsyncStorage.getItem('language');
      const anon = await AsyncStorage.getItem('anonymize');
      const quote = await AsyncStorage.getItem('dailyQuote');
      const dqRem = await AsyncStorage.getItem('dailyQuoteReminder');
      const dqHour = await AsyncStorage.getItem('dailyQuoteReminderHour');
      const dqMin = await AsyncStorage.getItem('dailyQuoteReminderMinute');
      const quoteStyle = await AsyncStorage.getItem('dailyQuote.style');
      const analyticsOptOut = await AsyncStorage.getItem('analyticsOptOut');
      const storedNickname = await AsyncStorage.getItem('nickname');
      if (a) setAvatarUrl(a);
      if (cat) setDefaultCategory(cat);
      if (lang) setLanguage(lang);
      setAnonymize(anon === 'true');
      setDevMode(profile?.developerMode === true);
      setDailyQuote(quote === 'true');
      setDailyQuoteReminder(dqRem === 'true');
      if (dqHour && dqMin) {
        const h = parseInt(dqHour, 10);
        const m = parseInt(dqMin, 10);
        if (!Number.isNaN(h) && !Number.isNaN(m)) setDailyQuoteTime({ hour: h, minute: m });
      }
      if (quoteStyle === 'stoic' || quoteStyle === 'growth' || quoteStyle === 'uplifting') {
        setDailyQuoteStyle(quoteStyle);
      }
      if (storedNickname)
        setLocalUser({ id: 'local', nickname: storedNickname });
      setShareAnalytics(analyticsOptOut !== 'true');
      setPublicProfileEnabled(profile?.publicProfileEnabled !== false);
      const prefs = await AsyncStorage.getItem('pushPrefs');
      if (prefs) {
        const parsed = JSON.parse(prefs);
        setPushPrefs({
          wish_boosted: true,
          new_comment: true,
          referral_bonus: true,
          gift_received: true,
          ...parsed,
        });
      }
      const qs = await getQueueStatus();
      setQueueStatus(qs);
    };
    load();
  }, [profile]);

  React.useEffect(() => {
    if (!profile?.developerMode) return;
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const callable = httpsCallable<
          Record<string, never>,
          {
            wishCount?: number;
            activeBoostCount?: number;
            giftCount?: number;
            recentUserCount?: number;
          }
        >(functions, 'getDeveloperMetrics');
        const result = await callable({});
        if (cancelled) return;
        const data = result.data ?? {};
        setAnalytics({
          wishCount: typeof data.wishCount === 'number' ? data.wishCount : 0,
          boostCount:
            typeof data.activeBoostCount === 'number' ? data.activeBoostCount : 0,
          giftCount: typeof data.giftCount === 'number' ? data.giftCount : 0,
          userCount:
            typeof data.recentUserCount === 'number' ? data.recentUserCount : 0,
        });
      } catch (err) {
        logger.warn('Failed to load analytics', err);
      }
    };

    fetchStats();
    const id = setInterval(fetchStats, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [profile?.developerMode]);

  const pickAvatar = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted)
      return Alert.alert(
        t('settings.alert.permissionRequiredTitle'),
        t('settings.alert.permissionRequiredMessage'),
      );
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      const optimized = await optimizeImageForUpload(uri, {
        maxWidth: 1024,
        compress: 0.8,
        format: 'jpeg',
      });
      const resp = await fetch(optimized);
      const blob = await resp.blob();
      const r = ref(storage, `avatars/${Date.now()}`);
      setAvatarUploading(true);
      setAvatarProgress(0);
      try {
        // Use resumable for progress
        const { uploadResumableWithProgress } = await import('@/helpers/storage');
        await uploadResumableWithProgress(r, blob, undefined, (pct) => setAvatarProgress(pct));
      } finally {
        setAvatarUploading(false);
        setAvatarProgress(null);
      }
      const url = await getDownloadURL(r);
      await AsyncStorage.setItem('avatarUrl', url);
      setAvatarUrl(url);
    }
  };

  const handleReset = async () => {
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        t('settings.system.resetConfirmTitle', 'Reset app data?'),
        t('settings.system.resetConfirmBody', 'This will clear local preferences and drafts.'),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('common.confirm', 'Confirm'), style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
    if (!proceed) return;
    await AsyncStorage.clear();
    if (Platform.OS === 'android') {
      ToastAndroid.show(t('settings.alert.dataCleared', 'Data cleared'), ToastAndroid.SHORT);
    } else {
      Alert.alert(t('settings.alert.dataCleared', 'Data cleared'));
    }
  };

  const handleExport = async () => {
    if (!localUser?.nickname)
      return Alert.alert(t('settings.alert.noNickname'));
    const wishes = await getWishesByNickname(localUser?.nickname);
    const comments: any[] = [];
    for (const w of wishes) {
      try {
        const list = await getWishComments(w.id, (err) => {
          logger.error('Failed to fetch comments for export', err);
        });
        list.forEach((c) => {
          if (c.nickname === localUser?.nickname) comments.push(c);
        });
      } catch {
        // handled in onError
      }
    }
    const data = JSON.stringify({ wishes, comments }, null, 2);
    Share.share({ message: data });
  };

  const copyDiagnostics = async () => {
    const diag = {
      version: Constants.expoConfig?.version,
      build: Constants.expoConfig?.runtimeVersion,
      env: process.env.EXPO_PUBLIC_ENV || 'development',
      projectId: (Constants.expoConfig?.extra as any)?.eas?.projectId,
      device: Constants.deviceName,
      appOwnership: Constants.appOwnership,
    };
    await Clipboard.setStringAsync(JSON.stringify(diag, null, 2));
    setDiagCopied(true);
    setTimeout(() => setDiagCopied(false), 1500);
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      if (Platform.OS === 'android') {
        ToastAndroid.show(t('settings.system.signedOut', 'Signed out'), ToastAndroid.SHORT);
      } else {
        Alert.alert(t('settings.system.signedOut', 'Signed out'));
      }
      router.replace('/auth' as Href);
    } catch (err) {
      logger.warn('Sign out failed', err);
      if (Platform.OS === 'android') {
        ToastAndroid.show(t('settings.system.signOutFailed', 'Sign out failed'), ToastAndroid.SHORT);
      } else {
        Alert.alert('Error', t('settings.system.signOutFailed', 'Sign out failed'));
      }
    }
  };

  const openOSSettings = async () => {
    try {
      if (Linking.openSettings) {
        await Linking.openSettings();
      } else {
        await Linking.openURL('app-settings:');
      }
    } catch (err) {
      logger.warn('open settings failed', err);
    }
  };

  const sendTestNotification = async () => {
    try {
      await Notifications.requestPermissionsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('settings.notifications.testTitle', 'Test notification'),
          body: t('settings.notifications.testBody', 'This is how notifications look.'),
        },
        trigger: null,
      });
    } catch (err) {
      logger.warn('test notification failed', err);
    }
  };

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    await addDoc(collection(db, 'feedback'), {
      text: feedback.trim(),
      timestamp: serverTimestamp(),
    });
    Alert.alert(t('settings.alert.feedbackSent'));
    setFeedback('');
  };

  const handleDeleteContent = async () => {
    if (!localUser?.nickname)
      return Alert.alert(t('settings.alert.noNickname'));
    const confirm = await new Promise<boolean>((resolve) => {
      Alert.alert(
        t('settings.alert.deleteAllTitle'),
        t('settings.alert.areYouSure'),
        [
          { text: t('common.cancel'), onPress: () => resolve(false) },
          { text: t('common.delete'), onPress: () => resolve(true) },
        ],
      );
    });
    if (!confirm) return;
    const wishes = await getWishesByNickname(localUser?.nickname);
    for (const w of wishes) {
      await deleteDoc(doc(db, 'wishes', w.id));
    }
    const all = await getAllWishes();
    for (const wish of all) {
      try {
        const list = await getWishComments(wish.id, (err) => {
          logger.error('Failed to fetch comments for deletion', err);
        });
        for (const c of list) {
          if (c.nickname === localUser?.nickname) {
            await deleteDoc(doc(db, 'wishes', wish.id, 'comments', c.id));
          }
        }
      } catch {
        // handled in onError
      }
    }
    Alert.alert(t('settings.alert.contentDeleted'));
  };

  const handleShareInvite = async () => {
    setRefDialogVisible(true);
  };

  const permissionsInfo = async () => {
    const mic = await (Audio as any).getRecordingPermissionsAsync();
    const notif = await Notifications.getPermissionsAsync();
    Alert.alert(
      t('settings.alert.permissionsTitle'),
      t('settings.alert.permissionsStatus', {
        mic: mic.status,
        notif: notif.status,
      }),
    );
  };

  const sendInvite = async (name: string) => {
    if (!profile) return;
    await updateProfile({ referralDisplayName: name });
    const refName = name || profile.displayName || '';
    const url = Linking.createURL('/', { queryParams: { ref: refName } });
    await Share.share({ message: t('settings.alert.inviteMessage', { url }) });
    setRefDialogVisible(false);
  };

  const toggleAnonymize = async (val: boolean) => {
    setAnonymize(val);
    await AsyncStorage.setItem('anonymize', val ? 'true' : 'false');
  };

  const toggleDevMode = async (val: boolean) => {
    setDevMode(val);
    await updateProfile({ developerMode: val });
  };

  const toggleDailyQuote = async (val: boolean) => {
    setDailyQuote(val);
    await AsyncStorage.setItem('dailyQuote', val ? 'true' : 'false');
    if (!val) {
      // If turning off quotes, also stop reminders
      const id = await AsyncStorage.getItem('dailyQuoteReminderId');
      if (id) await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.multiRemove([
        'dailyQuoteReminder',
        'dailyQuoteReminderId',
      ]);
      setDailyQuoteReminder(false);
    }
  };

  const changeDailyQuoteStyle = async (val: 'uplifting' | 'stoic' | 'growth') => {
    setDailyQuoteStyle(val);
    await AsyncStorage.setItem('dailyQuote.style', val);
  };

  const scheduleDailyQuoteReminder = async (hour: number, minute: number) => {
    const existing = await AsyncStorage.getItem('dailyQuoteReminderId');
    if (existing) await Notifications.cancelScheduledNotificationAsync(existing);
    const newId = await Notifications.scheduleNotificationAsync({
      content: {
        title: t('dailyQuote.title'),
        body: t('notifications.dailyQuoteBody', 'Your daily dose of motivation is ready.'),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      },
    });
    await AsyncStorage.setItem('dailyQuoteReminderId', newId);
  };

  const toggleDailyQuoteReminder = async (val: boolean) => {
    if (val) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      await scheduleDailyQuoteReminder(dailyQuoteTime.hour, dailyQuoteTime.minute);
      await AsyncStorage.setItem('dailyQuoteReminder', 'true');
      await AsyncStorage.setItem('dailyQuoteReminderHour', String(dailyQuoteTime.hour));
      await AsyncStorage.setItem('dailyQuoteReminderMinute', String(dailyQuoteTime.minute));
      setDailyQuoteReminder(true);
    } else {
      const id = await AsyncStorage.getItem('dailyQuoteReminderId');
      if (id) await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.multiRemove([
        'dailyQuoteReminder',
        'dailyQuoteReminderId',
      ]);
      setDailyQuoteReminder(false);
    }
  };

  const changeDailyQuoteTime = async (hour: number, minute: number) => {
    setDailyQuoteTime({ hour, minute });
    await AsyncStorage.setItem('dailyQuoteReminderHour', String(hour));
    await AsyncStorage.setItem('dailyQuoteReminderMinute', String(minute));
    if (dailyQuoteReminder) {
      await scheduleDailyQuoteReminder(hour, minute);
    }
  };

  const togglePublicProfile = async (val: boolean) => {
    setPublicProfileEnabled(val);
    await updateProfile({ publicProfileEnabled: val });
  };

  const toggleShareAnalytics = async (val: boolean) => {
    setShareAnalytics(val);
    await AsyncStorage.setItem('analyticsOptOut', val ? 'false' : 'true');
  };

  const toggleStripe = async (val: boolean) => {
    setStripeEnabled(val);
    await updateProfile({ giftingEnabled: val });
    if (val && !profile?.stripeAccountId && user?.uid) {
      try {
        const data = await postJson<{ url?: string; accountId?: string }>(
          'createStripeAccountLink',
          { uid: user.uid },
        );
        if (data.accountId)
          await updateProfile({ stripeAccountId: data.accountId });
        if (data.url) await WebBrowser.openBrowserAsync(data.url);
      } catch (err) {
        logger.error('Failed to start Stripe onboarding', err);
      }
    }
  };

  const togglePush = async (key: keyof typeof pushPrefs, val: boolean) => {
    const updated = { ...pushPrefs, [key]: val };
    setPushPrefs(updated);
    await AsyncStorage.setItem('pushPrefs', JSON.stringify(updated));
    try {
      if (user?.uid) {
        await updateDoc(doc(db, 'users', user.uid), {
          notificationPrefs: updated,
        });
      }
    } catch (err) {
      logger.warn('Failed to persist notificationPrefs to Firestore', err);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.container,
            { backgroundColor: theme.background },
          ]}
        >
          <ThemedText style={styles.title}>{t('settings.title')}</ThemedText>

          <View style={[styles.heroCard, { backgroundColor: theme.input }]}>
            <View style={styles.heroRow}>
              {avatarUrl || profile?.photoURL ? (
                <Image
                  source={{ uri: (avatarUrl || profile?.photoURL)! }}
                  style={styles.heroAvatar}
                />
              ) : (
                <View style={[styles.heroAvatar, styles.heroAvatarPlaceholder]}>
                  <Ionicons name="person-outline" size={32} color={theme.placeholder} />
                </View>
              )}
              <View style={styles.heroDetails}>
                <View style={styles.heroHeaderRow}>
                  <Text
                    style={[styles.heroTitle, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {profile?.displayName || user?.email || t('settings.hero.greeting', 'Welcome back')}
                  </Text>
                  <View
                    style={[
                      styles.heroBadge,
                      { backgroundColor: `${theme.tint}22` },
                    ]}
                  >
                    <Text
                      style={[styles.heroBadgeText, { color: theme.tint }]}
                      numberOfLines={1}
                    >
                      {membershipSummary.badge}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[styles.heroSubtitle, { color: theme.placeholder }]}
                  numberOfLines={2}
                >
                  {membershipSummary.detail}
                </Text>
              </View>
            </View>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[styles.heroActionButton, { borderColor: theme.placeholder }]}
                onPress={pickAvatar}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.heroActionText, { color: theme.placeholder }]}
                  numberOfLines={1}
                >
                  {avatarUploading && avatarProgress !== null
                    ? t('settings.hero.uploadingPhoto', 'Uploading…')
                    : t('settings.hero.changePhoto', 'Update photo')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.heroActionPrimary, { borderColor: theme.tint }]}
                onPress={goToMembership}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.heroActionPrimaryText, { color: theme.tint }]}
                  numberOfLines={1}
                >
                  {t('settings.membership.cta', 'Manage membership')}
                </Text>
              </TouchableOpacity>
            </View>
            {avatarUploading && avatarProgress !== null && (
              <Text style={[styles.heroUploadProgress, { color: theme.placeholder }]}>
                {t('settings.hero.progress', '{{percent}}% uploaded', {
                  percent: Math.round(avatarProgress),
                })}
              </Text>
            )}
          </View>

          <SettingsSection title={t('settings.sections.account', 'Account Info')}>
            <SectionCard>
              <View style={styles.accountOverviewRow}>
                {accountPhoto ? (
                  <Image source={{ uri: accountPhoto }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.accountAvatarFallback]}>
                    <Ionicons name="person-circle-outline" color={theme.placeholder} size={56} />
                  </View>
                )}
                <View style={styles.accountOverviewDetails}>
                  <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600' }} numberOfLines={1}>
                    {profile?.displayName || t('account.nameUnset', 'Not set')}
                  </Text>
                  <Text style={{ color: theme.placeholder }} numberOfLines={1}>
                    {user?.email || t('account.emailUnset', 'Not set')}
                  </Text>
                </View>
              </View>
              <View style={[styles.sectionDivider, { backgroundColor: theme.placeholder }]} />
              <SettingRow
                title={t('account.userId', 'User ID')}
                description={user?.uid || '—'}
                onPress={user?.uid ? () => copyToClipboard(user.uid, 'UID') : undefined}
                accessibilityHint={t('settings.accessibility.copyUserId', 'Copy your user ID to the clipboard')}
                trailing={
                  user?.uid ? <Ionicons name="copy-outline" size={18} color={theme.tint} /> : undefined
                }
              />
              <View style={[styles.sectionDivider, { backgroundColor: theme.placeholder }]} />
              <SettingRow
                title={t('account.editProfile', 'Edit Profile')}
                description={t('settings.account.editProfileDescription', 'Update your name, photo, and bio.')}
                onPress={() => router.push('/profile' as Href)}
                trailing={<Ionicons name="chevron-forward" size={16} color={theme.placeholder} />}
              />
            </SectionCard>
          </SettingsSection>

          <SettingsSection title={t('settings.sections.privacy')}>
            <SectionCard>
              <SettingRow
                title={t('settings.privacy.anonymize')}
                description={t('settings.privacy.anonymizeDescription', 'Hide your name and avatar on new wishes.')}
                trailing={<Switch value={anonymize} onValueChange={toggleAnonymize} />}
              />
              <SettingRow
                title={t('settings.privacy.shareAnalytics', 'Share anonymous analytics')}
                description={t('settings.privacy.shareAnalyticsDescription', 'Help us improve WhispList with aggregated usage insights.')}
                trailing={<Switch value={shareAnalytics} onValueChange={toggleShareAnalytics} />}
              />
              <SettingRow
                title={t('settings.privacy.publicProfile')}
                description={t('settings.privacy.publicProfileDescription', 'Let other Whispers explore your public profile page.')}
                trailing={<Switch value={publicProfileEnabled} onValueChange={togglePublicProfile} />}
              />
              <SettingRow
                title={t('settings.privacy.stripeGifting')}
                description={t('settings.privacy.stripeGiftingDescription', 'Enable gifts and payouts through your Stripe account.')}
                trailing={<Switch value={stripeEnabled} onValueChange={toggleStripe} />}
              />
            </SectionCard>
          </SettingsSection>

          <SettingsSection title={t('settings.sections.notifications')}>
            <SectionCard>
              <SettingRow
                title={t('settings.notifications.dailyQuote')}
                description={t('settings.notifications.dailyQuoteDescription', 'Receive a daily affirmation inside WhispList.')}
                trailing={<Switch value={dailyQuote} onValueChange={toggleDailyQuote} />}
              />
              {dailyQuote && (
                <View style={styles.settingInset}>
                  <Text style={[styles.settingSubheading, { color: theme.placeholder }]}>
                    {t('settings.notifications.quoteStyle', 'Quote Style')}
                  </Text>
                  <Picker
                    selectedValue={dailyQuoteStyle}
                    onValueChange={(v) => changeDailyQuoteStyle(v as 'uplifting' | 'stoic' | 'growth')}
                    style={[styles.picker, { backgroundColor: theme.input, color: theme.text }]}
                  >
                    <Picker.Item label={t('dailyQuote.styles.uplifting', 'Uplifting')} value="uplifting" />
                    <Picker.Item label={t('dailyQuote.styles.stoic', 'Stoic')} value="stoic" />
                    <Picker.Item label={t('dailyQuote.styles.growth', 'Growth')} value="growth" />
                  </Picker>

                  <SettingRow
                    title={t('settings.notifications.quoteReminder', 'Daily Quote Reminder')}
                    description={t('settings.notifications.quoteReminderDescription', 'Schedule a push alert for your favorite time of day.')}
                    trailing={<Switch value={dailyQuoteReminder} onValueChange={toggleDailyQuoteReminder} />}
                  />

                  {dailyQuoteReminder && (
                    <View style={styles.settingInlineControls}>
                      <Picker
                        selectedValue={dailyQuoteTime.hour}
                        onValueChange={(v) => changeDailyQuoteTime(Number(v), dailyQuoteTime.minute)}
                        style={[styles.settingInlinePicker, { backgroundColor: theme.input, color: theme.text }]}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <Picker.Item key={i} label={`${i.toString().padStart(2, '0')}`} value={i} />
                        ))}
                      </Picker>
                      <Picker
                        selectedValue={dailyQuoteTime.minute}
                        onValueChange={(v) => changeDailyQuoteTime(dailyQuoteTime.hour, Number(v))}
                        style={[styles.settingInlinePicker, { backgroundColor: theme.input, color: theme.text }]}
                      >
                        {[0, 15, 30, 45].map((m) => (
                          <Picker.Item key={m} label={`${m.toString().padStart(2, '0')}`} value={m} />
                        ))}
                      </Picker>
                    </View>
                  )}
                </View>
              )}
            </SectionCard>

            <SectionCard>
              <SettingRow
                title={t('settings.notifications.boostNotifications')}
                description={t('settings.notifications.boostNotificationsDescription', 'Alerts when your wish is boosted or expires soon.')}
                trailing={<Switch value={pushPrefs.wish_boosted} onValueChange={(v) => togglePush('wish_boosted', v)} />}
              />
              <SettingRow
                title={t('settings.notifications.commentNotifications')}
                description={t('settings.notifications.commentNotificationsDescription', 'Know when someone reacts or comments on your wish.')}
                trailing={<Switch value={pushPrefs.new_comment} onValueChange={(v) => togglePush('new_comment', v)} />}
              />
              <SettingRow
                title={t('settings.notifications.giftNotifications')}
                description={t('settings.notifications.giftNotificationsDescription', 'Get notified when a supporter sends a gift.')}
                trailing={<Switch value={pushPrefs.gift_received} onValueChange={(v) => togglePush('gift_received', v)} />}
              />
              <View style={[styles.sectionDivider, { backgroundColor: theme.placeholder }]} />
              <SettingRow
                title={t('settings.notifications.test', 'Send Test Notification')}
                description={t('settings.notifications.testDescription', 'Double-check your device can receive pushes.')}
                onPress={sendTestNotification}
                trailing={<Ionicons name="notifications-outline" size={18} color={theme.tint} />}
              />
              <SettingRow
                title={t('settings.notifications.openSettings', 'Open OS Settings')}
                description={t('settings.notifications.openSettingsDescription', 'Adjust notification permissions in your device settings.')}
                onPress={openOSSettings}
                trailing={<Ionicons name="open-outline" size={18} color={theme.tint} />}
              />
            </SectionCard>
          </SettingsSection>

          {profile?.isDev === true && (
            <SettingsSection title={t('settings.sections.developer')}>
              <SectionCard>
                <SettingRow
                  title={t('settings.developer.developerMode')}
                  description={t('settings.developer.developerModeDescription', 'Unlock internal tooling, analytics, and staging shortcuts.')}
                  trailing={<Switch value={devMode} onValueChange={toggleDevMode} />}
                />
                <SettingRow
                  title={t('settings.notifications.referralBonuses')}
                  description={t('settings.notifications.referralBonusesDescription', 'Alerts when someone earns a referral reward from you.')}
                  trailing={<Switch value={pushPrefs.referral_bonus} onValueChange={(v) => togglePush('referral_bonus', v)} />}
                />
                {profile?.developerMode && (
                  <View style={[styles.devAnalytics, { borderColor: theme.placeholder }]}>
                    <Text style={{ color: theme.text }}>
                      {t('settings.developer.stats.totalWishes', {
                        count: analytics.wishCount,
                      })}
                    </Text>
                    <Text style={{ color: theme.text }}>
                      {t('settings.developer.stats.totalBoosts', {
                        count: analytics.boostCount,
                      })}
                    </Text>
                    <Text style={{ color: theme.text }}>
                      {t('settings.developer.stats.totalGifts', {
                        count: analytics.giftCount,
                      })}
                    </Text>
                    <Text style={{ color: theme.text }}>
                      {t('settings.developer.stats.activeUsers', {
                        count: analytics.userCount,
                      })}
                    </Text>
                  </View>
                )}
              </SectionCard>
            </SettingsSection>
          )}

          <SettingsSection title={t('settings.sections.system')}>
            <SectionCard>
              <Text style={[styles.settingSubheading, { color: theme.placeholder }]}>
                {t('settings.system.offlineQueue', 'Offline queue')}
              </Text>
              <View style={styles.settingInset}>
                <Text style={{ color: theme.text }}>
                  {t('settings.system.queued', { count: queueStatus.size })}
                </Text>
                <Text style={{ color: theme.text }}>
                  {t('settings.system.oldest', { mins: queueStatus.oldestMs ? Math.floor(queueStatus.oldestMs / 60000) : 0 })}
                </Text>
                <Text style={{ color: theme.text }}>
                  {t('settings.system.nextRetry', { mins: queueStatus.nextRetryMs ? Math.ceil(queueStatus.nextRetryMs / 60000) : 0 })}
                </Text>
              </View>
              <View style={styles.systemButtonRow}>
                <ThemedButton
                  title={t('settings.system.retryNow', 'Retry Pending Now')}
                  onPress={async () => {
                    const res = await flushPendingWishesHelper();
                    const qs = await getQueueStatus();
                    setQueueStatus(qs);
                    if (Platform.OS === 'android') {
                      ToastAndroid.show(t('settings.system.retryResult', { count: res.posted }), ToastAndroid.SHORT);
                    } else {
                      Alert.alert(t('settings.system.retryResult', { count: res.posted }));
                    }
                  }}
                />
                <ThemedButton
                  title={t('settings.system.clearQueue', 'Clear Pending')}
                  onPress={async () => {
                    await clearQueue();
                    const qs = await getQueueStatus();
                    setQueueStatus(qs);
                    if (Platform.OS === 'android') {
                      ToastAndroid.show(t('settings.system.cleared', 'Cleared'), ToastAndroid.SHORT);
                    } else {
                      Alert.alert(t('settings.system.cleared', 'Cleared'));
                    }
                  }}
                />
              </View>
              {profile?.boostCredits !== undefined && (
                <Text style={{ color: theme.placeholder, marginTop: 8 }}>
                  {t('settings.system.earnedBoosts', {
                    count: profile.boostCredits,
                  })}
                </Text>
              )}
            </SectionCard>

            <SectionCard>
              <SettingRow
                title={t('settings.system.referFriend')}
                description={t('settings.system.referFriendDescription', 'Share your referral link to unlock more boosts.')}
                onPress={handleShareInvite}
                trailing={<Ionicons name="person-add-outline" size={18} color={theme.tint} />}
              />
              <SettingRow
                title={t('settings.system.permissions')}
                description={t('settings.system.permissionsDescription', 'Check microphone and notification permissions.')}
                onPress={permissionsInfo}
                trailing={<Ionicons name="settings-outline" size={18} color={theme.tint} />}
              />
              <SettingRow
                title={t('settings.system.rateApp')}
                description={t('settings.system.rateAppDescription', 'Tell others what you love about WhispList.')}
                onPress={() => {
                  Linking.openURL('https://example.com');
                }}
                trailing={<Ionicons name="star-outline" size={18} color={theme.tint} />}
              />
              <SettingRow
                title={t('settings.system.copyDiagnostics', 'Copy Diagnostics')}
                description={diagCopied ? t('common.copied', 'Copied') : t('settings.system.copyDiagnosticsDescription', 'Copy device details to share with support.')}
                onPress={copyDiagnostics}
                trailing={
                  <Ionicons
                    name={diagCopied ? 'checkmark-outline' : 'copy-outline'}
                    size={18}
                    color={diagCopied ? theme.tint : theme.placeholder}
                  />
                }
              />
              <SettingRow
                title={t('settings.system.debug', 'Open Debug')}
                description={t('settings.system.debugDescription', 'Inspect local caches, storage, and developer tools.')}
                onPress={() => router.push('/debug' as Href)}
                trailing={<Ionicons name="bug-outline" size={18} color={theme.tint} />}
              />
              <Text
                style={{
                  color: theme.placeholder,
                  marginTop: 8,
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                {t('settings.system.aboutDescription')}
              </Text>
            </SectionCard>

            <SectionCard>
              <Text style={[styles.settingSubheading, { color: theme.placeholder }]}>
                {t('settings.system.defaultCategory')}
              </Text>
              <Picker
                selectedValue={defaultCategory}
                onValueChange={async (v) => {
                  setDefaultCategory(v);
                  await AsyncStorage.setItem('defaultCategory', v);
                }}
                style={[styles.picker, { backgroundColor: theme.input, color: theme.text }]}
              >
                <Picker.Item
                  label={t('settings.system.categories.general')}
                  value="general"
                />
                <Picker.Item
                  label={t('settings.system.categories.love')}
                  value="love"
                />
                <Picker.Item
                  label={t('settings.system.categories.career')}
                  value="career"
                />
                <Picker.Item
                  label={t('settings.system.categories.health')}
                  value="health"
                />
              </Picker>
              <Text style={[styles.settingSubheading, { color: theme.placeholder }]}>
                {t('settings.system.language')}
              </Text>
              <Picker
                selectedValue={language}
                onValueChange={async (v) => {
                  setLanguage(v);
                  await AsyncStorage.setItem('language', v);
                  try {
                    setI18nLanguage(v);
                  } catch {}
                }}
                style={[styles.picker, { backgroundColor: theme.input, color: theme.text }]}
              >
                <Picker.Item
                  label={t('settings.system.languages.en')}
                  value="en"
                />
                <Picker.Item
                  label={t('settings.system.languages.es')}
                  value="es"
                />
              </Picker>
            </SectionCard>

            <SectionCard>
              <Text style={[styles.settingSubheading, { color: theme.placeholder }]}>
                {t('settings.system.feedbackTitle', 'Share feedback')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.input,
                    color: theme.text,
                    height: 80,
                    textAlignVertical: 'top',
                  },
                ]}
                placeholder={t('settings.system.feedbackPlaceholder')}
                placeholderTextColor={theme.placeholder}
                value={feedback}
                onChangeText={setFeedback}
                multiline
              />
              <ThemedButton
                title={t('settings.system.submitFeedback')}
                onPress={handleSendFeedback}
              />
            </SectionCard>

            <SectionCard>
              <SettingRow
                title={t('settings.system.exportHistory')}
                description={t('settings.system.exportHistoryDescription', 'Create a personal backup of your wishes and comments.')}
                onPress={handleExport}
                trailing={<Ionicons name="share-outline" size={18} color={theme.tint} />}
              />
              <SettingRow
                title={t('settings.system.deleteContent')}
                description={t('settings.system.deleteContentDescription', 'Remove every wish and comment posted under your nickname.')}
                onPress={handleDeleteContent}
                trailing={<Ionicons name="trash-outline" size={18} color="rgb(220, 38, 38)" />}
              />
              <SettingRow
                title={t('settings.system.signOut', 'Sign Out')}
                description={t('settings.system.signOutDescription', 'Log out of WhispList on this device.')}
                onPress={handleSignOut}
                trailing={<Ionicons name="log-out-outline" size={18} color={theme.tint} />}
              />
              <SettingRow
                title={t('settings.system.resetData')}
                description={t('settings.system.resetDataDescription', 'Clear cached preferences and local drafts from the app.')}
                onPress={handleReset}
                trailing={<Ionicons name="refresh-outline" size={18} color={theme.tint} />}
              />
            </SectionCard>
          </SettingsSection>

          <SettingsSection title={t('settings.sections.legal', 'Legal')}>
            <SectionCard>
              <SettingRow
                title={t('settings.system.terms', 'Terms of Service')}
                description={t('settings.legal.termsDescription', 'Review the agreement that keeps WhispList safe for everyone.')}
                onPress={() => router.push('/terms' as Href)}
                trailing={<Ionicons name="document-text-outline" size={18} color={theme.tint} />}
              />
              <Text style={{ color: theme.placeholder, fontSize: 12, marginBottom: 12 }}>
                {t('settings.legal.termsUpdated', 'Last updated: Sep 3, 2025')}
              </Text>
              <View style={[styles.sectionDivider, { backgroundColor: theme.placeholder }]} />
              <SettingRow
                title={t('settings.system.privacy', 'Privacy Policy')}
                description={t('settings.legal.privacyDescription', 'Understand how we store, process, and protect your data.')}
                onPress={() => router.push('/privacy' as Href)}
                trailing={<Ionicons name="shield-checkmark-outline" size={18} color={theme.tint} />}
              />
              <Text style={{ color: theme.placeholder, fontSize: 12 }}>
                {t('settings.legal.privacyUpdated', 'Last updated: Sep 3, 2025')}
              </Text>
            </SectionCard>
          </SettingsSection>

          <SettingsSection title={t('settings.sections.theme')}>
            <SectionCard>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.themeList}
              >
                {themeOptions.map((t) => (
                  <ThemeSwatch key={t} name={t} />
                ))}
              </ScrollView>
              <Text style={[styles.settingSubheading, { color: theme.placeholder, marginTop: 8 }]}>
                {t('settings.theme.pickerLabel', 'Theme preset')}
              </Text>
              <Picker
                selectedValue={theme.name}
                onValueChange={(value) => void setTheme(value as ThemeName)}
                style={[styles.picker, { backgroundColor: theme.input, color: theme.text }]}
              >
                {themeOptions.map((t) => (
                  <Picker.Item key={t} label={t} value={t} />
                ))}
              </Picker>
            </SectionCard>
          </SettingsSection>

          <ReferralNameDialog
            visible={refDialogVisible}
            defaultName={
              profile?.referralDisplayName || profile?.displayName || ''
            }
            onClose={() => setRefDialogVisible(false)}
            onSubmit={sendInvite}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  heroCard: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  heroAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  heroDetails: {
    flex: 1,
    marginLeft: 16,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  heroTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
  },
  heroBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginLeft: 12,
    marginTop: 6,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    flexWrap: 'wrap',
  },
  heroActionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 12,
  },
  heroActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  heroActionPrimary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  heroActionPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  heroUploadProgress: {
    textAlign: 'center',
    fontSize: 12,
  },
  accountOverviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountOverviewDetails: {
    flex: 1,
    marginLeft: 12,
  },
  accountAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingRowPressed: {
    opacity: 0.6,
  },
  settingRowText: {
    flex: 1,
    marginRight: 12,
  },
  settingRowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingRowDescription: {
    fontSize: 13,
    marginTop: 4,
  },
  settingRowTrailing: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 12,
  },
  section: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 16,
  },
  sectionDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
    opacity: 0.3,
  },
  picker: {
    marginBottom: 12,
  },
  themeList: {
    marginBottom: 12,
  },
  themeItem: {
    padding: 10,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 2,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
    marginBottom: 4,
  },
  input: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: 'center',
    marginVertical: 10,
  },
  devAnalytics: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  settingInset: {
    marginTop: 12,
    gap: 12,
  },
  settingSubheading: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingInlineControls: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  settingInlinePicker: {
    flex: 1,
  },
  systemButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
