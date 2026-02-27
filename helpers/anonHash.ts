import { stableHash } from '@/src/experiments/useExperiment';
import { getInstallationId } from '@/services/installations';

let cachedHash: { salt: string; hash: string } | null = null;

const formatHash = (input: number) => input.toString(16).padStart(8, '0');

export async function getAnonDeviceHash(salt: string): Promise<string> {
  if (!salt) throw new Error('Missing anon hash salt');
  if (cachedHash && cachedHash.salt === salt) {
    return cachedHash.hash;
  }
  const installationId = await getInstallationId();
  const base = `${salt}:${installationId}`;
  const h1 = stableHash(base);
  const h2 = stableHash(`${base}:second`);
  const h3 = stableHash(`${base}:third`);
  const combined = `${formatHash(h1)}${formatHash(h2)}${formatHash(h3)}`;
  cachedHash = { salt, hash: combined };
  return combined;
}
