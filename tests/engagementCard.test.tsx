import React from 'react';
import { render, screen } from '@testing-library/react-native';

const mockTheme = {
  name: 'light',
  text: '#111',
  background: '#fff',
  input: '#f0f0f0',
  placeholder: '#999',
  tint: '#0af',
};

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

jest.mock('@/firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({}));

const interpolate = (template: string, values: Record<string, unknown>) =>
  template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => String(values[key] ?? ''));

jest.mock('@/contexts/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrOptions?: any, options?: any) => {
      if (typeof defaultOrOptions === 'string') {
        return interpolate(defaultOrOptions, options ?? {});
      }
      if (key === 'home.engagement.badgeProgress') {
        return `${defaultOrOptions.unlocked}/${defaultOrOptions.total}`;
      }
      if (key.startsWith('home.engagement.next')) {
        return `Next at ${defaultOrOptions?.target ?? ''}`;
      }
      if (key.startsWith('home.engagement.units')) {
        return `${defaultOrOptions?.count ?? 0}`;
      }
      if (key === 'home.engagement.supporterShoutOut') {
        return interpolate('{{badge}} {{tier}}', defaultOrOptions ?? {});
      }
      if (key === 'home.communityPulse.supporterTier') {
        return interpolate('· {{tier}}', defaultOrOptions ?? {});
      }
      if (key === 'home.communityPulse.supporterMeta') {
        return interpolate('{{gifts}} gifts · ${{amount}}', defaultOrOptions ?? {});
      }
      return defaultOrOptions ?? key;
    },
  }),
}));

import EngagementCard from '@/components/home/EngagementCard';
import type { EngagementStats } from '@/types/Engagement';

describe('EngagementCard', () => {
  it('renders streak progress rows with translation defaults', () => {
    const stats: EngagementStats = {
      posting: {
        current: 5,
        longest: 9,
        lastDate: '2024-01-15',
        milestones: { posting_1: '2024-01-10', posting_3: '2024-01-12' },
      },
      gifting: {
        current: 2,
        longest: 4,
        lastDate: '2024-01-14',
        milestones: {},
      },
      fulfillment: {
        current: 1,
        longest: 1,
        lastDate: '2024-01-13',
        milestones: {},
      },
      updatedAt: undefined,
    };

    render(<EngagementCard stats={stats} loading={false} />);

    expect(screen.getByText('Keep your streak alive')).toBeTruthy();
    expect(screen.getByText('posting streak')).toBeTruthy();
    expect(screen.getByText('gifting streak')).toBeTruthy();
    expect(screen.getByText('fulfillment streak')).toBeTruthy();
    expect(screen.getAllByText('2/5')).toHaveLength(1);
  });
});
