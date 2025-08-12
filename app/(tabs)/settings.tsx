import { ThemedText } from '@/components/ThemedText';
import ThemedButton from '@/components/ThemedButton';
import { useTheme, ThemeName } from '@/contexts/ThemeContext';
import { Colors } from '@/constants/Colors';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useProfile } from '@/hooks/useProfile';
import { useTranslation } from '@/contexts/I18nContext';
// Ionicons is used for the collapsible section chevrons
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
  Alert,
  Image,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  SafeAreaView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as Audio from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import ReferralNameDialog from '@/components/ReferralNameDialog';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
  collectionGroup,
  query,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import { db, storage } from '../../firebase';
import { getAllWishes, getWishesByNickname } from '../../helpers/wishes';
import { getWishComments } from '../../helpers/comments';
import type { Profile } from '../../types/Profile';
import * as logger from '@/shared/logger';

export default function Page() {
  const { theme, setTheme } = useTheme();
  const { user, profile: profileData } = useAuthSession();
  const { updateProfile } = useProfile();
  const profile = profileData as (Profile & { isDev?: boolean }) | null;
  const router = useRouter();
  const { t } = useTranslation();

  const themeOptions = Object.keys(Colors) as ThemeName[];

  const ThemeSwatch = ({ name }: { name: ThemeName }) => {
    const active = theme.name === name;
    return (
      <TouchableOpacity
        key={name}
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

  const [localUser, setLocalUser] = useState<LocalUser | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [defaultCategory, setDefaultCategory] = useState('general');
  const [language, setLanguage] = useState('en');
  const [feedback, setFeedback] = useState('');
  const [anonymize, setAnonymize] = useState(false);
  const [devMode, setDevMode] = useState(profile?.developerMode === true);
  const [dailyQuote, setDailyQuote] = useState(false);
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(
    profile?.publicProfileEnabled !== false,
  );
  const [stripeEnabled, setStripeEnabled] = useState(
    profile?.giftingEnabled === true,
  );
  const [refDialogVisible, setRefDialogVisible] = useState(false);
  const [pushPrefs, setPushPrefs] = useState({
    wish_boosted: true,
    new_comment: true,
    referral_bonus: true,
  });
  const [analytics, setAnalytics] = useState({
    wishCount: 0,
    boostCount: 0,
    giftCount: 0,
    userCount: 0,
  });

  const SettingsSection: React.FC<
    { title: string } & React.PropsWithChildren
  > = ({ title, children }) => {
    const [open, setOpen] = useState(true);
    return (
      <View style={styles.sectionContainer}>
        <TouchableOpacity
          onPress={() => setOpen((o) => !o)}
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

  useEffect(() => {
    const load = async () => {
      const a = await AsyncStorage.getItem('avatarUrl');
      const cat = await AsyncStorage.getItem('defaultCategory');
      const lang = await AsyncStorage.getItem('language');
      const anon = await AsyncStorage.getItem('anonymize');
      const quote = await AsyncStorage.getItem('dailyQuote');
      const storedNickname = await AsyncStorage.getItem('nickname');
      if (a) setAvatarUrl(a);
      if (cat) setDefaultCategory(cat);
      if (lang) setLanguage(lang);
      setAnonymize(anon === 'true');
      setDevMode(profile?.developerMode === true);
      setDailyQuote(quote === 'true');
      if (storedNickname)
        setLocalUser({ id: 'local', nickname: storedNickname });
      setPublicProfileEnabled(profile?.publicProfileEnabled !== false);
      const prefs = await AsyncStorage.getItem('pushPrefs');
      if (prefs) setPushPrefs(JSON.parse(prefs));
    };
    load();
  }, [profile]);

  useEffect(() => {
    if (!profile?.developerMode) return;
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const wishSnap = await getDocs(collection(db, 'wishes'));
        let boost = 0;
        wishSnap.forEach((d) => {
          const b = d.data().boostedUntil;
          if (b && b.toDate && b.toDate() > new Date()) boost += 1;
        });
        const giftSnap = await getDocs(collectionGroup(db, 'gifts'));
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const userSnap = await getDocs(
          query(collection(db, 'users'), where('createdAt', '>=', since)),
        );
        if (!cancelled) {
          setAnalytics({
            wishCount: wishSnap.size,
            boostCount: boost,
            giftCount: giftSnap.size,
            userCount: userSnap.size,
          });
        }
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
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const r = ref(storage, `avatars/${Date.now()}`);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      await AsyncStorage.setItem('avatarUrl', url);
      setAvatarUrl(url);
    }
  };

  const handleReset = async () => {
    await AsyncStorage.clear();
    Alert.alert(t('settings.alert.dataCleared'));
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
  };

  const togglePublicProfile = async (val: boolean) => {
    setPublicProfileEnabled(val);
    await updateProfile({ publicProfileEnabled: val });
  };

  const toggleStripe = async (val: boolean) => {
    setStripeEnabled(val);
    await updateProfile({ giftingEnabled: val });
    if (val && !profile?.stripeAccountId && user?.uid) {
      try {
        const resp = await fetch(
          `https://us-central1-${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/createStripeAccountLink`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: user.uid }),
          },
        );
        const data = await resp.json();
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

          <SettingsSection title={t('settings.sections.privacy')}>
            <View style={styles.row}>
              <ThemedText style={styles.label}>
                {t('settings.privacy.anonymize')}
              </ThemedText>
              <Switch value={anonymize} onValueChange={toggleAnonymize} />
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>
                {t('settings.privacy.publicProfile')}
              </ThemedText>
              <Switch
                value={publicProfileEnabled}
                onValueChange={togglePublicProfile}
              />
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>
                {t('settings.privacy.stripeGifting')}
              </ThemedText>
              <Switch value={stripeEnabled} onValueChange={toggleStripe} />
            </View>
          </SettingsSection>

          <SettingsSection title={t('settings.sections.notifications')}>
            <View style={styles.row}>
              <ThemedText style={styles.label}>
                {t('settings.notifications.dailyQuote')}
              </ThemedText>
              <Switch value={dailyQuote} onValueChange={toggleDailyQuote} />
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>
                {t('settings.notifications.boostNotifications')}
              </ThemedText>
              <Switch
                value={pushPrefs.wish_boosted}
                onValueChange={(v) => togglePush('wish_boosted', v)}
              />
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>
                {t('settings.notifications.commentNotifications')}
              </ThemedText>
              <Switch
                value={pushPrefs.new_comment}
                onValueChange={(v) => togglePush('new_comment', v)}
              />
            </View>
          </SettingsSection>

          {profile?.isDev === true && (
            <SettingsSection title={t('settings.sections.developer')}>
              <View style={styles.row}>
                <ThemedText style={styles.label}>
                  {t('settings.developer.developerMode')}
                </ThemedText>
                <Switch value={devMode} onValueChange={toggleDevMode} />
              </View>
              <View style={styles.row}>
                <ThemedText style={styles.label}>
                  {t('settings.notifications.referralBonuses')}
                </ThemedText>
                <Switch
                  value={pushPrefs.referral_bonus}
                  onValueChange={(v) => togglePush('referral_bonus', v)}
                />
              </View>
              {profile?.developerMode && (
                <View
                  style={[
                    styles.devAnalytics,
                    { backgroundColor: theme.input },
                  ]}
                >
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
            </SettingsSection>
          )}

          <SettingsSection title={t('settings.sections.system')}>
            <ThemedButton
              title={t('settings.system.pickAvatar')}
              onPress={pickAvatar}
            />
            {avatarUrl && (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            )}
            {profile?.boostCredits !== undefined && (
              <ThemedText style={styles.section}>
                {t('settings.system.earnedBoosts', {
                  count: profile.boostCredits,
                })}
              </ThemedText>
            )}
            <ThemedButton
              title={t('settings.system.referFriend')}
              onPress={handleShareInvite}
            />
            <ThemedText style={styles.section}>
              {t('settings.system.defaultCategory')}
            </ThemedText>
            <Picker
              selectedValue={defaultCategory}
              onValueChange={async (v) => {
                setDefaultCategory(v);
                await AsyncStorage.setItem('defaultCategory', v);
              }}
              style={[
                styles.picker,
                { backgroundColor: theme.input, color: theme.text },
              ]}
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
            <ThemedText style={styles.section}>
              {t('settings.system.language')}
            </ThemedText>
            <Picker
              selectedValue={language}
              onValueChange={async (v) => {
                setLanguage(v);
                await AsyncStorage.setItem('language', v);
              }}
              style={[
                styles.picker,
                { backgroundColor: theme.input, color: theme.text },
              ]}
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
            <ThemedButton
              title={t('settings.system.exportHistory')}
              onPress={handleExport}
            />
            <ThemedButton
              title={t('settings.system.rateApp')}
              onPress={() => {
                Linking.openURL('https://example.com');
              }}
            />
            <ThemedButton
              title={t('settings.system.permissions')}
              onPress={permissionsInfo}
            />
            <ThemedButton
              title={t('settings.system.deleteContent')}
              onPress={handleDeleteContent}
            />
            <ThemedButton
              title={t('settings.system.resetData')}
              onPress={handleReset}
            />
            <Text
              style={{
                color: theme.text,
                marginBottom: 10,
                textAlign: 'center',
              }}
            >
              {t('settings.system.aboutDescription')}
            </Text>
            <ThemedButton
              title={t('settings.system.terms')}
              onPress={() => router.push('/terms')}
            />
            <ThemedButton
              title={t('settings.system.privacy')}
              onPress={() => router.push('/privacy')}
            />
          </SettingsSection>

          <SettingsSection title={t('settings.sections.theme')}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.themeList}
            >
              {themeOptions.map((t) => (
                <ThemeSwatch key={t} name={t} />
              ))}
            </ScrollView>
            <Picker
              selectedValue={theme.name}
              onValueChange={(value) => void setTheme(value as ThemeName)}
              style={[
                styles.picker,
                { backgroundColor: theme.input, color: theme.text },
              ]}
            >
              {themeOptions.map((t) => (
                <Picker.Item key={t} label={t} value={t} />
              ))}
            </Picker>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
  },
  section: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 16,
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
    marginTop: 20,
    padding: 12,
    borderRadius: 8,
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
