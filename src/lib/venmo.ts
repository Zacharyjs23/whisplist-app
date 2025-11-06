import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

export type VenmoLinkOptions = {
  amount: number;
  note: string;
  recipient?: string;
  returnUrl?: string;
};

export type VenmoLinkBundle = {
  nativeUrl: string;
  webUrl: string;
};

export async function isVenmoAvailable(): Promise<boolean> {
  try {
    return await Linking.canOpenURL('venmo://app');
  } catch {
    return false;
  }
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function sanitizeRecipient(recipient?: string): string | undefined {
  if (!recipient) return undefined;
  return recipient.replace(/^@/, '').trim();
}

export function buildVenmoLinks(options: VenmoLinkOptions): VenmoLinkBundle {
  const recipient = sanitizeRecipient(options.recipient);

  const nativeParams = new URLSearchParams();
  nativeParams.set('txn', 'pay');
  nativeParams.set('amount', formatAmount(options.amount));
  nativeParams.set('note', options.note);
  if (recipient) {
    nativeParams.set('recipients', recipient);
  }
  if (options.returnUrl) {
    nativeParams.set('return_url', options.returnUrl);
  }

  const webParams = new URLSearchParams();
  webParams.set('txn', 'pay');
  webParams.set('amount', formatAmount(options.amount));
  webParams.set('note', options.note);
  if (recipient) {
    webParams.set('recipients', recipient);
  }
  if (options.returnUrl) {
    webParams.set('return_url', options.returnUrl);
  }

  return {
    nativeUrl: `venmo://paycharge?${nativeParams.toString()}`,
    webUrl: `https://account.venmo.com/pay?${webParams.toString()}`,
  };
}

export type VenmoOpenResult = {
  opened: boolean;
  usedFallback: boolean;
};

export async function openVenmo(
  links: VenmoLinkBundle,
): Promise<VenmoOpenResult> {
  try {
    const available = await isVenmoAvailable();
    if (available) {
      await Linking.openURL(links.nativeUrl);
      return { opened: true, usedFallback: false };
    }
  } catch (err) {
    if (Platform.OS === 'web') {
      throw err;
    }
  }

  try {
    if (Platform.OS === 'web') {
      window.location.href = links.webUrl;
    } else {
      await WebBrowser.openBrowserAsync(links.webUrl, {
        enableDefaultShareMenuItem: false,
        controlsColor: '#007AFF',
      });
    }
    return { opened: true, usedFallback: true };
  } catch {
    return { opened: false, usedFallback: true };
  }
}
