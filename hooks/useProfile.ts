import { useAuth } from '@/contexts/AuthContext';
import { db, storage } from '../firebase';
import {
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { updateProfile as fbUpdateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import type { Profile } from '../types/Profile';

export const useProfile = () => {
  const { user, setAuthError, setProfile } = useAuth();

  const updateProfile = async (data: Partial<Profile>) => {
    try {
      if (!user) return;
      const refDoc = doc(db, 'users', user.uid);
      await updateDoc(refDoc, data);
      if (data.displayName || data.photoURL) {
        await fbUpdateProfile(user, {
          displayName: data.displayName ?? user.displayName ?? undefined,
          photoURL: data.photoURL ?? user.photoURL ?? undefined,
        });
      }
      const snap = await getDoc(refDoc);
      const newData = snap.data() as Profile;
      if (newData.publicProfileEnabled === undefined)
        newData.publicProfileEnabled = true;
      if (newData.developerMode === undefined) newData.developerMode = false;
      setProfile(newData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const pickImage = async () => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        if (!user) return;
        const storageRef = ref(storage, `profiles/${user.uid}`);
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        await updateProfile({ photoURL: url });
        return url;
      }
      return undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      return undefined;
    }
  };

  return { updateProfile, pickImage };
};

