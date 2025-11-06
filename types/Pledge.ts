import type { Timestamp } from 'firebase/firestore';

export type PledgeStatus =
  | 'authorized'
  | 'captured'
  | 'canceled'
  | 'refunded'
  | 'failed'
  | 'capturing'
  | 'canceling';

export type Pledge = {
  id: string;
  wishId: string;
  uid?: string | null;
  amount: number;
  currency?: string;
  status: PledgeStatus;
  paymentIntentId: string;
  experimentBucket?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  capturedAmount?: number;
  capturedAt?: Timestamp | null;
  canceledAt?: Timestamp | null;
  lastError?: string | null;
};
