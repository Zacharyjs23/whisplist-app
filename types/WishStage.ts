export type WishStage = 'seed' | 'shared' | 'nurturing' | 'celebrating';

export const WISH_STAGE_ORDER: WishStage[] = [
  'seed',
  'shared',
  'nurturing',
  'celebrating',
];

export const WISH_STAGE_COPY: Record<
  WishStage,
  { title: string; description: string; nudge: string }
> = {
  seed: {
    title: 'Clarify',
    description:
      'You are planting the seed. Sharpen what you want and how support could help.',
    nudge: 'Try adding one tangible next step or support ask.',
  },
  shared: {
    title: 'Share',
    description:
      'Your wish is out there. Invite a trusted circle to witness it.',
    nudge: 'Mention one person who can cheer you on and tag them in a comment.',
  },
  nurturing: {
    title: 'Nurture',
    description:
      'Momentum is growing. Keep supporters updated with small wins.',
    nudge:
      'Post a quick progress note or gratitude update to keep energy high.',
  },
  celebrating: {
    title: 'Celebrate',
    description:
      'Time to acknowledge the journey and the people who backed you.',
    nudge: 'Share what shifted for you and thank the folks who showed up.',
  },
};

export const DEFAULT_WISH_STAGE: WishStage = 'seed';
