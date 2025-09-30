// Lightweight quote generator to expand the daily-quote option space well beyond 500.
// Uses i18n word banks so it localizes automatically.
export type TFunc = (key: string, opts?: { returnObjects?: boolean }) => any;

export function generateQuote(t: TFunc): string | null {
  try {
    const starts = (t('dailyQuote.generator.starts', { returnObjects: true }) || []) as string[];
    const actions = (t('dailyQuote.generator.actions', { returnObjects: true }) || []) as string[];
    const endings = (t('dailyQuote.generator.endings', { returnObjects: true }) || []) as string[];
    if (!starts.length || !actions.length || !endings.length) return null;
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    return `${pick(starts)} ${pick(actions)} ${pick(endings)}`.replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

