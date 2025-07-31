import { ScrollView, Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function TermsScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: theme.background }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>
        Terms of Service
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        1. <Text style={{ fontWeight: 'bold' }}>Acceptance of Terms</Text> – By
        creating an account or using WhispList you agree to these Terms of
        Service and our Privacy Policy.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        2. <Text style={{ fontWeight: 'bold' }}>Use of the Service</Text> – You
        may post wishes and comments for personal, non‑commercial use. Do not
        post illegal, abusive or infringing content.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        3. <Text style={{ fontWeight: 'bold' }}>Accounts</Text> – You are
        responsible for keeping your credentials confidential. You may delete
        your account at any time.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        4. <Text style={{ fontWeight: 'bold' }}>Content Ownership</Text> – You
        retain ownership of content you post. You grant WhispList a license to
        display your content within the app and related services.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        5. <Text style={{ fontWeight: 'bold' }}>Termination</Text> – We may
        suspend or terminate accounts that violate these terms or applicable
        law.
      </Text>
      <Text style={{ color: theme.text, marginBottom: 10 }}>
        6. <Text style={{ fontWeight: 'bold' }}>Disclaimer</Text> – The service
        is provided "as is" without warranties of any kind. We are not liable
        for any damages arising from your use of WhispList.
      </Text>
      <Text style={{ color: theme.text }}>
        7. <Text style={{ fontWeight: 'bold' }}>Changes to Terms</Text> – We may
        update these Terms from time to time. Continued use of the service after
        changes constitutes acceptance of the new Terms.
      </Text>
    </ScrollView>
  );
}
