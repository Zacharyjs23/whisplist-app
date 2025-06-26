export interface Wish {
  id: string;
  text: string;
  category: string;
  likes: number;
  userId?: string;
  displayName?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  boostedUntil?: any;
  pushToken?: string;
  audioUrl?: string;
  imageUrl?: string;
  giftLink?: string;
  isPoll?: boolean;
  optionA?: string;
  optionB?: string;
  votesA?: number;
  votesB?: number;
  [key: string]: any;
}
