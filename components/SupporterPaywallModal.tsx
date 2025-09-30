import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  perks?: string[];
};

export const SupporterPaywallModal: React.FC<Props> = ({ visible, onClose, onSubscribe, perks }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.input }]}> 
          <Text style={[styles.title, { color: theme.text }]}>
            {t('premium.rephrase.title', 'Supporter feature')}
          </Text>
          <Text style={{ color: theme.placeholder, marginBottom: 10 }}>
            {t('premium.rephrase.body', 'Rephrase is available for supporters. Open subscriptions to join?')}
          </Text>
          {perks && perks.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              {perks.map((p, i) => (
                <Text key={i} style={{ color: theme.text }}>• {p}</Text>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.input }]} onPress={onClose}>
              <Text style={{ color: theme.text }}>{t('premium.rephrase.cancel', 'Not now')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.tint }]} onPress={onSubscribe}>
              <Text style={{ color: theme.text }}>{t('subscriptions.subscribe', 'Subscribe')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    borderRadius: 12,
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});

export default SupporterPaywallModal;

