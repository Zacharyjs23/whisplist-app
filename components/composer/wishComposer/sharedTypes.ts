import type { Insets } from 'react-native';
import type { createComposerStyles } from '@/components/composer/composerStyles';
import type { Theme } from '@/contexts/ThemeContext';
import type { TFunction } from 'i18next';

export type ComposerStyles = ReturnType<typeof createComposerStyles>;

export type ComposerSharedProps = {
  styles: ComposerStyles;
  theme: Theme;
  t: TFunction;
  typeColor: string;
  hitSlop: Insets;
};

export type StageOption = {
  value: string;
  title: string;
  description: string;
};

export type StageMeta = {
  title: string;
  description: string;
  nudge: string;
};

export type UploadState = {
  uploadProgress?: number | null;
  uploadStage?: 'audio' | 'image' | null;
};

export type SupportSummaryState = {
  hasSupportPreview: boolean;
  formattedSupportAmount: string;
  supportReason: string;
};

export type ComposerActionsState = UploadState & {
  posting: boolean;
  errorText?: string | null;
  onRetry?: () => void;
  onSaveDraft?: () => void;
  onSubmit: () => void;
  isDraftLoaded?: boolean;
  hasPendingQueue?: boolean;
  isAuthenticated: boolean;
  supportLabel: string | null;
};
