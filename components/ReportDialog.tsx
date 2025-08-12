import React, { useState } from 'react';
import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { Colors } from '@/constants/Colors';
import { useTranslation } from '@/contexts/I18nContext';

interface ReportDialogProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

export default function ReportDialog({
  visible,
  onClose,
  onSubmit,
}: ReportDialogProps) {
  const [reason, setReason] = useState('');
  const { theme } = useTheme();
  const c = theme;
  const styles = React.useMemo(() => createStyles(c), [c]);
  const { t } = useTranslation();

  const handleSubmit = () => {
    onSubmit(reason.trim());
    setReason('');
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          <TextInput
            style={styles.input}
            placeholder={t('report.reasonPlaceholder')}
            placeholderTextColor={c.placeholder}
            value={reason}
            onChangeText={setReason}
          />
          <View style={styles.buttons}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.button, styles.cancel]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.buttonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              style={styles.button}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.buttonText}>{t('report.send')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: (typeof Colors)['light']) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    box: {
      width: '80%',
      backgroundColor: c.background,
      padding: 20,
      borderRadius: 12,
    },
    input: {
      backgroundColor: c.input,
      color: c.text,
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
      backgroundColor: c.tint,
      borderRadius: 8,
      marginLeft: 8,
    },
    cancel: {
      backgroundColor: c.input,
    },
    buttonText: {
      color: c.text,
    },
  });
