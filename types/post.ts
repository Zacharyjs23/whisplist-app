// Central shared types for posts and feed filters

export type LegacyPostType = 'wish' | 'confession' | 'advice' | 'dream';

export type PostType = 'celebration' | 'goal' | 'struggle' | 'advice';

export type FilterType = 'all' | PostType;

export const POST_TYPE_ORDER: PostType[] = [
  'celebration',
  'goal',
  'struggle',
  'advice',
];

export type AnyPostType = LegacyPostType | PostType;

export interface PostTypeMeta {
  readonly key: PostType;
  readonly emoji: string;
  /** Default English fallback that can be overridden via i18n */
  readonly defaultLabel: string;
  /** Short fallback label for use on chips */
  readonly defaultChipLabel: string;
  /** Primary color tint used for cards and accents */
  readonly color: string;
  /** Legacy aliases that map to this type. */
  readonly legacy: LegacyPostType[];
}

export const POST_TYPE_META: Record<PostType, PostTypeMeta> = {
  celebration: {
    key: 'celebration',
    emoji: '🎉',
    defaultLabel: 'Celebration 🎉',
    defaultChipLabel: 'Celebrations',
    color: '#f97316',
    legacy: [],
  },
  goal: {
    key: 'goal',
    emoji: '🌱',
    defaultLabel: 'Goal 🌱',
    defaultChipLabel: 'Goals',
    color: '#2563eb',
    legacy: ['wish', 'dream'],
  },
  struggle: {
    key: 'struggle',
    emoji: '🌧️',
    defaultLabel: 'Struggle 🌧️',
    defaultChipLabel: 'Struggles',
    color: '#7f1d1d',
    legacy: ['confession'],
  },
  advice: {
    key: 'advice',
    emoji: '🧠',
    defaultLabel: 'Advice Request 🧠',
    defaultChipLabel: 'Advice',
    color: '#047857',
    legacy: ['advice'],
  },
};

export const LEGACY_TO_POST_TYPE: Record<LegacyPostType, PostType> = {
  wish: 'goal',
  dream: 'goal',
  confession: 'struggle',
  advice: 'advice',
};

export const FILTER_TYPES: FilterType[] = ['all', ...POST_TYPE_ORDER];

export const DEFAULT_POST_TYPE: PostType = 'goal';

export const isPostType = (value: unknown): value is PostType =>
  typeof value === 'string' && (POST_TYPE_META as Record<string, PostTypeMeta>)[value] !== undefined;

export const isLegacyPostType = (value: unknown): value is LegacyPostType =>
  typeof value === 'string' &&
  (value === 'wish' || value === 'dream' || value === 'confession' || value === 'advice');

export const normalizePostType = (value?: AnyPostType | string | null): PostType => {
  if (!value) return DEFAULT_POST_TYPE;
  if (isPostType(value)) return value;
  if (isLegacyPostType(value)) return LEGACY_TO_POST_TYPE[value];
  return DEFAULT_POST_TYPE;
};

export const getPostTypeColor = (value?: AnyPostType | string | null): string =>
  POST_TYPE_META[normalizePostType(value)].color;

export const getPostTypeEmoji = (value?: AnyPostType | string | null): string =>
  POST_TYPE_META[normalizePostType(value)].emoji;
