import { useMemo } from 'react';

/**
 * Lightweight string hash (FNV-1a inspired) that works reliably on React Native.
 * Returns a non-negative 32-bit integer.
 */
export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

type UseExperimentOptions<T extends readonly string[]> = {
  /**
   * Subject drives bucketing (e.g., userId). When absent fallback is used.
   */
  subject?: string | null;
  /**
   * Variant to use when the subject is missing or hashing fails.
   */
  fallback?: T[number];
};

/**
 * Deterministically buckets a subject into one of the provided variants.
 * Keeps logic client-side so UI can react instantly while backend mirrors checks.
 */
export function useExperiment<T extends readonly string[]>(
  key: string,
  variants: T,
  options: UseExperimentOptions<T> = {},
): T[number] {
  if (!variants.length) {
    throw new Error(
      `useExperiment requires at least one variant for "${key}".`,
    );
  }
  const { subject, fallback } = options;
  return useMemo(() => {
    if (!subject) {
      return fallback ?? variants[0];
    }
    try {
      const bucketKey = `${key}:${subject}`;
      const hashed = stableHash(bucketKey);
      return variants[hashed % variants.length];
    } catch {
      return fallback ?? variants[0];
    }
  }, [fallback, key, subject, variants]);
}

export type ExperimentVariant<T extends readonly string[]> = T[number];
