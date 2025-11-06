import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInstallations, getId } from 'firebase/installations';
import { app } from '@/firebase';
import * as logger from '@/shared/logger';

const STORAGE_KEY = 'installId.v1';
let cachedId: string | null = null;

function generateFallbackId(): string {
  return `anon-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export async function getInstallationId(): Promise<string> {
  if (cachedId) return cachedId;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && stored.length >= 8) {
      cachedId = stored;
      return stored;
    }
  } catch (error) {
    logger.warn('Failed to read cached installation id', error);
  }

  try {
    const installations = getInstallations(app);
    const id = await getId(installations);
    if (id) {
      cachedId = id;
      await AsyncStorage.setItem(STORAGE_KEY, id);
      return id;
    }
  } catch (error) {
    logger.warn('Failed to fetch Firebase installation id', error);
  }

  const fallback = generateFallbackId();
  cachedId = fallback;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, fallback);
  } catch (error) {
    logger.warn('Failed to store fallback installation id', error);
  }
  return fallback;
}
