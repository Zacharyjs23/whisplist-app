import React, { useEffect, useState } from 'react';
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
import { normalizeAndValidateUrl } from '@/helpers/url';
import { trackEvent } from '@/helpers/analytics';

interface FulfillmentLinkDialogProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (link: string) => void;
  existingLink?: string;
}

export default function FulfillmentLinkDialog({
  visible,
  onClose,
  onSubmit,
  existingLink,
}: FulfillmentLinkDialogProps) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (visible) {
      setLink(existingLink || '');
    }
  }, [visible, existingLink]);

  const handleSubmit = () => {
    const cleaned = normalizeAndValidateUrl(link);
    if (!cleaned) {
      setError('Please enter a valid HTTPS link');
      return;
    }
    setError('');
    trackEvent('set_fulfillment_link');
    onSubmit(cleaned);
    setLink('');
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
            placeholder="Paste fulfillment link"
            placeholderTextColor={theme.text + '99'} // theme fix
            value={link}
            onChangeText={setLink}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.button, styles.cancel]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              style={styles.button}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.buttonText}>Save</Text>
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
    error: {
      color: '#f87171',
      marginBottom: 8,
    },
  });
