import { https, logger, runWith } from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { assertGiftPotEnabled } from '../featureFlags';
import { sendPush } from '../notifications';

const db = admin.firestore();
const { HttpsError } = https;

type CreateInviteInput = {
  wishId?: unknown;
  username?: unknown;
  message?: unknown;
};

const MAX_MESSAGE_LENGTH = 140;

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'username must be provided');
  }
  const trimmed = value.trim().replace(/^@+/, '');
  if (!trimmed) {
    throw new HttpsError('invalid-argument', 'username must be provided');
  }
  if (trimmed.length > 100) {
    throw new HttpsError('invalid-argument', 'username is too long');
  }
  return trimmed;
}

function normalizeMessage(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'message must be a string');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError('invalid-argument', 'message is too long');
  }
  return trimmed;
}

export const createGiftTogetherInvite = runWith({
    timeoutSeconds: 15,
    memory: '128MB',
  })
  .region('us-central1')
  .https.onCall(async (data: CreateInviteInput, context) => {
    const inviterId = context.auth?.uid;
    if (!inviterId) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    assertGiftPotEnabled(inviterId);

    const wishId =
      typeof data?.wishId === 'string' && data.wishId.trim().length
        ? data.wishId.trim()
        : null;
    if (!wishId) {
      throw new HttpsError('invalid-argument', 'wishId must be provided');
    }

    const username = normalizeUsername(data?.username);
    const message = normalizeMessage(data?.message);

    const wishRef = db.collection('wishes').doc(wishId);
    const wishSnap = await wishRef.get();
    if (!wishSnap.exists) {
      throw new HttpsError('not-found', 'Wish not found');
    }
    const wish = wishSnap.data() as Record<string, unknown>;
    const ownerId = typeof wish.userId === 'string' ? wish.userId : null;
    if (!ownerId || ownerId !== inviterId) {
      throw new HttpsError(
        'permission-denied',
        'Only the wish owner can send invitations',
      );
    }
    if (wish.splitPayEnabled !== true) {
      throw new HttpsError(
        'failed-precondition',
        'Split-pay must be enabled to invite collaborators',
      );
    }

    const inviteeSnap = await db
      .collection('users')
      .where('displayName', '==', username)
      .limit(1)
      .get();
    if (inviteeSnap.empty) {
      throw new HttpsError('not-found', 'User not found');
    }
    const inviteeDoc = inviteeSnap.docs[0];
    const inviteeId = inviteeDoc.id;
    if (inviteeId === inviterId) {
      throw new HttpsError('failed-precondition', 'You cannot invite yourself');
    }

    const inviteeDisplayName = (() => {
      const value = inviteeDoc.get('displayName');
      return typeof value === 'string' && value.trim().length
        ? value.trim()
        : username;
    })();

    const pendingSnap = await wishRef
      .collection('giftInvites')
      .where('inviteeId', '==', inviteeId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    if (!pendingSnap.empty) {
      throw new HttpsError(
        'already-exists',
        'Invite already pending for this user',
      );
    }

    const inviterProfileSnap = await db
      .collection('users')
      .doc(inviterId)
      .get();
    const inviterDisplayName = (() => {
      const value = inviterProfileSnap.get('displayName');
      return typeof value === 'string' && value.trim().length
        ? value.trim()
        : null;
    })();
    const wishTitle = (() => {
      const titleValue = wish.title;
      const textValue = wish.text;
      if (typeof titleValue === 'string' && titleValue.trim().length) {
        return titleValue.trim();
      }
      if (typeof textValue === 'string' && textValue.trim().length) {
        return textValue.trim().slice(0, 80);
      }
      return null;
    })();

    const inviteRef = wishRef.collection('giftInvites').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await inviteRef.set({
      inviteeId,
      inviteeDisplayName,
      inviterId,
      inviterDisplayName,
      message: message ?? null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    const title = inviterDisplayName
      ? `${inviterDisplayName} invited you`
      : 'Gift Together invite';
    const body = wishTitle
      ? `Join the "${wishTitle}" wish and chip in together.`
      : 'Join this wish and chip in together.';
    try {
      await sendPush(
        inviteeId,
        title,
        body,
        'splitpay_invite',
        `/wish/${wishId}?splitpay=1`,
      );
    } catch (error) {
      logger.warn('Failed to send gift invite push', {
        wishId,
        inviteeId,
        inviterId,
        error,
      });
    }

    return {
      inviteId: inviteRef.id,
      inviteeId,
      inviteeDisplayName,
    };
  });
