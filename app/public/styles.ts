import { StyleSheet } from 'react-native';
import { type Theme } from '@/contexts/ThemeContext';

export const createPublicStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
    },
    intro: {
      marginBottom: 20,
      fontSize: 16,
      textAlign: 'center',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      fontSize: 14,
      textAlign: 'center',
      marginTop: 12,
    },
    errorText: {
      fontSize: 14,
      textAlign: 'center',
      marginTop: 12,
    },
    listContent: {
      paddingBottom: 80,
    },
  });

export const createUserCardStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      padding: 12,
      borderRadius: 10,
      marginBottom: 10,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      marginRight: 10,
    },
    placeholderAvatar: {
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
    },
    name: {
      fontWeight: '600',
      marginBottom: 4,
    },
    bio: {
      fontSize: 12,
      marginBottom: 4,
    },
    wishInfo: {
      fontSize: 12,
      marginBottom: 4,
    },
    wishCount: {
      fontSize: 12,
    },
  });
