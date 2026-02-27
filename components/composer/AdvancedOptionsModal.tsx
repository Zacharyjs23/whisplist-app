import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { TFunction } from 'i18next';
import type { WishComposerProps } from '@/components/WishComposer';
import type { ComposerStyles } from './composerStyles';
import { withAlpha } from './composerStyles';
import * as logger from '@/shared/logger';
import { WISH_SCOPES, type WishScope } from '@/types/WishScope';

type AdvancedComposerControls = Pick<
  WishComposerProps,
  | 'isPoll'
  | 'setIsPoll'
  | 'optionA'
  | 'setOptionA'
  | 'optionB'
  | 'setOptionB'
  | 'includeAudio'
  | 'setIncludeAudio'
  | 'isRecording'
  | 'startRecording'
  | 'stopRecording'
  | 'resetRecorder'
  | 'postScope'
  | 'setPostScope'
  | 'autoDelete'
  | 'setAutoDelete'
  | 'circles'
  | 'circlesLoading'
  | 'selectedCircleId'
  | 'onSelectCircle'
  | 'onCreateCircle'
  | 'stripeEnabled'
  | 'enableExternalGift'
  | 'setEnableExternalGift'
  | 'fundingEnabled'
  | 'setFundingEnabled'
  | 'fundingGoal'
  | 'setFundingGoal'
  | 'fundingPresets'
  | 'setFundingPresets'
  | 'giftLink'
  | 'setGiftLink'
  | 'giftType'
  | 'setGiftType'
  | 'giftLabel'
  | 'setGiftLabel'
  | 'maxLinkLength'
>;

type AdvancedOptionsModalProps = {
  visible: boolean;
  onClose: () => void;
  t: TFunction;
  theme: {
    background: string;
    input: string;
    text: string;
    tint: string;
    placeholder: string;
  };
  styles: ComposerStyles;
  hitSlop: { top: number; bottom: number; left: number; right: number };
  composer: AdvancedComposerControls;
  supportAmount: string;
  setSupportAmount: (value: string) => void;
  supportReason: string;
  setSupportReason: (value: string) => void;
};

export const AdvancedOptionsModal: React.FC<AdvancedOptionsModalProps> = ({
  visible,
  onClose,
  t,
  theme,
  styles,
  hitSlop,
  composer,
  supportAmount,
  setSupportAmount,
  supportReason,
  setSupportReason,
}) => {
  const [newCircleName, setNewCircleName] = useState('');
  const [cadenceInput, setCadenceInput] = useState('3');
  const [memberHint, setMemberHint] = useState('');
  const [creatingCircle, setCreatingCircle] = useState(false);
  const scopeCopy = useMemo<
    Record<WishScope, { title: string; description: string }>
  >(
    () => ({
      all: {
        title: t('composer.scope.all.title', 'Everyone'),
        description: t(
          'composer.scope.all.desc',
          'Profile shown to the whole community.',
        ),
      },
      friends: {
        title: t('composer.scope.friends.title', 'Friends'),
        description: t(
          'composer.scope.friends.desc',
          'Only mutual friends see it with your profile.',
        ),
      },
      close: {
        title: t('composer.scope.close.title', 'Close circle'),
        description: t(
          'composer.scope.close.desc',
          'Reserved for people you trust most.',
        ),
      },
      anon: {
        title: t('composer.scope.anon.title', 'Anonymous'),
        description: t(
          'composer.scope.anon.desc',
          'Everyone sees your wish without your identity.',
        ),
      },
    }),
    [t],
  );

  const selectedCircle = useMemo(
    () =>
      composer.circles.find(
        (circle) => circle.id === composer.selectedCircleId,
      ) ?? null,
    [composer.circles, composer.selectedCircleId],
  );

  const nextReminderLabel = useMemo(() => {
    if (!selectedCircle?.nextReminderAt) return null;
    const diffMs = selectedCircle.nextReminderAt - Date.now();
    if (diffMs <= 0) {
      return t(
        'composer.circleNextReminderSoon',
        'Next reminder is queued now',
      );
    }
    const minutes = Math.round(diffMs / 60000);
    if (minutes >= 1440) {
      const days = Math.round(minutes / 1440);
      return t('composer.circleNextReminderDays', { count: days });
    }
    if (minutes >= 60) {
      const hours = Math.round(minutes / 60);
      return t('composer.circleNextReminderHours', { count: hours });
    }
    return t('composer.circleNextReminderMinutes', {
      count: Math.max(1, minutes),
    });
  }, [selectedCircle?.nextReminderAt, t]);

  useEffect(() => {
    if (!selectedCircle) {
      setCadenceInput('3');
      setMemberHint('');
      return;
    }
    setCadenceInput(String(selectedCircle.cadenceDays));
    setMemberHint(selectedCircle.memberHint ?? '');
  }, [selectedCircle]);

  const handleCreateCircle = useCallback(async () => {
    const trimmed = newCircleName.trim();
    if (!trimmed) return;
    setCreatingCircle(true);
    try {
      const cadence = Math.max(1, Number.parseInt(cadenceInput, 10) || 3);
      const circle = await composer.onCreateCircle(
        trimmed,
        cadence,
        memberHint.trim() || undefined,
      );
      if (circle) {
        composer.onSelectCircle(circle.id);
        setNewCircleName('');
        setMemberHint('');
        setCadenceInput(String(circle.cadenceDays));
      }
    } catch (err) {
      logger.warn('Failed to create accountability circle', err);
    } finally {
      setCreatingCircle(false);
    }
  }, [newCircleName, cadenceInput, memberHint, composer]);

  const handleClearCircle = useCallback(() => {
    composer.onSelectCircle(null);
  }, [composer]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.input,
              borderColor: theme.placeholder,
            },
          ]}
        >
          <View
            style={[styles.modalHeader, { borderColor: theme.placeholder }]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {t('composer.advancedOptions', 'Advanced options')}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={hitSlop}>
              <Text style={[styles.modalClose, { color: theme.tint }]}>
                {t('common.done', 'Done')}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
          >
            <View style={styles.advancedSection}>
              <View style={styles.advancedRow}>
                <Text style={[styles.advancedLabel, { color: theme.text }]}>
                  {t('composer.pollMode', 'Poll mode')}
                </Text>
                <Switch
                  value={composer.isPoll}
                  onValueChange={composer.setIsPoll}
                />
              </View>
              {composer.isPoll ? (
                <>
                  <Text style={[styles.label, styles.modalSubLabel]}>
                    {t('composer.optionA', 'Option A')}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('composer.optionA', 'Option A')}
                    placeholderTextColor={theme.placeholder}
                    value={composer.optionA}
                    onChangeText={composer.setOptionA}
                  />
                  <Text style={[styles.label, styles.modalSubLabel]}>
                    {t('composer.optionB', 'Option B')}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('composer.optionB', 'Option B')}
                    placeholderTextColor={theme.placeholder}
                    value={composer.optionB}
                    onChangeText={composer.setOptionB}
                  />
                </>
              ) : null}
            </View>

            <View style={styles.advancedSection}>
              <View style={styles.advancedRow}>
                <Text style={[styles.advancedLabel, { color: theme.text }]}>
                  {t('composer.includeAudio', 'Include Audio')}
                </Text>
                <Switch
                  value={composer.includeAudio}
                  onValueChange={(value) => {
                    composer.setIncludeAudio(value);
                    if (!value) {
                      if (composer.isRecording) composer.stopRecording();
                      composer.resetRecorder();
                    }
                  }}
                />
              </View>
              {composer.includeAudio ? (
                <TouchableOpacity
                  style={[
                    styles.recButton,
                    {
                      backgroundColor: composer.isRecording
                        ? '#ef4444'
                        : '#22c55e',
                    },
                  ]}
                  onPress={
                    composer.isRecording
                      ? composer.stopRecording
                      : composer.startRecording
                  }
                  hitSlop={hitSlop}
                >
                  <Text style={styles.buttonText}>
                    {composer.isRecording
                      ? t('composer.stopRecording', 'Stop Recording')
                      : t('composer.recordAudio', 'Record Audio')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.advancedSection}>
              <Text
                style={[styles.advancedSectionTitle, { color: theme.text }]}
              >
                {t('composer.scope.heading', 'Audience & identity')}
              </Text>
              <View style={styles.circleChipRow}>
                {WISH_SCOPES.map((scope) => {
                  const option = scopeCopy[scope];
                  const active = composer.postScope === scope;
                  return (
                    <TouchableOpacity
                      key={scope}
                      style={[
                        styles.circleChip,
                        active
                          ? {
                              borderColor: theme.tint,
                              backgroundColor: withAlpha(theme.tint, 0.15),
                            }
                          : {
                              borderColor: withAlpha(theme.placeholder, 0.4),
                            },
                      ]}
                      onPress={() => composer.setPostScope(scope)}
                      hitSlop={hitSlop}
                    >
                      <Text
                        style={[
                          styles.circleChipText,
                          { color: active ? theme.tint : theme.text },
                        ]}
                      >
                        {option.title}
                      </Text>
                      <Text
                        style={[
                          styles.circleChipSubtext,
                          { color: theme.placeholder },
                        ]}
                      >
                        {option.description}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.advancedSection}>
              <View style={styles.advancedRow}>
                <Text style={[styles.advancedLabel, { color: theme.text }]}>
                  {t('composer.autoDelete24h', 'Auto-delete after 24h')}
                </Text>
                <Switch
                  value={composer.autoDelete}
                  onValueChange={composer.setAutoDelete}
                />
              </View>
            </View>

            <View style={styles.advancedSection}>
              <Text
                style={[styles.advancedSectionTitle, { color: theme.text }]}
              >
                {t('composer.accountabilityHeading', 'Accountability circle')}
              </Text>
              {composer.circlesLoading ? (
                <ActivityIndicator
                  color={theme.tint}
                  style={styles.circleLoading}
                />
              ) : composer.circles.length ? (
                <View style={styles.circleChipRow}>
                  {composer.circles.map((circle) => {
                    const isActive = circle.id === composer.selectedCircleId;
                    return (
                      <TouchableOpacity
                        key={circle.id}
                        style={[
                          styles.circleChip,
                          isActive
                            ? {
                                borderColor: theme.tint,
                                backgroundColor: withAlpha(theme.tint, 0.15),
                              }
                            : {
                                borderColor: withAlpha(theme.placeholder, 0.4),
                              },
                        ]}
                        onPress={() => composer.onSelectCircle(circle.id)}
                        hitSlop={hitSlop}
                      >
                        <Text
                          style={[
                            styles.circleChipText,
                            { color: isActive ? theme.tint : theme.text },
                          ]}
                        >
                          {circle.name}
                        </Text>
                        <Text
                          style={[
                            styles.circleChipSubtext,
                            { color: theme.placeholder },
                          ]}
                        >
                          {t('composer.circleCadence', '{{days}} day cadence', {
                            days: circle.cadenceDays,
                          })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={[styles.helper, { color: theme.placeholder }]}>
                  {t(
                    'composer.accountabilityEmpty',
                    'Create a close circle to nudge you forward.',
                  )}
                </Text>
              )}
              {selectedCircle ? (
                <Text style={[styles.helper, { color: theme.tint }]}>
                  {t(
                    'composer.accountabilityActive',
                    'Currently sharing with {{name}} every {{days}} days',
                    {
                      name: selectedCircle.name,
                      days: selectedCircle.cadenceDays,
                    },
                  )}
                </Text>
              ) : null}
              {selectedCircle && nextReminderLabel ? (
                <Text style={[styles.helper, { color: theme.placeholder }]}>
                  {nextReminderLabel}
                </Text>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder={t(
                  'composer.circleNamePlaceholder',
                  'Name your circle (e.g., “Morning Crew”)',
                )}
                placeholderTextColor={theme.placeholder}
                value={newCircleName}
                onChangeText={setNewCircleName}
              />
              <TextInput
                style={styles.input}
                placeholder={t(
                  'composer.circleCadencePlaceholder',
                  'Check-in cadence in days',
                )}
                placeholderTextColor={theme.placeholder}
                value={cadenceInput}
                onChangeText={setCadenceInput}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                placeholder={t(
                  'composer.circleMemberHintPlaceholder',
                  'Who’s in this circle? (optional)',
                )}
                placeholderTextColor={theme.placeholder}
                value={memberHint}
                onChangeText={setMemberHint}
              />
              <View style={styles.circleButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.circleActionButton,
                    { backgroundColor: theme.tint },
                  ]}
                  onPress={handleCreateCircle}
                  disabled={creatingCircle || !newCircleName.trim()}
                  hitSlop={hitSlop}
                >
                  <Text
                    style={[
                      styles.circleActionText,
                      { color: theme.background },
                    ]}
                  >
                    {creatingCircle
                      ? t('composer.circleCreating', 'Saving...')
                      : t('composer.circleCreateButton', 'Save circle')}
                  </Text>
                </TouchableOpacity>
                {selectedCircle ? (
                  <TouchableOpacity
                    style={[
                      styles.circleActionButton,
                      styles.circleActionButtonLast,
                      { backgroundColor: theme.input },
                    ]}
                    onPress={handleClearCircle}
                    hitSlop={hitSlop}
                  >
                    <Text
                      style={[styles.circleActionText, { color: theme.text }]}
                    >
                      {t('composer.circleClearButton', 'Remove')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.advancedSection}>
              <Text
                style={[styles.advancedSectionTitle, { color: theme.text }]}
              >
                {t('composer.supportOptionsHeading', 'Support options')}
              </Text>
              <Text
                style={[
                  styles.advancedDescription,
                  { color: theme.placeholder },
                ]}
              >
                {t(
                  'composer.supportOptionsDescription',
                  'Pair a direct funding goal with any external tip jars or wishlists you already use.',
                )}
              </Text>
              {composer.stripeEnabled ? (
                <View style={styles.advancedRow}>
                  <Text style={[styles.advancedLabel, { color: theme.text }]}>
                    {t(
                      'composer.showSupportLinkToggle',
                      'Show support link fields',
                    )}
                  </Text>
                  <Switch
                    value={composer.enableExternalGift}
                    onValueChange={composer.setEnableExternalGift}
                  />
                </View>
              ) : (
                <Text
                  style={[styles.supportNotice, { color: theme.placeholder }]}
                >
                  {t(
                    'composer.supportStripeNotice',
                    'Enable Stripe payouts in Settings to accept in-app support. External links still work.',
                  )}
                </Text>
              )}
              {!composer.stripeEnabled || composer.enableExternalGift ? (
                <View style={styles.inputStack}>
                  <TextInput
                    style={styles.input}
                    placeholder={t(
                      'composer.giftLinkPlaceholder',
                      'Support link (optional)',
                    )}
                    placeholderTextColor={theme.placeholder}
                    value={composer.giftLink}
                    onChangeText={composer.setGiftLink}
                    maxLength={composer.maxLinkLength}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[styles.helper, { color: theme.placeholder }]}>
                    {t(
                      'composer.supportLinkHint',
                      'Paste a payout app, PayPal, wishlist, or any URL supporters can use.',
                    )}
                  </Text>
                  {!!composer.giftLink &&
                  !/^https?:\/\//.test(composer.giftLink) ? (
                    <Text style={[styles.helper, { color: '#f87171' }]}>
                      {t(
                        'composer.invalidLink',
                        'Link should start with http:// or https://',
                      )}
                    </Text>
                  ) : null}
                  {!!composer.giftLink ? (
                    <Text
                      style={[
                        styles.counter,
                        composer.giftLink.length >= composer.maxLinkLength * 0.9
                          ? { color: '#f59e0b' }
                          : null,
                      ]}
                    >
                      {composer.giftLink.length} / {composer.maxLinkLength}
                    </Text>
                  ) : null}
                  <TextInput
                    style={styles.input}
                    placeholder={t(
                      'composer.giftTypePlaceholder',
                      'Link type (Ko-fi, PayPal, etc)',
                    )}
                    placeholderTextColor={theme.placeholder}
                    value={composer.giftType}
                    onChangeText={composer.setGiftType}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={t(
                      'composer.giftLabelPlaceholder',
                      'Button label, e.g. “Support on Ko-fi”',
                    )}
                    placeholderTextColor={theme.placeholder}
                    value={composer.giftLabel}
                    onChangeText={composer.setGiftLabel}
                  />
                </View>
              ) : null}
              {composer.stripeEnabled ? (
                <View style={[styles.inputStack, { marginTop: 12 }]}>
                  <Text
                    style={[styles.supportInAppLabel, { color: theme.text }]}
                  >
                    {t(
                      'composer.supportInAppLabel',
                      'Request in-app support (Stripe)',
                    )}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t(
                      'composer.supportAmountPlaceholder',
                      'Requested amount (USD)',
                    )}
                    placeholderTextColor={theme.placeholder}
                    keyboardType="numeric"
                    value={supportAmount}
                    onChangeText={setSupportAmount}
                  />
                  <TextInput
                    style={[styles.input, { minHeight: 80 }]}
                    placeholder={t(
                      'composer.supportReasonPlaceholder',
                      'Why do you need this support?',
                    )}
                    placeholderTextColor={theme.placeholder}
                    multiline
                    value={supportReason}
                    onChangeText={setSupportReason}
                  />
                  <Text style={[styles.helper, { color: theme.placeholder }]}>
                    {t(
                      'composer.supportRequestHint',
                      'Supporters will complete payment inside WhispList. Payments are processed securely by Stripe.',
                    )}
                  </Text>
                </View>
              ) : null}
              {composer.stripeEnabled ? (
                <View style={[styles.inputStack, { marginTop: 20 }]}>
                  <View style={styles.advancedRow}>
                    <Text style={[styles.advancedLabel, { color: theme.text }]}>
                      {t('composer.enableFunding', 'Enable funding goal')}
                    </Text>
                    <Switch
                      value={composer.fundingEnabled}
                      onValueChange={composer.setFundingEnabled}
                    />
                  </View>
                  {composer.fundingEnabled ? (
                    <>
                      <TextInput
                        style={styles.input}
                        placeholder={t(
                          'composer.fundingGoalPlaceholder',
                          'Goal amount (USD)',
                        )}
                        placeholderTextColor={theme.placeholder}
                        keyboardType="numeric"
                        value={composer.fundingGoal}
                        onChangeText={composer.setFundingGoal}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder={t(
                          'composer.fundingPresetsPlaceholder',
                          'Quick amounts e.g. 5,10,25',
                        )}
                        placeholderTextColor={theme.placeholder}
                        value={composer.fundingPresets}
                        onChangeText={composer.setFundingPresets}
                      />
                      <Text
                        style={[styles.helper, { color: theme.placeholder }]}
                      >
                        {t(
                          'composer.fundingPresetsHelper',
                          'Separate amounts with commas. Supporters will see matching buttons.',
                        )}
                      </Text>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
