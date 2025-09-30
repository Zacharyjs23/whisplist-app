import { jest } from '@jest/globals';

describe('auth services', () => {
  afterEach(() => {
    jest.resetModules();
  });

  describe('signUp', () => {
    it('signs up a user successfully', async () => {
      const createUserWithEmailAndPassword = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('user');
      jest.doMock('firebase/auth', () => ({ createUserWithEmailAndPassword }));
      const authInstance = {};
      jest.doMock('@/firebase', () => ({ auth: authInstance }));

      const { signUp } = require('@/services/auth');
      await expect(signUp('test@example.com', 'password')).resolves.toBe('user');
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        authInstance,
        'test@example.com',
        'password',
      );
    });

    it('propagates errors from Firebase', async () => {
      const error = new Error('failed');
      const createUserWithEmailAndPassword = jest
        .fn<(...args: any[]) => Promise<unknown>>()
        .mockRejectedValue(error);
      jest.doMock('firebase/auth', () => ({ createUserWithEmailAndPassword }));
      jest.doMock('@/firebase', () => ({ auth: {} }));

      const { signUp } = require('@/services/auth');
      await expect(signUp('test@example.com', 'password')).rejects.toThrow('failed');
    });

    it('rejects when auth is uninitialized', async () => {
      const createUserWithEmailAndPassword = jest.fn();
      jest.doMock('firebase/auth', () => ({ createUserWithEmailAndPassword }));
      jest.doMock('@/firebase', () => ({ auth: undefined }));

      const { signUp } = require('@/services/auth');
      await expect(signUp('test@example.com', 'password')).rejects.toThrow(
        'Firebase auth is not initialized',
      );
      expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });
  });

  describe('signIn', () => {
    it('signs in a user successfully', async () => {
      const signInWithEmailAndPassword = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('user');
      jest.doMock('firebase/auth', () => ({ signInWithEmailAndPassword }));
      const authInstance = {};
      jest.doMock('@/firebase', () => ({ auth: authInstance }));

      const { signIn } = require('@/services/auth');
      await expect(signIn('test@example.com', 'password')).resolves.toBe('user');
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        authInstance,
        'test@example.com',
        'password',
      );
    });

    it('propagates errors from Firebase', async () => {
      const error = new Error('failed');
      const signInWithEmailAndPassword = jest
        .fn<(...args: any[]) => Promise<unknown>>()
        .mockRejectedValue(error);
      jest.doMock('firebase/auth', () => ({ signInWithEmailAndPassword }));
      jest.doMock('@/firebase', () => ({ auth: {} }));

      const { signIn } = require('@/services/auth');
      await expect(signIn('test@example.com', 'password')).rejects.toThrow('failed');
    });

    it('rejects when auth is uninitialized', async () => {
      const signInWithEmailAndPassword = jest.fn();
      jest.doMock('firebase/auth', () => ({ signInWithEmailAndPassword }));
      jest.doMock('@/firebase', () => ({ auth: undefined }));

      const { signIn } = require('@/services/auth');
      await expect(signIn('test@example.com', 'password')).rejects.toThrow(
        'Firebase auth is not initialized',
      );
      expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    });
  });

  describe('signInAnonymouslyService', () => {
    it('signs in anonymously successfully', async () => {
      const signInAnonymously = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('anon');
      jest.doMock('firebase/auth', () => ({ signInAnonymously }));
      const authInstance = {};
      jest.doMock('@/firebase', () => ({ auth: authInstance }));

      const { signInAnonymouslyService } = require('@/services/auth');
      await expect(signInAnonymouslyService()).resolves.toBe('anon');
      expect(signInAnonymously).toHaveBeenCalledWith(authInstance);
    });

    it('propagates errors from Firebase', async () => {
      const error = new Error('failed');
      const signInAnonymously = jest
        .fn<(...args: any[]) => Promise<unknown>>()
        .mockRejectedValue(error);
      jest.doMock('firebase/auth', () => ({ signInAnonymously }));
      jest.doMock('@/firebase', () => ({ auth: {} }));

      const { signInAnonymouslyService } = require('@/services/auth');
      await expect(signInAnonymouslyService()).rejects.toThrow('failed');
    });

    it('rejects when auth is uninitialized', async () => {
      const signInAnonymously = jest.fn();
      jest.doMock('firebase/auth', () => ({ signInAnonymously }));
      jest.doMock('@/firebase', () => ({ auth: undefined }));

      const { signInAnonymouslyService } = require('@/services/auth');
      await expect(signInAnonymouslyService()).rejects.toThrow(
        'Firebase auth is not initialized',
      );
      expect(signInAnonymously).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('sends a password reset email successfully', async () => {
      const sendPasswordResetEmail = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('ok');
      jest.doMock('firebase/auth', () => ({ sendPasswordResetEmail }));
      const authInstance = {};
      jest.doMock('@/firebase', () => ({ auth: authInstance }));

      const { resetPassword } = require('@/services/auth');
      await expect(resetPassword('test@example.com')).resolves.toBe('ok');
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        authInstance,
        'test@example.com',
      );
    });

    it('propagates errors from Firebase', async () => {
      const error = new Error('failed');
      const sendPasswordResetEmail = jest
        .fn<(...args: any[]) => Promise<unknown>>()
        .mockRejectedValue(error);
      jest.doMock('firebase/auth', () => ({ sendPasswordResetEmail }));
      jest.doMock('@/firebase', () => ({ auth: {} }));

      const { resetPassword } = require('@/services/auth');
      await expect(resetPassword('test@example.com')).rejects.toThrow('failed');
    });

    it('rejects when auth is uninitialized', async () => {
      const sendPasswordResetEmail = jest.fn();
      jest.doMock('firebase/auth', () => ({ sendPasswordResetEmail }));
      jest.doMock('@/firebase', () => ({ auth: undefined }));

      const { resetPassword } = require('@/services/auth');
      await expect(resetPassword('test@example.com')).rejects.toThrow(
        'Firebase auth is not initialized',
      );
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('signInWithGoogle', () => {
    it('signs in with Google successfully', async () => {
      const signInWithCredential = jest
        .fn<(...args: any[]) => Promise<string>>()
        .mockResolvedValue('ok');
      const GoogleAuthProvider = { credential: jest.fn().mockReturnValue('cred') };
      jest.doMock('firebase/auth', () => ({
        GoogleAuthProvider,
        signInWithCredential,
      }));
      const authInstance = {};
      jest.doMock('@/firebase', () => ({ auth: authInstance }));

      const promptAsync = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue({
          type: 'success',
          authentication: { idToken: 'token' },
        });

      const { signInWithGoogle } = require('@/services/auth');
      await signInWithGoogle(promptAsync);

      expect(GoogleAuthProvider.credential).toHaveBeenCalledWith('token');
      expect(signInWithCredential).toHaveBeenCalledWith(authInstance, 'cred');
    });

    it('propagates errors from signInWithCredential', async () => {
      const error = new Error('failed');
      const signInWithCredential = jest
        .fn<(...args: any[]) => Promise<unknown>>()
        .mockRejectedValue(error);
      const GoogleAuthProvider = { credential: jest.fn().mockReturnValue('cred') };
      jest.doMock('firebase/auth', () => ({
        GoogleAuthProvider,
        signInWithCredential,
      }));
      jest.doMock('@/firebase', () => ({ auth: {} }));

      const promptAsync = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue({
          type: 'success',
          authentication: { idToken: 'token' },
        });

      const { signInWithGoogle } = require('@/services/auth');
      await expect(signInWithGoogle(promptAsync)).rejects.toThrow('failed');
    });

    it('rejects when auth is uninitialized', async () => {
      const signInWithCredential = jest.fn();
      const GoogleAuthProvider = { credential: jest.fn() };
      jest.doMock('firebase/auth', () => ({
        GoogleAuthProvider,
        signInWithCredential,
      }));
      jest.doMock('@/firebase', () => ({ auth: undefined }));

      const promptAsync = jest.fn();
      const { signInWithGoogle } = require('@/services/auth');
      await expect(signInWithGoogle(promptAsync)).rejects.toThrow(
        'Firebase auth is not initialized',
      );
      expect(GoogleAuthProvider.credential).not.toHaveBeenCalled();
      expect(signInWithCredential).not.toHaveBeenCalled();
    });
  });
});
