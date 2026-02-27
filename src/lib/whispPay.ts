import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

const DEFAULT_APP_SCHEME =
  process.env.EXPO_PUBLIC_WHISPPAY_APP_SCHEME?.trim() || 'whisppay';
const DEFAULT_WEB_BASE_URL =
  process.env.EXPO_PUBLIC_WHISPPAY_WEB_URL?.trim() ||
  'https://whisplist.app/support/pay';

export type WhispPayLinkOptions = {
  amount: number;
  note: string;
  recipient?: string;
  returnUrl?: string;
  appScheme?: string;
  webBaseUrl?: string;
};

export type WhispPayLinkBundle = {
  nativeUrl: string;
  webUrl: string;
};

export async function isWhispPayAvailable(
  appScheme: string = DEFAULT_APP_SCHEME,
): Promise<boolean> {
  try {
    return await Linking.canOpenURL(`${appScheme}://app`);
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

function sanitizeAppScheme(appScheme?: string): string {
  const raw = appScheme?.trim() || DEFAULT_APP_SCHEME;
  return raw.replace(/[^a-z0-9+.-]/gi, '').toLowerCase() || 'whisppay';
}

function sanitizeWebBaseUrl(webBaseUrl?: string): string {
  const raw = webBaseUrl?.trim() || DEFAULT_WEB_BASE_URL;
  return raw;
}

export function buildWhispPayLinks(
  options: WhispPayLinkOptions,
): WhispPayLinkBundle {
  const recipient = sanitizeRecipient(options.recipient);
  const appScheme = sanitizeAppScheme(options.appScheme);
  const webBaseUrl = sanitizeWebBaseUrl(options.webBaseUrl);

  const params = new URLSearchParams();
  params.set('txn', 'pay');
  params.set('amount', formatAmount(options.amount));
  params.set('note', options.note);
  if (recipient) {
    params.set('recipient', recipient);
  }
  if (options.returnUrl) {
    params.set('return_url', options.returnUrl);
  }

  return {
    nativeUrl: `${appScheme}://pay?${params.toString()}`,
    webUrl: `${webBaseUrl}?${params.toString()}`,
  };
}

export type WhispPayOpenResult = {
  opened: boolean;
  usedFallback: boolean;
};

export async function openWhispPay(
  links: WhispPayLinkBundle,
  appScheme?: string,
): Promise<WhispPayOpenResult> {
  try {
    const available = await isWhispPayAvailable(appScheme);
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
