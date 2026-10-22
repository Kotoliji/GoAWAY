import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('admin@tvdept.pt');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="card">
        <h1>TVDEPT Admin</h1>
        <p className="note">Operations panel for the ride-hailing platform.</p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="note">Demo: admin@tvdept.pt / demo123</p>
        </form>
      </div>
    </div>
  );
}
