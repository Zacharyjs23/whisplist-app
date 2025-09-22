import { useState } from 'react';
import type { PostType } from '@/types/post';
import { Alert, Platform, ToastAndroid } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as logger from '@/shared/logger';

export const useWishComposer = (stripeEnabled?: string | false) => {
  const [wish, setWish] = useState('');
  const [postType, setPostType] = useState<PostType>('wish');
  const [isPoll, setIsPoll] = useState(false);
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [giftLink, setGiftLink] = useState('');
  const [giftType, setGiftType] = useState('');
  const [giftLabel, setGiftLabel] = useState('');
  const [posting, setPosting] = useState(false);
  const [postConfirm, setPostConfirm] = useState(false);
  const [autoDelete, setAutoDelete] = useState(false);
  const [rephrasing, setRephrasing] = useState(false);
  const [useProfilePost, setUseProfilePost] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [enableExternalGift, setEnableExternalGift] = useState(!stripeEnabled);

  const pickImage = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission required', 'Media access is needed to select images');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const resetComposer = () => {
    setWish('');
    setPostType('wish');
    setIsPoll(false);
    setOptionA('');
    setOptionB('');
    setSelectedImage(null);
    setGiftLink('');
    setGiftType('');
    setGiftLabel('');
    setPosting(false);
    setAutoDelete(false);
    setUseProfilePost(false);
    setShowAdvanced(false);
    setEnableExternalGift(!stripeEnabled);
    setRephrasing(false);
  };

  const updateStreak = async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastDate = await AsyncStorage.getItem('lastPostedDate');
    let streak = parseInt((await AsyncStorage.getItem('streakCount')) || '0', 10);
    if (lastDate === today) return streak;
    if (lastDate) {
      const diff = (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    await AsyncStorage.setItem('lastPostedDate', today);
    await AsyncStorage.setItem('streakCount', streak.toString());
    return streak;
  };

  const handleRephrase = async () => {
    if (wish.trim() === '') return;
    const originalWishText = wish;
    setRephrasing(true);
    try {
      const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
      if (!projectId) {
        logger.warn('Cannot rephrase wish: Firebase project ID is missing');
        const msg = 'Cloud rephrase is unavailable. Configure your Firebase project ID.';
        if (Platform.OS === 'android') {
          ToastAndroid.show(msg, ToastAndroid.SHORT);
        } else {
          Alert.alert(msg);
        }
        return;
      }
      const url = `https://us-central1-${projectId}.cloudfunctions.net/rephraseWish`;
      let attempt = 0;
      let response: Response | null = null;
      while (attempt < 3) {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: originalWishText }),
        });
        if (response.status !== 429) break;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt++)));
      }
      if (!response || !response.ok) throw new Error('rephrase_failed');
      const data = await response.json();
      setWish(data.rephrased || originalWishText);
    } catch (err) {
      logger.error('Failed to rephrase wish', err);
      const msg = 'Failed to rephrase. Please try again later.';
      if (Platform.OS === 'android') {
        ToastAndroid.show(msg, ToastAndroid.SHORT);
      } else {
        Alert.alert(msg);
      }
    } finally {
      setRephrasing(false);
    }
  };

  return {
    wish,
    setWish,
    postType,
    setPostType,
    isPoll,
    setIsPoll,
    optionA,
    setOptionA,
    optionB,
    setOptionB,
    selectedImage,
    pickImage,
    giftLink,
    setGiftLink,
    giftType,
    setGiftType,
    giftLabel,
    setGiftLabel,
    posting,
    setPosting,
    postConfirm,
    setPostConfirm,
    autoDelete,
    setAutoDelete,
    rephrasing,
    handleRephrase,
    updateStreak,
    useProfilePost,
    setUseProfilePost,
    showAdvanced,
    setShowAdvanced,
    enableExternalGift,
    setEnableExternalGift,
    resetComposer,
  };
};

export default useWishComposer;
