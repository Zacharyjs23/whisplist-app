import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Linking, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import {
  createComposerStyles,
  withAlpha,
} from '@/components/composer/composerStyles';
import { AdvancedOptionsModal } from '@/components/composer/AdvancedOptionsModal';
import type { WishComposerProps } from './types';
import { DraftBanner } from './DraftBanner';
import { FormSection } from './FormSection';
import { SupportSummarySection } from './SupportSummarySection';
import { AttachmentSection } from './AttachmentSection';
import { ActionsSection } from './ActionsSection';
import type { StageOption } from './sharedTypes';
import { WISH_STAGE_COPY, WISH_STAGE_ORDER } from '@/types/WishStage';
import { POST_TYPE_META } from '@/types/post';

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

const formatSavedAtFallback =
  (t: ReturnType<typeof useTranslation>['t']) => (ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 15_000) return t('composer.savedJustNow', 'just now');
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return t('composer.savedMinsAgo', '{{mins}}m ago', { mins });
    const hrs = Math.floor(mins / 60);
    return t('composer.savedHoursAgo', '{{hrs}}h ago', { hrs });
  };

export const WishComposer: React.FC<WishComposerProps> = (props) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createComposerStyles(theme), [theme]);
  const promptOpacity = useRef(new Animated.Value(1)).current;
  const typeMeta = POST_TYPE_META[props.postType];
  const typeColor = typeMeta.color;
  const stageMeta = useMemo(() => WISH_STAGE_COPY[props.stage], [props.stage]);
  const stageOptions = useMemo<StageOption[]>(
    () =>
      WISH_STAGE_ORDER.map((value) => ({
        value,
        title: WISH_STAGE_COPY[value].title,
        description: WISH_STAGE_COPY[value].description,
      })),
    [],
  );
  const formTintStyle = useMemo(
    () => ({
      borderColor: withAlpha(typeColor, 0.45),
      backgroundColor: withAlpha(typeColor, 0.1),
      borderWidth: 1,
    }),
    [typeColor],
  );
  const typePromptCardStyle = useMemo(
    () => ({
      borderColor: withAlpha(typeColor, 0.45),
      backgroundColor: withAlpha(typeColor, 0.16),
    }),
    [typeColor],
  );
  const typePlaceholder = useMemo(
    () =>
      t(
        `composer.placeholderByType.${props.postType}`,
        t('composer.placeholderWish', "What's your wish?"),
      ),
    [props.postType, t],
  );
  const supportLabel =
    props.postType === 'struggle'
      ? t(
          'composer.support.struggle',
          'Need immediate help? Tap here for support resources.',
        )
      : null;
  const handleSupportPress = useCallback(() => {
    if (props.postType !== 'struggle') return;
    Linking.openURL('https://988lifeline.org/').catch(() => {});
  }, [props.postType]);

  const stripeEnabled = props.stripeEnabled;
  const { supportAmount, setSupportAmount, supportReason, setSupportReason } =
    props;
  const supportActive =
    Boolean(stripeEnabled) &&
    (supportAmount.trim().length > 0 || supportReason.trim().length > 0);

  const hasAdvancedSelection = useMemo(
    () =>
      props.isPoll ||
      props.includeAudio ||
      props.giftLink.trim().length > 0 ||
      props.fundingEnabled ||
      props.autoDelete ||
      props.postScope !== 'all' ||
      supportActive ||
      !!props.selectedCircleId,
    [
      props.autoDelete,
      props.fundingEnabled,
      props.giftLink,
      props.includeAudio,
      props.isPoll,
      props.postScope,
      props.selectedCircleId,
      supportActive,
    ],
  );

  const formattedSupportAmount = useMemo(() => {
    const cleaned = supportAmount.replace(/[^0-9.]/g, '');
    if (!cleaned) return '';
    const value = Number(cleaned);
    if (!Number.isFinite(value) || value <= 0) return supportAmount.trim();
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return supportAmount.trim();
    }
  }, [supportAmount]);

  const hasSupportPreview = supportActive;

  useEffect(() => {
    if (!stripeEnabled && (supportAmount || supportReason)) {
      if (supportAmount) setSupportAmount('');
      if (supportReason) setSupportReason('');
    }
  }, [
    stripeEnabled,
    supportAmount,
    supportReason,
    setSupportAmount,
    setSupportReason,
  ]);

  const openAdvanced = useCallback(() => {
    props.setShowAdvanced(true);
  }, [props]);

  const closeAdvanced = useCallback(() => {
    props.setShowAdvanced(false);
  }, [props]);

  const formatSavedAt = useMemo(() => formatSavedAtFallback(t), [t]);

  return (
    <View style={[styles.formCard, formTintStyle]}>
      <DraftBanner
        isDraftLoaded={props.isDraftLoaded}
        draftSavedAt={props.draftSavedAt ?? undefined}
        onDiscardDraft={props.onDiscardDraft}
        formatSavedAt={formatSavedAt}
        styles={styles}
        theme={theme}
        t={t}
        typeColor={typeColor}
        hitSlop={HIT_SLOP}
      />

      <FormSection
        wish={props.wish}
        setWish={props.setWish}
        maxWishLength={props.maxWishLength}
        rephrasing={props.rephrasing}
        onRephrase={props.onRephrase}
        postType={props.postType}
        setPostType={props.setPostType}
        typePrompt={props.typePrompt}
        typePlaceholder={typePlaceholder}
        typePromptCardStyle={typePromptCardStyle}
        stage={props.stage}
        setStage={props.setStage}
        stageOptions={stageOptions}
        stageMeta={stageMeta}
        dailyPrompt={props.dailyPrompt}
        promptOpacity={promptOpacity}
        hasAdvancedSelection={hasAdvancedSelection}
        onOpenAdvanced={openAdvanced}
        styles={styles}
        theme={theme}
        t={t}
        typeColor={typeColor}
        hitSlop={HIT_SLOP}
      />

      <SupportSummarySection
        hasSupportPreview={hasSupportPreview}
        formattedSupportAmount={formattedSupportAmount}
        supportAmountRaw={supportAmount}
        supportReason={supportReason}
        onEdit={openAdvanced}
        onClear={() => {
          setSupportAmount('');
          setSupportReason('');
        }}
        styles={styles}
        theme={theme}
        t={t}
        typeColor={typeColor}
        hitSlop={HIT_SLOP}
      />

      <AttachmentSection
        posting={props.posting}
        uploadProgress={props.uploadProgress}
        uploadStage={props.uploadStage}
        selectedImage={props.selectedImage}
        onPickImage={props.pickImage}
        styles={styles}
        theme={theme}
        t={t}
        typeColor={typeColor}
        hitSlop={HIT_SLOP}
      />

      <ActionsSection
        wish={props.wish}
        posting={props.posting}
        uploadProgress={props.uploadProgress}
        onSubmit={props.onSubmit}
        onRetry={props.onRetry}
        onSaveDraft={props.onSaveDraft}
        errorText={props.errorText}
        isDraftLoaded={props.isDraftLoaded}
        hasPendingQueue={props.hasPendingQueue}
        isAuthenticated={props.isAuthenticated}
        supportLabel={supportLabel}
        onSupportPress={handleSupportPress}
        styles={styles}
        theme={theme}
        t={t}
        typeColor={typeColor}
        hitSlop={HIT_SLOP}
      />

      <AdvancedOptionsModal
        visible={props.showAdvanced}
        onClose={closeAdvanced}
        t={t}
        theme={theme}
        styles={styles}
        hitSlop={HIT_SLOP}
        composer={{
          isPoll: props.isPoll,
          setIsPoll: props.setIsPoll,
          optionA: props.optionA,
          setOptionA: props.setOptionA,
          optionB: props.optionB,
          setOptionB: props.setOptionB,
          includeAudio: props.includeAudio,
          setIncludeAudio: props.setIncludeAudio,
          isRecording: props.isRecording,
          startRecording: props.startRecording,
          stopRecording: props.stopRecording,
          resetRecorder: props.resetRecorder,
          postScope: props.postScope,
          setPostScope: props.setPostScope,
          autoDelete: props.autoDelete,
          setAutoDelete: props.setAutoDelete,
          circles: props.circles,
          circlesLoading: props.circlesLoading,
          selectedCircleId: props.selectedCircleId,
          onSelectCircle: props.onSelectCircle,
          onCreateCircle: props.onCreateCircle,
          stripeEnabled,
          enableExternalGift: props.enableExternalGift,
          setEnableExternalGift: props.setEnableExternalGift,
          fundingEnabled: props.fundingEnabled,
          setFundingEnabled: props.setFundingEnabled,
          fundingGoal: props.fundingGoal,
          setFundingGoal: props.setFundingGoal,
          fundingPresets: props.fundingPresets,
          setFundingPresets: props.setFundingPresets,
          giftLink: props.giftLink,
          setGiftLink: props.setGiftLink,
          giftType: props.giftType,
          setGiftType: props.setGiftType,
          giftLabel: props.giftLabel,
          setGiftLabel: props.setGiftLabel,
          maxLinkLength: props.maxLinkLength,
        }}
        supportAmount={supportAmount}
        setSupportAmount={setSupportAmount}
        supportReason={supportReason}
        setSupportReason={setSupportReason}
      />
    </View>
  );
};

export type { WishComposerProps };
