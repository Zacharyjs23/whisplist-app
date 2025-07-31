import { ScrollView, Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function PrivacyScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: theme.background }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>
        Privacy Policy
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        We respect your privacy and collect only the information needed to
        operate WhispList.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        • <Text style={{ fontWeight: 'bold' }}>Account Data</Text> – When you
        sign up we store your email address and any profile details you provide
        in Firebase. You may choose to remain anonymous.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        • <Text style={{ fontWeight: 'bold' }}>Wishes and Comments</Text> –
        Content you post is stored securely in Firebase until you delete it.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        • <Text style={{ fontWeight: 'bold' }}>Analytics</Text> – We use
        anonymous analytics to understand app usage. This data does not identify
        you personally.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        • <Text style={{ fontWeight: 'bold' }}>Payments</Text> – Gift
        transactions are processed by Stripe or external links. We never store
        your payment details.
      </Text>
      <Text style={{ color: theme.text }}>
        • <Text style={{ fontWeight: 'bold' }}>Your Choices</Text> – You can
        export or delete your data at any time from the settings screen. Contact
        support@example.com with any questions.
      </Text>
    </ScrollView>
  );
}
