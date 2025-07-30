import React, { useState } from 'react';
import { Modal, View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { Colors } from '@/constants/Colors';

interface ReferralNameDialogProps {
  visible: boolean;
  defaultName?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export default function ReferralNameDialog({ visible, defaultName = '', onClose, onSubmit }: ReferralNameDialogProps) {
  const [name, setName] = useState(defaultName);
  const { theme } = useTheme();
  const c = theme;
  const styles = React.useMemo(() => createStyles(c), [c]);

  const handleSubmit = () => {
    onSubmit(name.trim());
    setName('');
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <TextInput
            style={styles.input}
            placeholder="Name or handle"
            placeholderTextColor="#888"
            value={name}
            onChangeText={setName}
          />
          <View style={styles.buttons}>
            <TouchableOpacity onPress={onClose} style={[styles.button, styles.cancel]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} style={styles.button} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.buttonText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: (typeof Colors)['light']) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    box: { width: '80%', backgroundColor: c.background, padding: 20, borderRadius: 12 },
    input: { backgroundColor: c.input, color: c.text, padding: 10, borderRadius: 8, marginBottom: 12 },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end' },
    button: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: c.tint, borderRadius: 8, marginLeft: 8 },
    cancel: { backgroundColor: c.input },
    buttonText: { color: c.text },
  });
