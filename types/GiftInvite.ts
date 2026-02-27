import type { Timestamp } from 'firebase/firestore';

export type GiftInviteStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled';

export interface GiftInvite {
  id: string;
  inviteeId: string;
  inviteeDisplayName: string;
  inviterId: string;
  inviterDisplayName?: string | null;
  message?: string | null;
  status: GiftInviteStatus;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}
