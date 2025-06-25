export interface Wish {
  id: string;
  text: string;
  category: string;
  likes: number;
  pushToken?: string;
  audioUrl?: string;
}
