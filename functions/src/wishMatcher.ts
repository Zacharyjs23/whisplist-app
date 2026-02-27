// @ts-nocheck
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { OPENAI_API_KEY } from './secrets';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

const MATCH_LIMIT = 5;
const CANDIDATE_LIMIT = 40;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const PROCESSING_GRACE_MS = 2 * 60 * 1000;

type RawWish = admin.firestore.DocumentData;

type NormalizedWish = {
  id: string;
  text: string;
  textPreview: string;
  tags: string[];
  mood?: string | null;
  category?: string | null;
  displayName?: string | null;
  voiceTranscription?: string | null;
  aiRefinedText?: string | null;
};

type CandidateWish = NormalizedWish & {
  reason?: string | null;
};

type OpenAiMatch = {
  id: string;
  score?: number;
  reason?: string;
  summary?: string;
};

const truncate = (input: string, max = 280): string => {
  if (!input) return '';
  const clean = input.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
};

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length ? value.trim() : null;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) =>
          typeof entry === 'string' && entry.trim().length
            ? entry.trim()
            : null,
        )
        .filter((entry): entry is string => Boolean(entry))
    : [];

const normalizeWish = (docId: string, data: RawWish): NormalizedWish => {
  const textCandidates = [
    toStringOrNull(data.aiRefinedText),
    toStringOrNull(data.text),
  ].filter((entry): entry is string => Boolean(entry));
  const primaryText = textCandidates[0] ?? '';
  const transcription = toStringOrNull(data.voiceTranscription);
  return {
    id: docId,
    text: primaryText,
    textPreview: truncate(primaryText || transcription || ''),
    tags: toStringArray(data.tags),
    mood: toStringOrNull(data.detectedMood ?? data.mood),
    category: toStringOrNull(data.category),
    displayName: toStringOrNull(data.displayName),
    voiceTranscription: transcription,
    aiRefinedText: toStringOrNull(data.aiRefinedText),
  };
};

const serializeWishForPrompt = (wish: NormalizedWish): string => {
  const parts: string[] = [
    `id: ${wish.id}`,
    `text: ${truncate(wish.text || '', 320)}`,
  ];
  if (wish.voiceTranscription) {
    parts.push(`transcription: ${truncate(wish.voiceTranscription, 320)}`);
  }
  if (wish.tags.length) {
    parts.push(`tags: ${wish.tags.join(', ')}`);
  }
  if (wish.mood) {
    parts.push(`mood: ${wish.mood}`);
  }
  if (wish.category) {
    parts.push(`category: ${wish.category}`);
  }
  return parts.join('\n');
};

const fetchCandidateWishes = async (
  target: NormalizedWish,
): Promise<CandidateWish[]> => {
  const snapshot = await db
    .collection('wishes')
    .orderBy('timestamp', 'desc')
    .limit(CANDIDATE_LIMIT + 10)
    .get();
  const candidates: CandidateWish[] = [];
  snapshot.forEach((doc) => {
    if (doc.id === target.id) return;
    const data = doc.data() as RawWish;
    if (
      data.visibility === 'private' ||
      data.shareScope === 'private' ||
      data.isPrivate === true
    ) {
      return;
    }
    const normalized = normalizeWish(doc.id, data);
    if (!normalized.text && !normalized.voiceTranscription) {
      return;
    }
    candidates.push(normalized);
  });
  return candidates.slice(0, CANDIDATE_LIMIT);
};

const buildPrompt = (
  target: NormalizedWish,
  candidates: CandidateWish[],
): string => {
  const header = [
    `Target wish:`,
    serializeWishForPrompt(target),
    '',
    `Candidate wishes:`,
    candidates.map(serializeWishForPrompt).join('\n\n'),
    '',
    `Return a JSON object with the key "matches" containing at most ${MATCH_LIMIT} entries.`,
    `Each entry must include:`,
    `  - "id": candidate id`,
    `  - "score": similarity score between 0 and 1 (higher = more similar)`,
    `  - "reason": <=120 characters describing why it matches`,
    `  - "summary": optional <=120 character summary of the candidate`,
    `Focus on semantic intent, emotional tone, and tag alignment.`,
    `Exclude the target wish itself. Prefer diversity in results when relevance ties.`,
  ];
  return header.join('\n');
};

const parseMatches = (raw: unknown, allowedIds: Set<string>): OpenAiMatch[] => {
  if (!raw || typeof raw !== 'object') return [];
  const payload = raw as { matches?: unknown };
  if (!Array.isArray(payload.matches)) return [];
  return payload.matches
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const id = typeof item.id === 'string' ? item.id : null;
      if (!id || !allowedIds.has(id)) {
        return null;
      }
      const score =
        typeof item.score === 'number' && Number.isFinite(item.score)
          ? item.score
          : undefined;
      const reason =
        typeof item.reason === 'string' && item.reason.trim().length
          ? truncate(item.reason.trim(), 140)
          : undefined;
      const summary =
        typeof item.summary === 'string' && item.summary.trim().length
          ? truncate(item.summary.trim(), 140)
          : undefined;
      return { id, score, reason, summary };
    })
    .filter((entry): entry is OpenAiMatch => Boolean(entry));
};

const updateMeta = async (
  wishId: string,
  data: Partial<{
    status: string;
    error: string | null;
    matchCount: number;
    ttlMs: number;
  }>,
) => {
  await db
    .collection('wishes')
    .doc(wishId)
    .collection('relatedMeta')
    .doc('state')
    .set(
      {
        updatedAt: admin.firestore.Timestamp.now(),
        requestedAt: admin.firestore.Timestamp.now(),
        ...data,
      },
      { merge: true },
    );
};

export const generateWishMatches = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: '1GiB',
  },
  async (request) => {
    const { wishId, force = false } = (request.data ?? {}) as {
      wishId?: unknown;
      force?: unknown;
    };

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    if (typeof wishId !== 'string' || !wishId.trim()) {
      throw new HttpsError('invalid-argument', 'wishId is required');
    }

    if (!OPENAI_API_KEY.value()) {
      throw new HttpsError('failed-precondition', 'OpenAI API key missing');
    }

    const wishRef = db.collection('wishes').doc(wishId);
    const wishSnap = await wishRef.get();
    if (!wishSnap.exists) {
      throw new HttpsError('not-found', 'Wish not found');
    }

    const wishData = wishSnap.data() as RawWish;
    if (
      wishData.visibility === 'private' ||
      wishData.shareScope === 'private' ||
      wishData.isPrivate === true
    ) {
      await updateMeta(wishId, {
        status: 'empty',
        error: null,
        matchCount: 0,
        ttlMs: DEFAULT_TTL_MS,
      });
      return { status: 'skipped_private', matchCount: 0 };
    }

    const metaRef = wishRef.collection('relatedMeta').doc('state');
    const metaSnap = await metaRef.get();
    if (metaSnap.exists && !force) {
      const meta = metaSnap.data() ?? {};
      const status = typeof meta.status === 'string' ? meta.status : 'idle';
      const ttlMs =
        typeof meta.ttlMs === 'number' && Number.isFinite(meta.ttlMs)
          ? (meta.ttlMs as number)
          : DEFAULT_TTL_MS;
      const updated =
        meta.updatedAt instanceof admin.firestore.Timestamp
          ? meta.updatedAt.toDate()
          : null;
      const requested =
        meta.requestedAt instanceof admin.firestore.Timestamp
          ? meta.requestedAt.toDate()
          : null;
      const nowMs = Date.now();
      if (status === 'ready' && updated && nowMs - updated.getTime() < ttlMs) {
        return {
          status: 'cached',
          matchCount:
            typeof meta.matchCount === 'number' ? meta.matchCount : undefined,
        };
      }
      if (
        status === 'processing' &&
        requested &&
        nowMs - requested.getTime() < PROCESSING_GRACE_MS
      ) {
        return { status: 'processing' };
      }
    }

    await metaRef.set(
      {
        status: 'processing',
        requestedAt: admin.firestore.Timestamp.now(),
        error: FieldValue.delete(),
      },
      { merge: true },
    );

    const target = normalizeWish(wishSnap.id, wishData);
    if (!target.text && !target.voiceTranscription) {
      await updateMeta(wishId, {
        status: 'empty',
        error: 'no_content',
        matchCount: 0,
        ttlMs: DEFAULT_TTL_MS,
      });
      return { status: 'empty', matchCount: 0 };
    }

    const candidates = await fetchCandidateWishes(target);
    if (!candidates.length) {
      await updateMeta(wishId, {
        status: 'empty',
        error: null,
        matchCount: 0,
        ttlMs: DEFAULT_TTL_MS,
      });
      return { status: 'empty', matchCount: 0 };
    }

    const candidateMap = new Map(
      candidates.map((entry) => [entry.id, entry] as const),
    );
    const prompt = buildPrompt(target, candidates);

    const payload = {
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' as const },
      messages: [
        {
          role: 'system',
          content:
            'You help group similar wishes by intent, emotion, and practical themes.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    let attempt = 0;
    let lastError: unknown = null;
    let response: Response | null = null;
    while (attempt < 3) {
      try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (response.status === 429) {
          attempt += 1;
          await new Promise((resolve) =>
            setTimeout(resolve, 300 * Math.pow(2, attempt)),
          );
          continue;
        }
        break;
      } catch (err) {
        lastError = err;
        attempt += 1;
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * Math.pow(2, attempt)),
        );
      }
    }

    if (!response) {
      await updateMeta(wishId, {
        status: 'failed',
        error: lastError instanceof Error ? lastError.message : 'openai_error',
        ttlMs: DEFAULT_TTL_MS,
      });
      throw new HttpsError('internal', 'OpenAI request failed');
    }

    let body: any;
    try {
      body = await response.json();
    } catch {
      await updateMeta(wishId, {
        status: 'failed',
        error: 'invalid_response',
        ttlMs: DEFAULT_TTL_MS,
      });
      throw new HttpsError('internal', 'Invalid response from OpenAI');
    }

    if (!response.ok) {
      const message =
        body?.error?.message ||
        body?.error ||
        (typeof body === 'string' ? body : 'openai_failed');
      await updateMeta(wishId, {
        status: 'failed',
        error: message,
        ttlMs: DEFAULT_TTL_MS,
      });
      throw new HttpsError('internal', message);
    }

    const rawContent = body?.choices?.[0]?.message?.content;
    let parsedMatches: OpenAiMatch[] = [];
    if (rawContent && typeof rawContent === 'string') {
      try {
        const parsed = JSON.parse(rawContent);
        parsedMatches = parseMatches(parsed, candidateMap);
      } catch {
        parsedMatches = [];
      }
    }
    if (!parsedMatches.length && body?.choices?.[0]?.message?.parsed) {
      parsedMatches = parseMatches(
        body.choices[0].message.parsed,
        candidateMap,
      );
    }

    const uniqueMatches: OpenAiMatch[] = [];
    const seen = new Set<string>();
    for (const match of parsedMatches) {
      if (seen.has(match.id)) continue;
      if (!candidateMap.has(match.id)) continue;
      seen.add(match.id);
      uniqueMatches.push(match);
      if (uniqueMatches.length >= MATCH_LIMIT) break;
    }

    const batch = db.batch();
    const relatedRef = wishRef.collection('related');
    const existing = await relatedRef.get();
    existing.forEach((doc) => {
      batch.delete(doc.ref);
    });

    uniqueMatches.forEach((match) => {
      const candidate = candidateMap.get(match.id)!;
      batch.set(relatedRef.doc(match.id), {
        score:
          typeof match.score === 'number' && Number.isFinite(match.score)
            ? match.score
            : 0,
        reason: match.reason ?? null,
        summary: match.summary ?? null,
        textPreview: candidate.textPreview,
        category: candidate.category ?? null,
        displayName: candidate.displayName ?? null,
        matchedAt: admin.firestore.Timestamp.now(),
        mood: candidate.mood ?? null,
        tags: candidate.tags,
      });
    });

    await batch.commit();

    await updateMeta(wishId, {
      status: uniqueMatches.length ? 'ready' : 'empty',
      error: null,
      matchCount: uniqueMatches.length,
      ttlMs: DEFAULT_TTL_MS,
    });

    return {
      status: uniqueMatches.length ? 'ready' : 'empty',
      matchCount: uniqueMatches.length,
    };
  },
);
