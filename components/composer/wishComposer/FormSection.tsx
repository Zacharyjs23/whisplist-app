import React from 'react';
import {
  Animated,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { PostType } from '@/types/post';
import {
  normalizePostType,
  POST_TYPE_META,
  POST_TYPE_ORDER,
} from '@/types/post';
import type { WishStage } from '@/types/WishStage';
import { WISH_STAGE_COPY } from '@/types/WishStage';
import { withAlpha } from '@/components/composer/composerStyles';
import type { ComposerSharedProps, StageOption } from './sharedTypes';

type FormSectionProps = ComposerSharedProps & {
  wish: string;
  setWish: (value: string) => void;
  maxWishLength: number;
  rephrasing: boolean;
  onRephrase: () => void;
  postType: PostType;
  setPostType: (value: PostType) => void;
  typePrompt?: string;
  typePlaceholder: string;
  typePromptCardStyle: ViewStyle;
  stage: WishStage;
  setStage: (stage: WishStage) => void;
  stageOptions: StageOption[];
  dailyPrompt: string;
  promptOpacity: Animated.Value;
  stageMeta: (typeof WISH_STAGE_COPY)[WishStage];
  hasAdvancedSelection: boolean;
  onOpenAdvanced: () => void;
};

export const FormSection: React.FC<FormSectionProps> = ({
  wish,
  setWish,
  maxWishLength,
  rephrasing,
  onRephrase,
  postType,
  setPostType,
  typePrompt,
  typePlaceholder,
  typePromptCardStyle,
  stage,
  setStage,
  stageOptions,
  stageMeta,
  dailyPrompt,
  promptOpacity,
  hasAdvancedSelection,
  onOpenAdvanced,
  styles,
  theme,
  t,
  typeColor,
  hitSlop,
}) => {
  return (
    <>
      <Text style={styles.sectionTitle}>
        {t('composer.title', '💭 What’s your wish today?')}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={typePlaceholder}
        placeholderTextColor={theme.placeholder}
        value={wish}
        onChangeText={setWish}
        maxLength={maxWishLength}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        keyboardAppearance="default"
      />
      <Text
        style={[
          styles.counter,
          wish.length >= maxWishLength * 0.9 ? { color: '#f59e0b' } : null,
        ]}
      >
        {wish.length} / {maxWishLength}
      </Text>
      <TouchableOpacity
        onPress={onRephrase}
        style={[styles.button, { marginBottom: 10 }]}
        disabled={rephrasing || wish.trim() === ''}
        hitSlop={hitSlop}
      >
        <Text style={styles.buttonText}>
          {rephrasing
            ? t('composer.thinking', 'Thinking...')
            : t('composer.rephraseButton', '✨ Help me rephrase this')}
        </Text>
      </TouchableOpacity>

      {dailyPrompt ? (
        <>
          <Text style={styles.promptTitle}>
            {t('composer.dailyPromptTitle', 'Daily Prompt ✨')}
          </Text>
          <Animated.View
            style={[styles.promptCard, { opacity: promptOpacity }]}
          >
            <Text style={styles.promptText}>{dailyPrompt}</Text>
          </Animated.View>
        </>
      ) : null}

      <Text style={styles.label}>{t('composer.postType', 'Post Type')}</Text>
      <Picker
        selectedValue={postType}
        onValueChange={(val) => setPostType(normalizePostType(val as string))}
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

      {typePrompt ? (
        <View style={[styles.typePromptCard, typePromptCardStyle]}>
          <Text style={[styles.typePromptTitle, { color: typeColor }]}>
            {t('composer.typePromptTitle', 'Need a spark?')}
          </Text>
          <Text style={[styles.typePromptText, { color: theme.text }]}>
            {typePrompt}
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>
        {t('composer.wishStageLabel', 'Wish stage')}
      </Text>
      <View style={styles.stageRow}>
        {stageOptions.map((option) => {
          const isActive = option.value === stage;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.stageChip,
                {
                  borderColor: isActive
                    ? typeColor
                    : withAlpha(theme.text, 0.25),
                  backgroundColor: isActive
                    ? withAlpha(typeColor, 0.18)
                    : withAlpha(theme.text, 0.08),
                },
              ]}
              onPress={() => setStage(option.value as WishStage)}
              hitSlop={hitSlop}
              accessibilityRole="button"
              accessibilityLabel={option.title}
            >
              <Text
                style={[
                  styles.stageChipText,
                  { color: isActive ? typeColor : theme.text },
                ]}
              >
                {option.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text
        style={[styles.helper, { color: theme.placeholder, marginTop: -2 }]}
      >
        {stageMeta.description}
      </Text>
      <Text style={[styles.helper, { color: theme.tint, marginTop: -6 }]}>
        {stageMeta.nudge}
      </Text>

      <TouchableOpacity
        style={[
          styles.advancedButton,
          { borderColor: withAlpha(typeColor, 0.35) },
          hasAdvancedSelection ? styles.advancedButtonActive : null,
        ]}
        onPress={onOpenAdvanced}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={t('composer.advancedOptions', 'Advanced options')}
      >
        <Text style={[styles.advancedButtonText, { color: theme.text }]}>
          {t('composer.advancedOptions', 'Advanced options')}
        </Text>
        {hasAdvancedSelection ? <View style={styles.advancedBadge} /> : null}
      </TouchableOpacity>
    </>
  );
};
