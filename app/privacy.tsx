import { ScrollView, Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function PrivacyScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: theme.background }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>
        Privacy Policy
      </Text>
      <Text style={{ color: theme.text }}>
        We store your wishes and optional profile information securely in
        Firebase. Guest posts stay on your device unless you sign up. Google
        login shares your public profile and email with us for account recovery.
        Gift transactions are processed by Stripe or external links and we never
        see your payment details.
      </Text>
    </ScrollView>
  );
}
