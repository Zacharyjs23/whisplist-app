import React from 'react';
import { View, TouchableOpacity, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  wishId: string;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
}

const BoostButton: React.FC<Props> = ({ wishId, hitSlop }) => {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
      <TouchableOpacity onPress={() => router.push(`/boost/${wishId}`)} hitSlop={hitSlop}>
        <Text style={{ color: '#facc15' }}>Boost 🚀</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() =>
          Alert.alert('Boost Info', 'Boosting highlights a wish for 24 hours.')
        }
        style={{ marginLeft: 6 }}
        hitSlop={hitSlop}
      >
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={theme.text}
        />
      </TouchableOpacity>
    </View>
  );
};

export default BoostButton;
