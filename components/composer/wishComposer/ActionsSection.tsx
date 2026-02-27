import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { withAlpha } from '@/components/composer/composerStyles';
import type { ComposerActionsState, ComposerSharedProps } from './sharedTypes';

type ActionsSectionProps = ComposerSharedProps &
  ComposerActionsState & {
    wish: string;
    onSupportPress?: () => void;
  };

export const ActionsSection: React.FC<ActionsSectionProps> = ({
  wish,
  posting,
  uploadProgress,
  onSubmit,
  onRetry,
  onSaveDraft,
  errorText,
  isDraftLoaded,
  hasPendingQueue,
  isAuthenticated,
  supportLabel,
  onSupportPress,
  styles,
  theme,
  t,
  typeColor,
  hitSlop,
}) => {
  const disabled = wish.trim() === '' || posting;
  const renderPrimaryContent = () => {
    if (!posting) {
      return (
        <>
          <Text style={styles.buttonText}>
            {t('composer.postWish', 'Post Wish')}
          </Text>
          {(isDraftLoaded || hasPendingQueue) && (
            <View style={styles.badgeDot} />
          )}
        </>
      );
    }
    if (uploadProgress || uploadProgress === 0) {
      return (
        <Text style={styles.buttonText}>
          {t('composer.uploading', 'Uploading')}{' '}
          {Math.min(100, Math.max(0, uploadProgress ?? 0))}%
        </Text>
      );
    }
    return <ActivityIndicator color="#fff" />;
  };

  return (
    <>
      <Pressable
        style={[styles.button, { opacity: disabled ? 0.5 : 1 }]}
        onPress={onSubmit}
        disabled={disabled}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={t('composer.postWish', 'Post Wish')}
      >
        {renderPrimaryContent()}
      </Pressable>

      {posting && uploadProgress !== null ? (
        <View style={styles.progressBarOuter}>
          <View
            style={[
              styles.progressBarInner,
              {
                width: `${Math.min(100, Math.max(0, uploadProgress ?? 0))}%`,
                backgroundColor: theme.tint,
              },
            ]}
          />
        </View>
      ) : null}

      {errorText ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: '#f87171', marginBottom: 6 }}>{errorText}</Text>
          {onRetry ? (
            <TouchableOpacity
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel={t('composer.retry', 'Retry upload')}
            >
              <Text
                style={{ color: theme.tint, textDecorationLine: 'underline' }}
              >
                {t('composer.retry', 'Retry upload')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {onSaveDraft ? (
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            errorText ? styles.secondaryButtonErrorSpacing : null,
          ]}
          onPress={onSaveDraft}
          accessibilityRole="button"
          accessibilityLabel={t('composer.saveDraft', 'Save as draft')}
        >
          <Text style={[styles.buttonText, { color: theme.text }]}>
            {t('composer.saveDraft', 'Save as draft')}
          </Text>
        </TouchableOpacity>
      ) : null}

      {supportLabel ? (
        <TouchableOpacity
          style={[
            styles.supportRow,
            { borderColor: withAlpha(typeColor, 0.45) },
          ]}
          onPress={onSupportPress}
          accessibilityRole="link"
        >
          <Text style={[styles.supportText, { color: typeColor }]}>
            {supportLabel}
          </Text>
        </TouchableOpacity>
      ) : null}

      {isAuthenticated ? null : (
        <TouchableOpacity
          onPress={() => router.push('/auth')}
          style={styles.authButton}
        >
          <Text style={styles.authButtonText}>
            {t('composer.goToAuth', 'Go to Auth')}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
};
