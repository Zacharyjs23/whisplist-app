import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { addWish } from '@/helpers/wishes';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useFeed } from '@/contexts/FeedContext';
import type { Wish } from '@/types/Wish';
import { useTheme } from '@/contexts/ThemeContext';

const PostComposer: React.FC = () => {
  const [text, setText] = useState('');
  const [type, setType] = useState<'wish' | 'confession' | 'advice' | 'dream'>('wish');
  const { user } = useAuthSession();
  const { addWishToList } = useFeed();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const handlePost = async () => {
    if (!text.trim()) return;
    const data: Omit<Wish, 'id' | 'likes' | 'reactions'> = {
      text,
      category: type,
      type,
      userId: user?.uid,
      isAnonymous: !user,
    };
    const doc = await addWish(data);
    const newWish: Wish = {
      id: doc.id,
      likes: 0,
      reactions: { heart: 0, lightbulb: 0, hug: 0, pray: 0 },
      ...data,
    } as Wish;
    addWishToList(newWish);
    setText('');
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>💭 What’s your wish today?</Text>
      <TextInput
        style={styles.input}
        placeholder="What's your wish?"
        placeholderTextColor={theme.placeholder}
        value={text}
        onChangeText={setText}
      />
      <Picker
        selectedValue={type}
        onValueChange={(val) => setType(val)}
        style={styles.input}
        dropdownIconColor="#fff"
      >
        <Picker.Item label="Wish 💭" value="wish" />
        <Picker.Item label="Confession 😶‍🌫️" value="confession" />
        <Picker.Item label="Advice Request 🧠" value="advice" />
        <Picker.Item label="Dream 🌙" value="dream" />
      </Picker>
      <TouchableOpacity onPress={handlePost} style={styles.button}>
        <Text style={styles.buttonText}>Post Wish</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (c: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 20,
    },
    label: {
      color: c.text,
      fontWeight: '600',
      marginBottom: 8,
      fontSize: 16,
    },
    input: {
      backgroundColor: c.input,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 8,
      marginBottom: 10,
      color: c.text,
    },
    button: {
      backgroundColor: c.tint,
      padding: 10,
      borderRadius: 8,
      alignItems: 'center',
    },
    buttonText: { color: '#fff', fontWeight: '600' },
  });

export default PostComposer;
