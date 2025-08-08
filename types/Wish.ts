import type { Timestamp } from 'firebase/firestore';

export type ReactionType = 'heart' | 'lightbulb' | 'hug' | 'pray';

export type Wish<Extra extends Record<string, unknown> = {}> = {
  id: string;
  text: string;
  category: string;
  /**
   * Type of post (e.g. "wish", "confession", "advice", "dream")
   */
  type?: string;
  likes: number;
  userId?: string;
  displayName?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  boostedUntil?: Timestamp | null;
  boosted?: string;
  audioUrl?: string;
  imageUrl?: string;
  giftLink?: string;
  /**
   * Type of external gift link (e.g. 'kofi', 'paypal')
   */
  giftType?: string;
  /**
   * Label shown on gift button
   */
  giftLabel?: string;
  /**
   * Link provided by a user after fulfilling the wish
   */
  fulfillmentLink?: string;
  isPoll?: boolean;
  optionA?: string;
  optionB?: string;
  votesA?: number;
  votesB?: number;
  /**
   * Optional mood emoji used for styling
   */
  mood?: string;
  /**
   * Emoji reaction counts
   */
  reactions?: Partial<Record<ReactionType, number>>;
  /**
   * Timestamp when this wish should disappear
   */
  expiresAt?: Timestamp | null;
  /**
   * Timestamp when this wish was created
   */
  timestamp?: Timestamp | null;
  /**
   * Whether this wish is marked as active
   */
  active?: boolean;
} & Extra;

