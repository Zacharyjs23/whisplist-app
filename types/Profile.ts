import { Timestamp } from 'firebase/firestore';
import type { WishScope } from './WishScope';

export interface Profile {
  displayName: string | null;
  email: string | null;
  bio?: string;
  photoURL?: string | null;
  isAnonymous: boolean;
  publicProfileEnabled?: boolean;
  boostCredits?: number;
  createdAt?: Timestamp;
  giftingEnabled?: boolean;
  stripeAccountId?: string;
  giftsReceived?: number;
  referralDisplayName?: string;
  developerMode?: boolean;
  acceptedTermsAt?: Timestamp;
  anonModeEnabled?: boolean;
  defaultWishScope?: WishScope;
}
