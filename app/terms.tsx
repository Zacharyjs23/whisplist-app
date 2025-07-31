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
        By using WhispList you agree to post only content you have the right to
        share. You may remain anonymous; however, abusive or illegal activity may
        result in removal. Boosts and gifts are handled through third‑party
        providers and are non‑refundable. We do not sell your personal data and
        you can delete your account at any time.
      </Text>
    </ScrollView>
  );
}
