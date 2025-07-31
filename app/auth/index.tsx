import { useAuth } from '@/contexts/AuthContext';
import { useRouter, Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function Page() {
  const router = useRouter();
  const { user, signIn, signUp, signInWithGoogle, signInAnonymously, resetPassword } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGuest = async () => {
    try {
      await signInAnonymously();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async () => {
    try {
      if (!email) {
        setError('Enter your email first');
        return;
      }
      await resetPassword(email);
      alert('Password reset email sent');
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>{mode === 'login' ? 'Login' : 'Sign Up'}</Text>
      {error && <Text style={[styles.error, { color: '#f87171' }]}>{error}</Text>}
      <TextInput
        style={[styles.input, { backgroundColor: theme.input, color: theme.text }]}
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[styles.input, { backgroundColor: theme.input, color: theme.text }]}
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {mode === 'login' && (
        <TouchableOpacity onPress={handleResetPassword} style={styles.link}>
          <Text style={[styles.linkText, { color: theme.tint }]}>Forgot Password?</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.button, { backgroundColor: theme.tint }]} onPress={handleSubmit}>
        <Text style={[styles.buttonText, { color: theme.text }]}>{mode === 'login' ? 'Login' : 'Sign Up'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={styles.link}>
        <Text style={[styles.linkText, { color: theme.tint }]}>
          {mode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.altButton, { backgroundColor: theme.input }]} onPress={handleGoogle}>
        <Text style={[styles.buttonText, { color: theme.text }]}>Continue with Google</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.altButton, { backgroundColor: theme.input }]} onPress={handleGuest}>
        <Text style={[styles.buttonText, { color: theme.text }]}>Continue as Guest</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <Link href="/terms" style={[styles.linkText, { color: theme.tint, marginRight: 16 }]}>Terms</Link>
        <Link href="/privacy" style={[styles.linkText, { color: theme.tint }]}>Privacy</Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    padding: 12,
    borderRadius: 10,
    width: '100%',
    marginBottom: 10,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  altButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  link: {
    marginBottom: 10,
  },
  linkText: {},
  error: {
    marginBottom: 10,
  },
});
