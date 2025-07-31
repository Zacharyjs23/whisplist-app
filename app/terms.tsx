import { ScrollView, Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function TermsScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: theme.background }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>
        Terms of Service
      </Text>
      <Text style={{ color: theme.text }}>
        This is placeholder terms of service text for WhispList.
      </Text>
    </ScrollView>
  );
}
