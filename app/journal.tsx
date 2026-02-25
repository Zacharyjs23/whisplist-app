import React from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/firebase';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { addWish } from '@/helpers/wishes';
import { optimizeImageForUpload } from '@/helpers/image';
import { uploadResumableWithProgress } from '@/helpers/storage';
import type { SupportRequestType } from '@/features/mvp/supportPosts';
import * as logger from '@/shared/logger';

type SelectedMedia = {
  uri: string;
  type: 'image' | 'video';
  mimeType?: string | null;
};

function parseAmount(input: string): number | null {
  const normalized = input.replace(/[^0-9.]/g, '').trim();
  if (!normalized.length) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function fileExtension(uri: string, fallback: string): string {
  const clean = uri.split('?')[0];
  const idx = clean.lastIndexOf('.');
  if (idx < 0) return fallback;
  const ext = clean.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext.length ? ext : fallback;
}

export default function CreateRequestPage() {
  const router = useRouter();
  const { user, profile } = useAuthSession();

  const [requestType, setRequestType] = React.useState<SupportRequestType>('money');
  const [needReason, setNeedReason] = React.useState('');
  const [story, setStory] = React.useState('');
  const [goalInput, setGoalInput] = React.useState('');
  const [giftLabel, setGiftLabel] = React.useState('');
  const [giftLink, setGiftLink] = React.useState('');
  const [selectedMedia, setSelectedMedia] = React.useState<SelectedMedia | null>(null);
  const [posting, setPosting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);

  const wantsMoney = requestType === 'money' || requestType === 'both';
  const wantsGift = requestType === 'gift' || requestType === 'both';

  const pickMedia = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Media access is required to attach photos or videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedMedia({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        mimeType: asset.mimeType,
      });
    }
  }, []);

  const uploadMedia = React.useCallback(async (): Promise<{
    imageUrl?: string;
    videoUrl?: string;
  }> => {
    if (!selectedMedia || !user) {
      return {};
    }

    const isVideo = selectedMedia.type === 'video';
    const folder = isVideo ? 'videos' : 'images';
    const extension = isVideo
      ? fileExtension(selectedMedia.uri, 'mp4')
      : fileExtension(selectedMedia.uri, 'jpg');

    const uploadUri = isVideo
      ? selectedMedia.uri
      : await optimizeImageForUpload(selectedMedia.uri, {
          maxWidth: 1920,
          compress: 0.78,
          format: 'jpeg',
        });

    const response = await fetch(uploadUri);
    const blob = await response.blob();
    const mediaRef = ref(storage, `${folder}/${user.uid}-${Date.now()}.${extension}`);

    setUploadProgress(0);
    await uploadResumableWithProgress(mediaRef, blob, undefined, (pct) => {
      setUploadProgress(pct);
    });
    const url = await getDownloadURL(mediaRef);
    setUploadProgress(null);

    if (isVideo) {
      return { videoUrl: url };
    }
    return { imageUrl: url };
  }, [selectedMedia, user]);

  const handleSubmit = React.useCallback(async () => {
    const cleanNeed = needReason.trim();
    const cleanStory = story.trim();
    const cleanGiftLabel = giftLabel.trim();
    const cleanGiftLink = giftLink.trim();
    const goalAmount = parseAmount(goalInput);

    if (!user) {
      Alert.alert('Sign in required', 'Please sign in before posting a request.');
      return;
    }

    if (!cleanNeed) {
      Alert.alert('Add what you need', 'Tell supporters what you are asking for.');
      return;
    }

    if (!cleanStory) {
      Alert.alert('Add your story', 'Explain why you need help so people understand your request.');
      return;
    }

    if (wantsMoney && !goalAmount) {
      Alert.alert('Set a funding goal', 'Enter a dollar amount for your money request.');
      return;
    }

    if (wantsGift && !cleanGiftLabel) {
      Alert.alert('Add a gift name', 'Tell supporters what gift or item you need.');
      return;
    }

    if (cleanGiftLink && !/^https?:\/\//i.test(cleanGiftLink)) {
      Alert.alert('Invalid wishlist link', 'Gift links must start with https://');
      return;
    }

    setPosting(true);
    try {
      const mediaUrls = await uploadMedia();
      await addWish({
        text: cleanStory,
        category: 'support',
        type: 'support',
        userId: user.uid,
        displayName:
          profile?.displayName?.trim() || user.displayName || 'Anonymous',
        photoURL: profile?.photoURL || user.photoURL || '',
        scope: 'all',
        supportRequest: {
          reason: cleanNeed,
          ...(goalAmount ? { amount: goalAmount } : {}),
        },
        ...(wantsMoney && goalAmount
          ? {
              fundingGoal: goalAmount,
              fundingCurrency: 'usd',
            }
          : {}),
        ...(wantsGift
          ? {
              giftLabel: cleanGiftLabel,
              giftType: 'wishlist',
              ...(cleanGiftLink ? { giftLink: cleanGiftLink } : {}),
            }
          : {}),
        ...(mediaUrls.imageUrl ? { imageUrl: mediaUrls.imageUrl } : {}),
        ...(mediaUrls.videoUrl ? { videoUrl: mediaUrls.videoUrl } : {}),
      });

      setNeedReason('');
      setStory('');
      setGoalInput('');
      setGiftLabel('');
      setGiftLink('');
      setSelectedMedia(null);
      setUploadProgress(null);

      Alert.alert('Request posted', 'Your support request is now live in the feed.');
      router.replace('/');
    } catch (err) {
      logger.error('Failed to publish support request', err);
      Alert.alert('Post failed', 'Could not publish your request. Please try again.');
      setUploadProgress(null);
    } finally {
      setPosting(false);
    }
  }, [
    giftLabel,
    giftLink,
    goalInput,
    needReason,
    profile?.displayName,
    profile?.photoURL,
    router,
    story,
    uploadMedia,
    user,
    wantsGift,
    wantsMoney,
  ]);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Create support request</Text>
            <Text style={styles.subtitle}>
              Post a photo or video, ask for money or gifts, and explain why.
            </Text>
          </View>

          <View style={styles.segmentRow}>
            {(['money', 'gift', 'both'] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setRequestType(option)}
                style={[
                  styles.segment,
                  requestType === option ? styles.segmentActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    requestType === option ? styles.segmentTextActive : null,
                  ]}
                >
                  {option === 'money'
                    ? 'Money'
                    : option === 'gift'
                      ? 'Gift'
                      : 'Both'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>What do you need?</Text>
            <TextInput
              value={needReason}
              onChangeText={setNeedReason}
              placeholder="Example: Help covering rent this month"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              maxLength={140}
            />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Why do you need it?</Text>
            <TextInput
              value={story}
              onChangeText={setStory}
              placeholder="Share your situation so supporters understand your story"
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.storyInput]}
              multiline
              textAlignVertical="top"
              maxLength={280}
            />
          </View>

          {wantsMoney ? (
            <View style={styles.formBlock}>
              <Text style={styles.label}>Funding goal (USD)</Text>
              <TextInput
                value={goalInput}
                onChangeText={setGoalInput}
                placeholder="250"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
          ) : null}

          {wantsGift ? (
            <>
              <View style={styles.formBlock}>
                <Text style={styles.label}>Gift item name</Text>
                <TextInput
                  value={giftLabel}
                  onChangeText={setGiftLabel}
                  placeholder="Example: Groceries for 2 weeks"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  maxLength={80}
                />
              </View>

              <View style={styles.formBlock}>
                <Text style={styles.label}>Wishlist link (optional)</Text>
                <TextInput
                  value={giftLink}
                  onChangeText={setGiftLink}
                  placeholder="https://"
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                />
              </View>
            </>
          ) : null}

          <View style={styles.formBlock}>
            <Text style={styles.label}>Photo or video</Text>
            <Pressable
              accessibilityRole="button"
              onPress={pickMedia}
              style={styles.mediaButton}
            >
              <Ionicons name="images-outline" size={18} color="#0f172a" />
              <Text style={styles.mediaButtonText}>
                {selectedMedia ? 'Change media' : 'Attach media'}
              </Text>
            </Pressable>

            {selectedMedia ? (
              <View style={styles.mediaPreviewWrap}>
                {selectedMedia.type === 'image' ? (
                  <Image
                    source={{ uri: selectedMedia.uri }}
                    style={styles.mediaPreviewImage}
                  />
                ) : (
                  <View style={styles.mediaPreviewVideo}>
                    <Ionicons name="videocam" size={24} color="#ffffff" />
                    <Text style={styles.mediaPreviewVideoText}>Video ready</Text>
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedMedia(null)}
                  style={styles.removeMediaButton}
                >
                  <Text style={styles.removeMediaButtonText}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {uploadProgress !== null ? (
            <Text style={styles.uploadText}>Uploading media: {uploadProgress}%</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void handleSubmit();
            }}
            disabled={posting}
            style={[styles.submitButton, posting ? styles.submitButtonDisabled : null]}
          >
            {posting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>Publish request</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 6,
    color: '#475569',
    lineHeight: 20,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  segmentActive: {
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
  },
  segmentText: {
    color: '#334155',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  formBlock: {
    marginBottom: 14,
  },
  label: {
    marginBottom: 6,
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    fontSize: 15,
  },
  storyInput: {
    minHeight: 110,
  },
  mediaButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediaButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  mediaPreviewWrap: {
    marginTop: 10,
  },
  mediaPreviewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  mediaPreviewVideo: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 30,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mediaPreviewVideoText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  removeMediaButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeMediaButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 12,
  },
  uploadText: {
    color: '#334155',
    marginBottom: 10,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
});
