import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_ENV: z
    .enum(['development', 'preview', 'staging', 'production'])
    .default('development'),
  EXPO_PUBLIC_FIREBASE_API_KEY: z
    .string()
    .min(1, 'EXPO_PUBLIC_FIREBASE_API_KEY is required'),
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: z
    .string()
    .min(1, 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN is required'),
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: z
    .string()
    .min(1, 'EXPO_PUBLIC_FIREBASE_PROJECT_ID is required'),
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: z
    .string()
    .min(1, 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET is required'),
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z
    .string()
    .min(1, 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID is required'),
  EXPO_PUBLIC_FIREBASE_APP_ID: z
    .string()
    .min(1, 'EXPO_PUBLIC_FIREBASE_APP_ID is required'),
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: z
    .string()
    .min(1, 'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID is required'),
  EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
});

const rawEnv = {
  EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV,
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID:
    process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION:
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION,
};

const parseEnv = (input: typeof rawEnv) => {
  const parsed = envSchema.safeParse(input);

  if (!parsed.success) {
    const formattedErrors = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${formattedErrors}`);
  }

  return parsed.data;
};

const parsed = parseEnv(rawEnv);

export const env = Object.freeze(parsed);
export type Env = typeof env;

export const __test = {
  parseEnv,
};
