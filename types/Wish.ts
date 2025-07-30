export interface Wish {
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
  boostedUntil?: any;
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
  [key: string]: any;
}
