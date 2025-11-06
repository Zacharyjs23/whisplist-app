import type { AccountabilityCircle } from '@/hooks/useAccountabilityCircles';
import type { PostType } from '@/types/post';
import type { WishStage } from '@/types/WishStage';
import type { WishScope } from '@/types/WishScope';

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
  supportAmount: string;
  setSupportAmount: (v: string) => void;
  supportReason: string;
  setSupportReason: (v: string) => void;
  stage: WishStage;
  setStage: (stage: WishStage) => void;
  circles: AccountabilityCircle[];
  circlesLoading: boolean;
  selectedCircleId: string | null;
  onSelectCircle: (circleId: string | null) => void;
  onCreateCircle: (
    name: string,
    cadenceDays: number,
    memberHint?: string,
  ) => Promise<AccountabilityCircle | null>;
  postScope: WishScope;
  setPostScope: (scope: WishScope) => void;
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
