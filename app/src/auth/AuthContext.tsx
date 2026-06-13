import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { loadTokens, setTokens, clearTokens, hasSession, getRefresh } from './tokens';
import { loginApi, registerApi, meApi, logoutApi } from '../api/endpoints';
import { User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    role: 'CLIENT' | 'DRIVER';
    clientId?: number;
    driverId?: number;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await loadTokens();
      if (hasSession()) {
        try {
          const { user } = await meApi();
          setUser(user);
        } catch {
          await clearTokens();
        }
      }
      setLoading(false);
    })();
  }, []);

  async function signIn(email: string, password: string) {
    const res = await loginApi(email, password);
    await setTokens(res.accessToken, res.refreshToken);
    const { user } = await meApi();
    setUser(user);
  }

  async function signUp(input: {
    email: string;
    password: string;
    role: 'CLIENT' | 'DRIVER';
    clientId?: number;
    driverId?: number;
  }) {
    const res = await registerApi(input);
    await setTokens(res.accessToken, res.refreshToken);
    const { user } = await meApi();
    setUser(user);
  }

  async function signOut() {
    const rt = getRefresh();
    if (rt) await logoutApi(rt);
    await clearTokens();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
