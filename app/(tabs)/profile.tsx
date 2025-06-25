// app/(tabs)/profile.tsx — Enhanced Profile Screen with Analytics
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  getWishesByNickname,
  getAllWishes,
  getWishComments,
} from '../../helpers/firestore';
import type { Wish } from '../../types/Wish';
import type { Comment } from '../../helpers/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  FlatList,
  StatusBar as RNStatusBar,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PieChart } from 'react-native-chart-kit';

export default function ProfileScreen() {
  const [nickname, setNickname] = useState('');
  const [inputName, setInputName] = useState('');
  const [myWishes, setMyWishes] = useState<Wish[]>([]);
  const [myComments, setMyComments] = useState<Comment[]>([]);
  const [streak, setStreak] = useState(0);
  const [stats, setStats] = useState({ totalLikes: 0, topWish: '', firstWish: '' });
  const [badges, setBadges] = useState<string[]>([]);
  const [categoryData, setCategoryData] = useState<{ category: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const stored = await AsyncStorage.getItem('nickname');
        if (!stored) {
          setLoading(false);
          return;
        }
        setNickname(stored);
        setInputName(stored);

      const wishesData: Wish[] = await getWishesByNickname(stored);
      const wishes: Wish[] = [];
      let likeCount = 0;
      const wishDates: string[] = [];
      const categoryMap: Record<string, number> = {};
      let topWish = '';
      let topLikes = -1;

      wishesData.forEach((data) => {
        wishes.push({ ...data, id: data.id });
        likeCount += data.likes || 0;
        if (data.timestamp?.toDate) {
          wishDates.push(data.timestamp.toDate().toDateString());
        }
        if (data.likes > topLikes) {
          topLikes = data.likes;
          topWish = data.text;
        }
        const cat = data.category || 'general';
        categoryMap[cat] = (categoryMap[cat] || 0) + 1;
      });

      const firstWish = wishes.length > 0 ? wishes[wishes.length - 1].text : '';

      const catData = Object.entries(categoryMap).map(([category, count]) => ({ category, count }));

      setMyWishes(wishes);
      setStats({ totalLikes: likeCount, topWish, firstWish });
      setCategoryData(catData);

      const allWishesData: Wish[] = await getAllWishes();
      const allComments: Comment[] = [];

      for (const wishDoc of allWishesData) {
        const commentsSnap: Comment[] = await getWishComments(wishDoc.id);
        commentsSnap.forEach((data) => {
          if (data.nickname === stored) {
            allComments.push({ ...data, id: data.id, wishId: wishDoc.id });
          }
        });
      }
      setMyComments(allComments);

      const today = new Date().toDateString();
      const lastPostDate = await AsyncStorage.getItem('lastPostDate');
      const storedStreak = parseInt((await AsyncStorage.getItem('streak')) || '0');

      if (lastPostDate) {
        const last = new Date(lastPostDate);
        const diffDays = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          const newStreak = storedStreak + 1;
          await AsyncStorage.setItem('streak', newStreak.toString());
          await AsyncStorage.setItem('lastPostDate', today);
          setStreak(newStreak);
        } else if (diffDays === 0) {
          setStreak(storedStreak);
        } else {
          await AsyncStorage.setItem('streak', '1');
          await AsyncStorage.setItem('lastPostDate', today);
          setStreak(1);
        }
      } else {
        await AsyncStorage.setItem('lastPostDate', today);
        await AsyncStorage.setItem('streak', '1');
        setStreak(1);
      }

      const badgeList: string[] = [];
      const todayStr = new Date().toDateString();
      const sameDayWishes = wishDates.filter(date => date === todayStr).length;

      if (storedStreak >= 5) badgeList.push('🔥 5-day Streak');
      if (allComments.length > 0) badgeList.push('💬 First Comment');
      if (likeCount >= 10) badgeList.push('❤️ 10 Likes on Wishes');
      if (sameDayWishes >= 3) badgeList.push('🌈 3 Wishes Today');

      setBadges(badgeList);
      setLoading(false);
    } catch (err) {
      console.error('❌ Failed to load profile data:', err);
      setError('Failed to load profile');
      setLoading(false);
    }
    };
    loadData();
  }, []);

  const handleUpdateNickname = async () => {
    if (!inputName.trim()) return Alert.alert('Enter a valid nickname');
    await AsyncStorage.setItem('nickname', inputName.trim());
    Alert.alert('Nickname updated', 'Reload app to see updated data.');
    setNickname(inputName.trim());
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0e0e0e" />
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
        <Text style={styles.header}>👤 {nickname || 'Anonymous'}</Text>
        {streak > 1 && <Text style={styles.streak}>🔥 {streak}-day wish streak!</Text>}
        <Text style={styles.stats}>❤️ Total Likes: {stats.totalLikes}</Text>
        <Text style={styles.stats}>📬 Total Comments: {myComments.length}</Text>
        <Text style={styles.stats}>🏆 Top Wish: {stats.topWish || 'N/A'}</Text>
        <Text style={styles.stats}>📜 First Wish: {stats.firstWish || 'N/A'}</Text>

        {categoryData.length > 0 && (
          <View style={{ marginVertical: 16 }}>
            <Text style={styles.section}>📊 Category Breakdown</Text>
            <PieChart
              data={categoryData.map((entry, i) => ({
                name: entry.category,
                population: entry.count,
                color: ['#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#fcd34d', '#f87171'][i % 6],
                legendFontColor: '#fff',
                legendFontSize: 12,
              }))}
              width={Dimensions.get('window').width - 40}
              height={180}
              chartConfig={{
                backgroundColor: '#000',
                backgroundGradientFrom: '#1e1e1e',
                backgroundGradientTo: '#1e1e1e',
                color: () => '#fff',
                labelColor: () => '#ccc',
              }}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="15"
            />
          </View>
        )}

        {badges.length > 0 && (
          <View style={styles.badgeContainer}>
            {badges.map((badge, idx) => (
              <Text key={idx} style={styles.badge}>{badge}</Text>
            ))}
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Update nickname..."
          placeholderTextColor="#888"
          value={inputName}
          onChangeText={setInputName}
        />
        <TouchableOpacity style={styles.button} onPress={handleUpdateNickname}>
          <Text style={styles.buttonText}>Update Nickname</Text>
        </TouchableOpacity>

        <Text style={styles.section}>✨ My Wishes ({myWishes.length})</Text>
        <FlatList
          data={myWishes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/wish/${item.id}`)}>
              <View style={styles.card}>
                <Text style={styles.text}>#{item.category || 'Wish'}: {item.text}</Text>
              </View>
            </TouchableOpacity>
          )}
        />

        <Text style={styles.section}>💬 My Comments ({myComments.length})</Text>
        <FlatList
          data={myComments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/wish/${item.wishId}`)}>
              <View style={styles.card}>
                <Text style={styles.text}>{item.text}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0e0e0e',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    color: '#a78bfa',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  streak: {
    color: '#facc15',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stats: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 8,
  },
  badge: {
    backgroundColor: '#8b5cf6',
    color: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#1e1e1e',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  text: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  errorText: {
    color: '#f87171',
    textAlign: 'center',
    marginTop: 20,
  },
  button: {
    backgroundColor: '#8b5cf6',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
