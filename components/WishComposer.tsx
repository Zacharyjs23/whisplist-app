import React, { useMemo, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
  Pressable,
  StyleSheet,
  Animated,
  Linking,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import type { PostType } from '@/types/post';
import { POST_TYPE_META, POST_TYPE_ORDER, normalizePostType } from '@/types/post';

export interface WishComposerProps {
  wish: string;
  setWish: (v: string) => void;
  dailyPrompt: string;
  typePrompt?: string;
  rephrasing: boolean;
  onRephrase: () => void;
  postType: PostType;
  setPostType: (v: PostType) => void;
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
  isPoll: boolean;
  setIsPoll: (v: boolean) => void;
  optionA: string;
  setOptionA: (v: string) => void;
  optionB: string;
  setOptionB: (v: string) => void;
  includeAudio: boolean;
  setIncludeAudio: (v: boolean) => void;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  resetRecorder: () => void;
  stripeEnabled?: boolean | null;
  enableExternalGift: boolean;
  setEnableExternalGift: (v: boolean) => void;
  fundingEnabled: boolean;
  setFundingEnabled: (v: boolean) => void;
  fundingGoal: string;
  setFundingGoal: (v: string) => void;
  fundingPresets: string;
  setFundingPresets: (v: string) => void;
  giftLink: string;
  setGiftLink: (v: string) => void;
  giftType: string;
  setGiftType: (v: string) => void;
  giftLabel: string;
  setGiftLabel: (v: string) => void;
  useProfilePost: boolean;
  setUseProfilePost: (v: boolean) => void;
  autoDelete: boolean;
  setAutoDelete: (v: boolean) => void;
  selectedImage: string | null;
  pickImage: () => void;
  posting: boolean;
  uploadProgress?: number | null;
  uploadStage?: 'audio' | 'image' | null;
  errorText?: string | null;
  onRetry?: () => void;
  isDraftLoaded?: boolean;
  draftSavedAt?: number | null;
  onSaveDraft?: () => void;
  onDiscardDraft?: () => void;
  hasPendingQueue?: boolean;
  onSubmit: () => void;
  maxWishLength: number;
  maxLinkLength: number;
  isAuthenticated: boolean;
}

export const WishComposer: React.FC<WishComposerProps> = (props) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const promptOpacity = useRef(new Animated.Value(1)).current;

  const typeMeta = POST_TYPE_META[props.postType];
  const typeColor = typeMeta.color;
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
  const supportLabel = props.postType === 'struggle'
    ? t(
        'composer.support.struggle',
        'Need immediate help? Tap here for support resources.',
      )
    : null;
  const handleSupportPress = useCallback(() => {
    if (props.postType !== 'struggle') return;
    Linking.openURL('https://988lifeline.org/').catch(() => {});
  }, [props.postType]);

  const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

  const formatSavedAt = (ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 15_000) return t('composer.savedJustNow', 'just now');
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return t('composer.savedMinsAgo', '{{mins}}m ago', { mins });
    const hrs = Math.floor(mins / 60);
    return t('composer.savedHoursAgo', '{{hrs}}h ago', { hrs });
  };

  return (
    <View style={[styles.formCard, formTintStyle]}>
      <Text style={styles.sectionTitle}>{t('composer.title', "💭 What’s your wish today?")}</Text>
      {props.isDraftLoaded ? (
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {t('composer.draftLoaded', 'Draft loaded')}
              {props.draftSavedAt
                ? ` · ${formatSavedAt(props.draftSavedAt)}`
                : ''}
            </Text>
          </View>
          {props.onDiscardDraft && (
            <TouchableOpacity onPress={props.onDiscardDraft} hitSlop={HIT_SLOP}>
              <Text style={[styles.link, { color: theme.tint }]}>{t('composer.discardDraft', 'Discard')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder={typePlaceholder}
        placeholderTextColor={theme.placeholder}
        value={props.wish}
        onChangeText={props.setWish}
        maxLength={props.maxWishLength}
      />
      <Text
        style={[
          styles.counter,
          props.wish.length >= props.maxWishLength * 0.9
            ? { color: '#f59e0b' }
            : null,
        ]}
      >
        {props.wish.length} / {props.maxWishLength}
      </Text>
      <TouchableOpacity
        onPress={props.onRephrase}
        style={[styles.button, { marginBottom: 10 }]}
        disabled={props.rephrasing || props.wish.trim() === ''}
        hitSlop={HIT_SLOP}
      >
        <Text style={styles.buttonText}>
          {props.rephrasing
            ? t('composer.thinking', 'Thinking...')
            : t('composer.rephraseButton', '✨ Help me rephrase this')}
        </Text>
      </TouchableOpacity>

      {props.dailyPrompt !== '' && (
        <>
          <Text style={styles.promptTitle}>{t('composer.dailyPromptTitle', 'Daily Prompt ✨')}</Text>
          <Animated.View style={[styles.promptCard, { opacity: promptOpacity }]}>
            <Text style={styles.promptText}>{props.dailyPrompt}</Text>
          </Animated.View>
        </>
      )}

      <Text style={styles.label}>{t('composer.postType', 'Post Type')}</Text>
      <Picker
        selectedValue={props.postType}
        onValueChange={(val) => props.setPostType(normalizePostType(val as string))}
        style={styles.input}
        dropdownIconColor="#fff"
      >
        {POST_TYPE_ORDER.map((type) => {
          const meta = POST_TYPE_META[type];
          return (
            <Picker.Item
              key={type}
              label={t(`composer.type.${type}`, meta.defaultLabel)}
              value={type}
            />
          );
        })}
      </Picker>

      {props.typePrompt ? (
        <View style={[styles.typePromptCard, typePromptCardStyle]}>
          <Text style={[styles.typePromptTitle, { color: typeColor }]}>
            {t('composer.typePromptTitle', 'Need a spark?')}
          </Text>
          <Text style={[styles.typePromptText, { color: theme.text }]}>
            {props.typePrompt}
          </Text>
        </View>
      ) : null}

      {/* Advanced options */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: theme.text, marginRight: 8 }}>{t('composer.advancedOptions', 'Advanced options')}</Text>
        <Switch value={props.showAdvanced} onValueChange={props.setShowAdvanced} />
      </View>

      {props.showAdvanced && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: theme.text, marginRight: 8 }}>{t('composer.pollMode', 'Poll mode')}</Text>
        <Switch value={props.isPoll} onValueChange={props.setIsPoll} />
      </View>
      {props.isPoll && (
        <>
          <Text style={styles.label}>{t('composer.optionA', 'Option A')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('composer.optionA', 'Option A')}
            placeholderTextColor={theme.placeholder}
            value={props.optionA}
            onChangeText={props.setOptionA}
          />
          <Text style={styles.label}>{t('composer.optionB', 'Option B')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('composer.optionB', 'Option B')}
            placeholderTextColor={theme.placeholder}
            value={props.optionB}
            onChangeText={props.setOptionB}
          />
        </>
      )}

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: theme.text, marginRight: 8 }}>{t('composer.includeAudio', 'Include Audio')}</Text>
            <Switch
              value={props.includeAudio}
              onValueChange={(v) => {
                props.setIncludeAudio(v);
                if (!v) {
                  if (props.isRecording) props.stopRecording();
                  props.resetRecorder();
                }
              }}
            />
          </View>

          {props.stripeEnabled && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ color: theme.text, marginRight: 8 }}>{t('composer.addExternalGiftOption', 'Add External Gift Option')}</Text>
              <Switch value={props.enableExternalGift} onValueChange={props.setEnableExternalGift} />
            </View>
          )}
          {(!props.stripeEnabled || props.enableExternalGift) && (
            <>
              <Text style={styles.label}>{t('composer.addGiftLinkLabel', 'Add a gift link (e.g., Venmo, wishlist)')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('composer.giftLinkPlaceholder', 'Gift link (optional)')}
                placeholderTextColor={theme.placeholder}
                value={props.giftLink}
                onChangeText={props.setGiftLink}
                maxLength={props.maxLinkLength}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!!props.giftLink && !/^https?:\/\//.test(props.giftLink) && (
                <Text style={[styles.helper, { color: '#f87171' }]}>
                  {t('composer.invalidLink', 'Link should start with http:// or https://')}
                </Text>
              )}
              {!!props.giftLink && (
                <Text
                  style={[
                    styles.counter,
                    props.giftLink.length >= props.maxLinkLength * 0.9
                      ? { color: '#f59e0b' }
                      : null,
                  ]}
                >
                  {props.giftLink.length} / {props.maxLinkLength}
                </Text>
              )}
              <Text style={styles.label}>{t('composer.giftType', 'Gift Type')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('composer.giftTypePlaceholder', 'kofi, paypal, etc')}
                placeholderTextColor={theme.placeholder}
                value={props.giftType}
                onChangeText={props.setGiftType}
              />
              <Text style={styles.label}>{t('composer.giftLabel', 'Gift Label')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('composer.giftLabelPlaceholder', 'Support on Ko-fi')}
                placeholderTextColor={theme.placeholder}
                value={props.giftLabel}
                onChangeText={props.setGiftLabel}
              />
            </>
          )}
          {props.stripeEnabled && (
            <View style={styles.fundingBlock}>
              <View style={styles.switchRow}>
                <Text style={{ color: theme.text, flex: 1 }}>
                  {t('composer.enableFunding', 'Enable funding goal')}
                </Text>
                <Switch value={props.fundingEnabled} onValueChange={props.setFundingEnabled} />
              </View>
              {props.fundingEnabled && (
                <>
                  <Text style={styles.label}>{t('composer.fundingGoal', 'Funding goal (USD)')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('composer.fundingGoalPlaceholder', 'Target amount')}
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    value={props.fundingGoal}
                    onChangeText={props.setFundingGoal}
                  />
                  <Text style={styles.label}>{t('composer.fundingPresets', 'Suggested amounts')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('composer.fundingPresetsPlaceholder', 'e.g. 5,10,25')}
                    placeholderTextColor={theme.placeholder}
                    value={props.fundingPresets}
                    onChangeText={props.setFundingPresets}
                  />
                  <Text style={[styles.helper, { color: theme.placeholder }]}>
                    {t('composer.fundingPresetsHelper', 'Use commas to separate quick amounts supporters can tap.')}
                  </Text>
                </>
              )}
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: theme.text, marginRight: 8 }}>{t('composer.postWithProfile', 'Post with profile')}</Text>
            <Switch value={props.useProfilePost} onValueChange={props.setUseProfilePost} />
          </View>
        </>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: theme.text, marginRight: 8 }}>{t('composer.autoDelete24h', 'Auto-delete after 24h')}</Text>
        <Switch value={props.autoDelete} onValueChange={props.setAutoDelete} />
      </View>

      {props.includeAudio && (
        <TouchableOpacity
          style={[styles.recButton, { backgroundColor: props.isRecording ? '#ef4444' : '#22c55e' }]}
          onPress={props.isRecording ? props.stopRecording : props.startRecording}
          hitSlop={HIT_SLOP}
        >
          <Text style={styles.buttonText}>
            {props.isRecording
              ? t('composer.stopRecording', 'Stop Recording')
              : t('composer.recordAudio', 'Record Audio')}
          </Text>
        </TouchableOpacity>
      )}

      {props.posting && props.uploadProgress !== null && (
        <Text style={[styles.helper, { color: theme.text }]}>
          {props.uploadStage === 'audio'
            ? t('composer.uploadingAudio', 'Uploading audio')
            : props.uploadStage === 'image'
              ? t('composer.uploadingImage', 'Uploading image')
              : t('composer.uploading', 'Uploading')}{' '}
          {Math.min(100, Math.max(0, props.uploadProgress ?? 0))}%
        </Text>
      )}

      {props.selectedImage && (
        <ExpoImage
          source={props.selectedImage}
          style={styles.preview}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      )}
      <TouchableOpacity
        style={styles.button}
        onPress={props.pickImage}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={
          props.selectedImage
            ? t('composer.changeImage', 'Change Image')
            : t('composer.attachImage', 'Attach Image')
        }
      >
        <Text style={styles.buttonText}>
          {props.selectedImage
            ? t('composer.changeImage', 'Change Image')
            : t('composer.attachImage', 'Attach Image')}
        </Text>
      </TouchableOpacity>

      <Pressable
        style={[styles.button, { opacity: props.wish.trim() === '' || props.posting ? 0.5 : 1 }]}
        onPress={props.onSubmit}
        disabled={props.wish.trim() === '' || props.posting}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('composer.postWish', 'Post Wish')}
      >
        {props.posting ? (
          props.uploadProgress || props.uploadProgress === 0 ? (
            <Text style={styles.buttonText}>
              {t('composer.uploading', 'Uploading')} {Math.min(100, Math.max(0, props.uploadProgress ?? 0))}%
            </Text>
          ) : (
            <ActivityIndicator color="#fff" />
          )
        ) : (
          <>
            <Text style={styles.buttonText}>{t('composer.postWish', 'Post Wish')}</Text>
            {(props.isDraftLoaded || props.hasPendingQueue) && (
              <View style={styles.badgeDot} />
            )}
          </>
        )}
      </Pressable>

      {props.posting && props.uploadProgress !== null && (
        <View style={styles.progressBarOuter}>
          <View
            style={[
              styles.progressBarInner,
              { width: `${Math.min(100, Math.max(0, props.uploadProgress ?? 0))}%`, backgroundColor: theme.tint },
            ]}
          />
        </View>
      )}

      {props.errorText ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: '#f87171', marginBottom: 6 }}>
            {props.errorText}
          </Text>
          {props.onRetry && (
            <TouchableOpacity
              onPress={props.onRetry}
              accessibilityRole="button"
              accessibilityLabel={t('composer.retry', 'Retry upload')}
            >
              <Text style={{ color: theme.tint, textDecorationLine: 'underline' }}>
                {t('composer.retry', 'Retry upload')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {props.onSaveDraft && (
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            props.errorText ? styles.secondaryButtonErrorSpacing : null,
          ]}
          onPress={props.onSaveDraft}
          accessibilityRole="button"
          accessibilityLabel={t('composer.saveDraft', 'Save as draft')}
        >
          <Text style={[styles.buttonText, { color: theme.text }]}> 
            {t('composer.saveDraft', 'Save as draft')}
          </Text>
        </TouchableOpacity>
      )}

      {supportLabel ? (
        <TouchableOpacity
          style={[styles.supportRow, { borderColor: withAlpha(typeColor, 0.45) }]}
          onPress={handleSupportPress}
          accessibilityRole="link"
        >
          <Text style={[styles.supportText, { color: typeColor }]}>
            {supportLabel}
          </Text>
        </TouchableOpacity>
      ) : null}

      {!props.isAuthenticated ? (
        <TouchableOpacity onPress={() => router.push('/auth')} style={styles.authButton}>
          <Text style={styles.authButtonText}>{t('composer.goToAuth', 'Go to Auth')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const createStyles = (c: { background: string; input: string; text: string; tint: string }) =>
  StyleSheet.create({
    formCard: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: c.input,
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '600',
      marginBottom: 8,
      fontSize: 16,
    },
    label: {
      color: c.text,
      marginBottom: 4,
    },
    input: {
      backgroundColor: c.background,
      color: c.text,
      padding: 14,
      borderRadius: 10,
      marginBottom: 10,
    },
    counter: {
      color: c.text,
      opacity: 0.7,
      fontSize: 12,
      alignSelf: 'flex-end',
      marginTop: -6,
      marginBottom: 10,
    },
    helper: {
      fontSize: 12,
      marginTop: -4,
      marginBottom: 8,
    },
    fundingBlock: {
      backgroundColor: c.background,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    progressBarOuter: {
      height: 6,
      borderRadius: 4,
      backgroundColor: c.background,
      overflow: 'hidden',
      marginTop: -12,
      marginBottom: 16,
    },
    progressBarInner: {
      height: 6,
      borderRadius: 4,
    },
    button: {
      backgroundColor: c.tint,
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 20,
      position: 'relative',
    },
    buttonText: {
      color: c.text,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: -10,
      marginBottom: 12,
    },
    secondaryButtonErrorSpacing: {
      marginTop: 12,
    },
    link: { textDecorationLine: 'underline', fontSize: 12 },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    chip: {
      backgroundColor: c.background,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    chipText: { color: c.text, fontSize: 12, fontWeight: '600' },
    promptCard: {
      backgroundColor: c.background,
      padding: 12,
      borderRadius: 8,
      marginBottom: 10,
    },
    promptTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '600',
      marginTop: 10,
      marginBottom: 4,
    },
    promptText: {
      color: c.text,
      fontSize: 16,
    },
    typePromptCard: {
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      marginBottom: 14,
    },
    typePromptTitle: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 4,
    },
    typePromptText: {
      fontSize: 13,
      lineHeight: 18,
    },
    supportRow: {
      borderRadius: 10,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    supportText: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    recButton: {
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 10,
    },
    preview: {
      width: '100%',
      height: 200,
      borderRadius: 10,
      marginBottom: 10,
    },
    authButton: {
      marginBottom: 20,
      alignItems: 'center',
    },
    authButtonText: {
      color: c.tint,
      fontSize: 14,
      textDecorationLine: 'underline',
    },
    badgeDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.background === '#000' ? '#fff' : c.tint,
    },
  });

const withAlpha = (input: string, alpha: number): string => {
  const value = input.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expanded = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
    if (expanded.length === 6) {
      const r = parseInt(expanded.slice(0, 2), 16);
      const g = parseInt(expanded.slice(2, 4), 16);
      const b = parseInt(expanded.slice(4, 6), 16);
      if ([r, g, b].every((channel) => Number.isFinite(channel))) {
        const clamped = Math.max(0, Math.min(alpha, 1));
        return `rgba(${r}, ${g}, ${b}, ${clamped})`;
      }
    }
  }
  return value;
};

export default WishComposer;
