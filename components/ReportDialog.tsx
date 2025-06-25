import React, { useState } from 'react';
import { Modal, View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface ReportDialogProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

export default function ReportDialog({ visible, onClose, onSubmit }: ReportDialogProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    onSubmit(reason.trim());
    setReason('');
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <TextInput
            style={styles.input}
            placeholder="Reason for report"
            placeholderTextColor="#888"
            value={reason}
            onChangeText={setReason}
          />
          <View style={styles.buttons}>
            <TouchableOpacity onPress={onClose} style={[styles.button, styles.cancel]}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} style={styles.button}>
              <Text style={styles.buttonText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: '80%',
    backgroundColor: '#1e1e1e',
    padding: 20,
    borderRadius: 12,
  },
  input: {
    backgroundColor: '#000',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
    marginLeft: 8,
  },
  cancel: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
  },
});
