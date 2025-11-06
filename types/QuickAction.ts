import type { ComponentProps } from 'react';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export type QuickAction = {
  key: string;
  label: string;
  description?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  href?: Href;
  onPress?: () => void;
};
