export interface Wish {
  id: string;
  text: string;
  category: string;
  likes: number;
  pushToken?: string;
  audioUrl?: string;
  isPoll?: boolean;
  optionA?: string;
  optionB?: string;
  votesA?: number;
  votesB?: number;
  [key: string]: any;
}
