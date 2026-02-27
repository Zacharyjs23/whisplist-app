import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { AdvancedOptionsModal } from '@/components/composer/AdvancedOptionsModal';
import { createComposerStyles } from '@/components/composer/composerStyles';

const palette = {
  background: '#ffffff',
  input: '#f0f0f0',
  text: '#111111',
  tint: '#0a7ea4',
};

const theme = {
  ...palette,
  placeholder: '#777777',
};

const styles = createComposerStyles(palette);

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

const t = (key: string, fallback?: string | Record<string, unknown>) => {
  if (typeof fallback === 'string') return fallback;
  if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
    return (fallback as { defaultValue: string }).defaultValue;
  }
  return key;
};

const baseComposer: Parameters<typeof AdvancedOptionsModal>[0]['composer'] = {
  isPoll: false,
  setIsPoll: jest.fn(),
  optionA: '',
  setOptionA: jest.fn(),
  optionB: '',
  setOptionB: jest.fn(),
  includeAudio: false,
  setIncludeAudio: jest.fn(),
  isRecording: false,
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  resetRecorder: jest.fn(),
  postScope: 'all',
  setPostScope: jest.fn(),
  autoDelete: false,
  setAutoDelete: jest.fn(),
  circles: [],
  circlesLoading: false,
  selectedCircleId: null,
  onSelectCircle: jest.fn(),
  onCreateCircle: jest.fn().mockResolvedValue(null),
  stripeEnabled: true,
  enableExternalGift: false,
  setEnableExternalGift: jest.fn(),
  fundingEnabled: false,
  setFundingEnabled: jest.fn(),
  fundingGoal: '',
  setFundingGoal: jest.fn(),
  fundingPresets: '',
  setFundingPresets: jest.fn(),
  giftLink: '',
  setGiftLink: jest.fn(),
  giftType: '',
  setGiftType: jest.fn(),
  giftLabel: '',
  setGiftLabel: jest.fn(),
  maxLinkLength: 200,
};

describe('AdvancedOptionsModal', () => {
  it('resets cadence and member hint when circle selection is cleared', async () => {
    const circle = {
      id: 'circle-1',
      name: 'Morning Crew',
      cadenceDays: 7,
      createdAt: Date.now(),
      memberHint: 'Alex',
      nextReminderAt: Date.now() + 3600 * 1000,
    };

    const { getByPlaceholderText, rerender } = render(
      <AdvancedOptionsModal
        visible
        onClose={jest.fn()}
        t={t as any}
        theme={theme}
        styles={styles}
        hitSlop={HIT_SLOP}
        composer={{
          ...baseComposer,
          circles: [circle],
          selectedCircleId: 'circle-1',
        }}
        supportAmount=""
        setSupportAmount={jest.fn()}
        supportReason=""
        setSupportReason={jest.fn()}
      />,
    );

    const getCadenceField = () => getByPlaceholderText('Check-in cadence in days');
    const getMemberHintField = () =>
      getByPlaceholderText('Who’s in this circle? (optional)');

    await waitFor(() => {
      expect(getCadenceField().props.value).toBe('7');
      expect(getMemberHintField().props.value).toBe('Alex');
    });

    rerender(
      <AdvancedOptionsModal
        visible
        onClose={jest.fn()}
        t={t as any}
        theme={theme}
        styles={styles}
        hitSlop={HIT_SLOP}
        composer={{
          ...baseComposer,
          circles: [],
          selectedCircleId: null,
        }}
        supportAmount=""
        setSupportAmount={jest.fn()}
        supportReason=""
        setSupportReason={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(getCadenceField().props.value).toBe('3');
      expect(getMemberHintField().props.value).toBe('');
    });
  });
});
