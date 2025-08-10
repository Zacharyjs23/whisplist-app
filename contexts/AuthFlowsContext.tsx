import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  signUp as signUpService,
  signIn as signInService,
  signInWithGoogle as signInWithGoogleService,
  signInAnonymouslyService,
  resetPassword as resetPasswordService,
  signOut as signOutService,
} from '../services/auth';

WebBrowser.maybeCompleteAuthSession();

interface AuthFlowsContextValue {
  authError: string | null;
  setAuthError: (err: string | null) => void;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthFlowsContext = createContext<AuthFlowsContextValue>({
  authError: null,
  setAuthError: () => {},
  signUp: async () => {},
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signInAnonymously: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
});

export const AuthFlowsProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const [authError, setAuthError] = useState<string | null>(null);
  const [, , promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });

  const signUp = async (email: string, password: string) => {
    try {
      await signUpService(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInService(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signInAnonymously = async () => {
    try {
      await signInAnonymouslyService();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const signInWithGoogle = async () => {
    try {
      await signInWithGoogleService(promptAsync);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await resetPasswordService(email);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await signOutService();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  return (
    <AuthFlowsContext.Provider
      value={{
        authError,
        setAuthError,
        signUp,
        signIn,
        signInWithGoogle,
        signInAnonymously,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthFlowsContext.Provider>
  );
};

export const useAuthFlows = () => useContext(AuthFlowsContext);

