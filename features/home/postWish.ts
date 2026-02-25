import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import { Timestamp } from 'firebase/firestore';
import { Alert } from 'react-native';
import type { TFunction } from 'i18next';
import type { User } from 'firebase/auth';
import type { Profile } from '@/types/Profile';
import type { WishScope } from '@/types/WishScope';
import type { PostType } from '@/types/post';
import type { MilestoneId } from '@/types/Engagement';
import { DEFAULT_WISH_STAGE, WISH_STAGE_ORDER, type WishStage } from '@/types/WishStage';
import type { AccountabilityCircle } from '@/hooks/useAccountabilityCircles';
import { addWish } from '@/helpers/wishes';
import { trackEvent } from '@/helpers/analytics';
import { optimizeImageForUpload } from '@/helpers/image';
import { uploadResumableWithProgress } from '@/helpers/storage';
import { enqueuePendingWish } from '@/helpers/offlineQueue';
import { scheduleWishFollowUpReminder } from '@/helpers/reminders';
import { sanitizeInput, buildWishPayload } from '@/features/home/wishPayload';
import * as logger from '@/shared/logger';

export type PostWishParams = {
  t: TFunction;
  storage: FirebaseStorage;
  user: User | null;
  profile: Profile | null;
  isSupporter: boolean;
  stripeEnabled: boolean;
  wish: string;
  postType: PostType;
  isPoll: boolean;
  optionA: string;
  optionB: string;
  includeAudio: boolean;
  recordedUri: string | null;
  giftLink: string;
  giftType: string;
  giftLabel: string;
  fundingEnabled: boolean;
  fundingGoal: string;
  fundingPresets: string;
  postScope: WishScope;
  autoDelete: boolean;
  enableExternalGift: boolean;
  supportAmount: string;
  supportReason: string;
  stage: WishStage;
  selectedCircleId: string | null;
  selectedCircle: AccountabilityCircle | null;
  circleForPayload: AccountabilityCircle | null;
  selectedImage: string | null;
  persistedAudioUrl: string;
  persistedImageUrl: string;
  maxWishLength: number;
  maxLinkLength: number;
  setPosting: (value: boolean) => void;
  setPostError: (value: string | null) => void;
  setUploadProgress: (value: number | null) => void;
  setUploadStage: (value: 'audio' | 'image' | null) => void;
  setPersistedAudioUrl: (value: string) => void;
  setPersistedImageUrl: (value: string) => void;
  setSelectedCircleId: (value: string | null) => void;
  setPostConfirm: (value: boolean) => void;
  setStreakCount: (value: number) => void;
  setDraftSavedAt: (value: number | null) => void;
  resetRecorder: () => void;
  resetComposer: (nextType?: PostType) => void;
  updateStreak: (
    userId?: string | null,
  ) => Promise<{ current: number; unlocked: MilestoneId[] }>;
  recordCheckIn: (circleId: string) => Promise<void>;
  onMilestoneUnlocked: (milestoneId: MilestoneId) => void;
  onPostTypeSubmitted: (type: PostType) => void;
};

export async function postWish({
  t,
  storage,
  user,
  profile,
  isSupporter,
  stripeEnabled,
  wish,
  postType,
  isPoll,
  optionA,
  optionB,
  includeAudio,
  recordedUri,
  giftLink,
  giftType,
  giftLabel,
  fundingEnabled,
  fundingGoal,
  fundingPresets,
  postScope,
  autoDelete,
  enableExternalGift,
  supportAmount,
  supportReason,
  stage,
  selectedCircleId,
  selectedCircle,
  circleForPayload,
  selectedImage,
  persistedAudioUrl,
  persistedImageUrl,
  maxWishLength,
  maxLinkLength,
  setPosting,
  setPostError,
  setUploadProgress,
  setUploadStage,
  setPersistedAudioUrl,
  setPersistedImageUrl,
  setSelectedCircleId,
  setPostConfirm,
  setStreakCount,
  setDraftSavedAt,
  resetRecorder,
  resetComposer,
  updateStreak,
  recordCheckIn,
  onMilestoneUnlocked,
  onPostTypeSubmitted,
}: PostWishParams): Promise<void> {
  const sanitizedWish = sanitizeInput(wish);
  const sanitizedLink = sanitizeInput(giftLink);
  const sanitizedGiftType = sanitizeInput(giftType);
  const sanitizedGiftLabel = sanitizeInput(giftLabel);
  const sanitizedOptionA = sanitizeInput(optionA);
  const sanitizedOptionB = sanitizeInput(optionB);
  const sanitizedSupportAmount = sanitizeInput(supportAmount);
  const sanitizedSupportReason = sanitizeInput(supportReason).slice(0, 500);
  const submittedType = postType;
  const parsedFundingGoal = fundingGoal.trim();
  const fundingGoalValue = parsedFundingGoal
    ? Number(parsedFundingGoal.replace(/[^0-9.]/g, ''))
    : NaN;
  const fundingPresetValues = fundingPresets
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const parsedSupportAmount = sanitizedSupportAmount.replace(/[^0-9.]/g, '');
  const supportAmountNumber = parsedSupportAmount
    ? Number(parsedSupportAmount)
    : NaN;
  const supportAmountValue =
    Number.isFinite(supportAmountNumber) && supportAmountNumber > 0
      ? supportAmountNumber
      : NaN;
  const hasSupportAmount = sanitizedSupportAmount.length > 0;
  const hasSupportReason = sanitizedSupportReason.length > 0;

  if (sanitizedWish === '') return;
  if (sanitizedWish.length > maxWishLength) {
    Alert.alert(
      t('composer.wishTooLongTitle', 'Wish too long'),
      t('composer.wishTooLong', { max: maxWishLength }),
    );
    return;
  }
  if (sanitizedLink.length > maxLinkLength) {
    Alert.alert(
      t('composer.linkTooLongTitle', 'Link too long'),
      t('composer.linkTooLong', { max: maxLinkLength }),
    );
    return;
  }
  if (fundingEnabled) {
    if (!Number.isFinite(fundingGoalValue) || fundingGoalValue <= 0) {
      Alert.alert(
        t('composer.fundingGoalErrorTitle', 'Set a goal'),
        t(
          'composer.fundingGoalErrorBody',
          'Enter a positive goal amount to enable funding.',
        ),
      );
      return;
    }
  }

  if ((hasSupportAmount || hasSupportReason) && !stripeEnabled) {
    Alert.alert(
      t('composer.supportRequiresStripeTitle', 'Connect payouts first'),
      t(
        'composer.supportRequiresStripeBody',
        'Enable Stripe payouts in Settings to accept in-app support.',
      ),
    );
    return;
  }

  if (hasSupportAmount && Number.isNaN(supportAmountValue)) {
    Alert.alert(
      t('composer.supportAmountInvalidTitle', 'Check your amount'),
      t(
        'composer.supportAmountInvalidBody',
        'Enter a valid dollar amount like 25 or 25.50.',
      ),
    );
    return;
  }

  if (hasSupportAmount && supportAmountValue > 0 && supportAmountValue > 100000) {
    Alert.alert(
      t('composer.supportAmountTooLargeTitle', 'Amount looks too large'),
      t('composer.supportAmountTooLargeBody', 'Try a number under $100,000.'),
    );
    return;
  }

  if (hasSupportAmount && !hasSupportReason) {
    Alert.alert(
      t('composer.supportReasonRequiredTitle', 'Add a short reason'),
      t(
        'composer.supportReasonRequiredBody',
        'Let supporters know why you need the funds.',
      ),
    );
    return;
  }

  if (!hasSupportAmount && hasSupportReason) {
    Alert.alert(
      t('composer.supportAmountMissingTitle', 'Add an amount'),
      t(
        'composer.supportAmountMissingBody',
        'Include a dollar amount so supporters know what to contribute.',
      ),
    );
    return;
  }

  if (!user) {
    setPostError(t('errors.authRequired', 'Please sign in before posting.'));
    return;
  }

  const expiresAt = autoDelete
    ? Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
    : undefined;

  const supportAllowed = Boolean(stripeEnabled);
  const includeSupportRequest =
    supportAllowed &&
    hasSupportAmount &&
    hasSupportReason &&
    Number.isFinite(supportAmountValue) &&
    supportAmountValue > 0;
  const normalizedStage: WishStage = WISH_STAGE_ORDER.includes(stage)
    ? stage
    : DEFAULT_WISH_STAGE;

  const basePayloadInput = {
    text: sanitizedWish,
    type: submittedType,
    userId: user.uid,
    displayName: profile?.displayName,
    photoURL: profile?.photoURL,
    scope: postScope,
    stage: normalizedStage,
    accountabilityCircle: circleForPayload,
    accountabilityCircleId: circleForPayload?.id ?? selectedCircleId ?? null,
    accountabilityCircleName: circleForPayload?.name ?? null,
    enableExternalGift,
    giftLink: sanitizedLink,
    giftType: sanitizedGiftType,
    giftLabel: sanitizedGiftLabel,
    fundingEnabled,
    fundingGoalValue,
    fundingPresetValues,
    isPoll,
    optionA: sanitizedOptionA,
    optionB: sanitizedOptionB,
    autoDelete,
    expiresAt,
    supportAmountValue: includeSupportRequest ? supportAmountValue : NaN,
    supportReason: includeSupportRequest ? sanitizedSupportReason : '',
  };

  setPosting(true);
  setPostError(null);
  let audioUrl = persistedAudioUrl || '';
  let imageUrl = persistedImageUrl || '';
  try {
    if (sanitizedLink && !/^https?:\/\//.test(sanitizedLink)) {
      Alert.alert(
        t('composer.invalidLinkTitle', 'Invalid link'),
        t('composer.invalidLink'),
      );
      return;
    }
    if (includeAudio && recordedUri && !audioUrl) {
      const resp = await fetch(recordedUri);
      const blob = await resp.blob();
      const storageRef = ref(storage, `audio/${Date.now()}.m4a`);
      setUploadProgress(0);
      setUploadStage('audio');
      await uploadResumableWithProgress(storageRef, blob, undefined, (pct) =>
        setUploadProgress(pct),
      );
      audioUrl = await getDownloadURL(storageRef);
      setPersistedAudioUrl(audioUrl);
      setUploadProgress(null);
      setUploadStage(null);
    }
    if (selectedImage && !imageUrl) {
      const optimizedUri = await optimizeImageForUpload(selectedImage, {
        maxWidth: isSupporter ? 2048 : 1600,
        compress: isSupporter ? 0.85 : 0.7,
        format: 'jpeg',
      });
      const resp = await fetch(optimizedUri);
      const blob = await resp.blob();
      const imageRef = ref(storage, `images/${Date.now()}`);
      setUploadProgress(0);
      setUploadStage('image');
      await uploadResumableWithProgress(imageRef, blob, undefined, (pct) =>
        setUploadProgress(pct),
      );
      imageUrl = await getDownloadURL(imageRef);
      setPersistedImageUrl(imageUrl);
      setUploadProgress(null);
      setUploadStage(null);
    }
    const payload = buildWishPayload({
      ...basePayloadInput,
      audioUrl,
      imageUrl,
    });
    const createdDoc = await addWish(payload);
    scheduleWishFollowUpReminder({
      stage: normalizedStage,
      wishId: createdDoc.id,
      wishText: sanitizedWish,
    }).catch((err) => {
      logger.warn('Failed to schedule wish follow-up reminder', err);
    });

    try {
      const raw = await AsyncStorage.getItem('reflectionHistory');
      const history = raw ? JSON.parse(raw) : [];
      history.unshift({ text: sanitizedWish, timestamp: Date.now() });
      if (history.length > 7) history.splice(7);
      await AsyncStorage.setItem('reflectionHistory', JSON.stringify(history));
    } catch (err) {
      logger.error('Failed to save reflection history', err);
    }

    resetRecorder();
    if (selectedCircle?.id) {
      try {
        await recordCheckIn(selectedCircle.id);
      } catch (err) {
        logger.warn('Failed to record accountability circle check-in', err);
      }
    }
    resetComposer(submittedType);
    setSelectedCircleId(null);
    setPostConfirm(true);
    setUploadProgress(null);
    const streakResult = await updateStreak(user.uid);
    setStreakCount(streakResult.current);
    if (streakResult.unlocked.length > 0) {
      onMilestoneUnlocked(streakResult.unlocked[0]);
    }
    try {
      trackEvent('post_success', {
        offline: false,
        has_image: !!imageUrl,
        has_audio: !!audioUrl,
        text_length: sanitizedWish.length,
        link_length: sanitizedLink.length,
        post_type: submittedType,
      });
    } catch {}
    onPostTypeSubmitted(submittedType);
    try {
      await AsyncStorage.removeItem('pendingPost.v1');
    } catch {}
    setPersistedAudioUrl('');
    setPersistedImageUrl('');
    setDraftSavedAt(null);
  } catch (error) {
    logger.error('❌ Failed to post wish:', error);
    const errorCode = (error as any)?.code;
    let message =
      (error as any)?.message ||
      t('errors.uploadFailed', 'Upload failed. Please try again.');
    const lowerMessage = typeof message === 'string' ? message.toLowerCase() : '';
    if (errorCode === 'permission-denied' || lowerMessage.includes('permission')) {
      if (!profile?.acceptedTermsAt) {
        message = t(
          'errors.permissionDeniedPostTerms',
          'Please accept the latest Terms in Settings before posting.',
        );
      } else {
        message = t(
          'errors.permissionDeniedPost',
          'Posting is disabled for your account right now. Contact support if you believe this is a mistake.',
        );
      }
    }
    setPostError(message);
    try {
      const retryPayload = buildWishPayload({
        ...basePayloadInput,
        audioUrl,
        imageUrl,
      }) as any;
      await enqueuePendingWish(retryPayload);
    } catch {}
    try {
      trackEvent('post_failed', {
        has_image: !!persistedImageUrl,
        has_audio: !!persistedAudioUrl,
        text_length: sanitizedWish.length,
        link_length: sanitizedLink.length,
        error: (error as any)?.message,
        post_type: submittedType,
      });
    } catch {}
    try {
      const draft = {
        wish: sanitizedWish,
        postType,
        isPoll,
        optionA: sanitizedOptionA,
        optionB: sanitizedOptionB,
        includeAudio,
        giftLink: sanitizedLink,
        giftType: sanitizedGiftType,
        giftLabel: sanitizedGiftLabel,
        fundingEnabled,
        fundingGoal,
        fundingPresets,
        postScope,
        autoDelete,
        enableExternalGift,
        supportAmount: sanitizedSupportAmount,
        supportReason: sanitizedSupportReason,
        persistedAudioUrl: audioUrl,
        persistedImageUrl: imageUrl,
        stage: normalizedStage,
        circleId: circleForPayload?.id ?? selectedCircleId,
        circleName: circleForPayload?.name ?? null,
        savedAt: Date.now(),
      };
      await AsyncStorage.setItem('pendingPost.v1', JSON.stringify(draft));
      setDraftSavedAt(draft.savedAt);
    } catch {}
  } finally {
    setPosting(false);
    setUploadProgress(null);
    setUploadStage(null);
  }
}
