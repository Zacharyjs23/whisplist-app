import { Platform } from 'react-native';

const formatTimeLeft = (date: Date) => {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return '0h';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
};

const emojiOptions = ['❤️', '😂', '😢', '👍'];
const COMMENT_ITEM_HEIGHT = 80;
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const MIN_PLEDGE_CENTS = 500;
const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';

const withAlpha = (input: string, alpha: number): string => {
  if (!input) return `rgba(255,255,255,${alpha})`;
  if (input.startsWith('#')) {
    const hex = input.replace('#', '');
    const bigint = Number.parseInt(hex.length === 3 ? hex.repeat(2) : hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (input.startsWith('rgb')) {
    return input.replace(/rgba?\(([^)]+)\)/, (_match, values) => {
      const parts = values.split(',').map((v: string) => v.trim());
      const [r, g, b] = parts;
      return `rgba(${r},${g},${b},${alpha})`;
    });
  }
  return input;
};

export {
  formatTimeLeft,
  emojiOptions,
  COMMENT_ITEM_HEIGHT,
  HIT_SLOP,
  MIN_PLEDGE_CENTS,
  CAN_USE_NATIVE_DRIVER,
  withAlpha,
};

