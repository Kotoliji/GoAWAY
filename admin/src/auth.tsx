import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { API_URL, get, getAccess, getRefresh, post, setTokens } from './api';
import { closeSocket } from './socket';

interface Me {
  email: string;
  role: string;
}

interface AuthValue {
  user: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccess()) {
      setLoading(false);
      return;
    }
    get<{ user: Me }>('/me')
      .then(({ user }) => (user.role === 'ADMIN' ? setUser(user) : setTokens(null)))
      .catch(() => setTokens(null))
      .finally(() => setLoading(false));
  }, []);

  async function signIn(email: string, password: string) {
    const res = await post<{ user: Me; accessToken: string; refreshToken: string }>('/auth/login', {
      email,
      password,
    });
    if (res.user.role !== 'ADMIN') throw new Error('This panel is for administrators only.');
    setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    setUser(res.user);
  }

  async function signOut() {
    const rt = getRefresh();
    if (rt) {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      }).catch(() => undefined);
    }
    closeSocket();
    setTokens(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
