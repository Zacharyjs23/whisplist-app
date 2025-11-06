import type { Timestamp } from 'firebase/firestore';

export type MicroListItem = {
  wishId: string;
  note?: string;
  affiliateUrl?: string;
  order: number;
};

export type MicroList = {
  title: string;
  coverUrl?: string;
  updatedAt: Timestamp;
  items: MicroListItem[];
};
