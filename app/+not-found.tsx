import { Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function Page() {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
      <Text style={{ color: theme.text }}>404 - Not Found</Text>
    </View>
  );
}
