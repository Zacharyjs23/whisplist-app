export interface Wish {
  id: string;
  text: string;
  category: string;
  likes: number;
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
