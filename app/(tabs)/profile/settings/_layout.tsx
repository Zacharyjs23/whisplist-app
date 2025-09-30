import * as React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';

const HeaderTabs: React.FC<{ active: 'general' | 'membership' }> = ({ active }) => {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const goTo = React.useCallback(
    (path: '/(tabs)/profile/settings' | '/(tabs)/profile/settings/subscriptions') => {
      router.replace(path);
    },
    [router],
  );

  return (
    <View style={[styles.segmentContainer, { backgroundColor: theme.input }]}>
      <TouchableOpacity
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'general' }}
        onPress={() => goTo('/(tabs)/profile/settings')}
        style={[
          styles.segment,
          active === 'general' && {
            backgroundColor: theme.background,
            borderColor: theme.tint,
          },
        ]}
      >
        <Text
          style={[
            styles.segmentLabel,
            { color: active === 'general' ? theme.tint : theme.placeholder },
          ]}
        >
          {t('settings.generalTab', 'General')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'membership' }}
        onPress={() => goTo('/(tabs)/profile/settings/subscriptions')}
        style={[
          styles.segment,
          active === 'membership' && {
            backgroundColor: theme.background,
            borderColor: theme.tint,
          },
        ]}
      >
        <Text
          style={[
            styles.segmentLabel,
            { color: active === 'membership' ? theme.tint : theme.placeholder },
          ]}
        >
          {t('settings.membershipTab', 'Membership')}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default function SettingsLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerTitleAlign: 'center',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <HeaderTabs active="general" />,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="subscriptions"
        options={{
          headerTitle: () => <HeaderTabs active="membership" />,
          headerBackVisible: false,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  segmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 6,
    padding: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  segment: {
    flex: 1,
    minWidth: 110,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
});
