import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  Activity, Eye, EyeOff, LockKeyhole,
  Mail, ArrowRight, Wifi, ShieldCheck
} from 'lucide-react';
import './auth.css';

export default function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      let result;

      if (mode === 'login') {
        result = await signIn(email, password);
      } else if (mode === 'signup') {
        result = await signUp(email, password);
      } else {
        result = await resetPassword(email);
      }

      if (result?.error) throw result.error;

      if (mode === 'signup') {
        setMessage(
          'Registration successful. Please check your email to verify your account.'
        );
      } else if (mode === 'forgot') {
        setMessage('Password recovery instructions have been sent if the account exists.');
      } else {
        setMessage('Login successful.');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const heading = {
    login: 'Welcome back',
    signup: 'Create your account',
    forgot: 'Reset your password'
  };

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-logo">
          <Wifi size={25}/>
        </div>
        <div>
          <h1>FIBER PLANNER <span>STUDIO</span></h1>
          <p>Professional Fiber Network Planning</p>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-heading">
          <div className="auth-lock">
            <ShieldCheck size={24}/>
          </div>
          <div className="auth-eyebrow">SECURE ACCESS</div>
          <h2>{heading[mode]}</h2>
          <p>
            {mode === 'login'
              ? 'Sign in to access your fiber planning workspace.'
              : mode === 'signup'
              ? 'Register to start managing your fiber projects.'
              : 'Enter your email to receive password recovery instructions.'}
          </p>
        </div>

        <form onSubmit={submit}>
          <label>Email address</label>
          <div className="auth-input">
            <Mail size={18}/>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {mode !== 'forgot' && (
            <>
              <label>Password</label>
              <div className="auth-input">
                <LockKeyhole size={18}/>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading ? 'Please wait...' :
              mode === 'login' ? 'Sign In' :
              mode === 'signup' ? 'Create Account' :
              'Send Recovery Email'}
            {!loading && <ArrowRight size={18}/>}
          </button>
        </form>

        {mode === 'login' && (
          <button className="auth-text-button"
            onClick={() => {
              setMode('forgot');
              setError('');
              setMessage('');
            }}>
            Forgot your password?
          </button>
        )}

        <div className="auth-divider"><span>OR</span></div>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              Don't have an account?
              <button onClick={() => {
                setMode('signup');
                setError('');
                setMessage('');
              }}>Create account</button>
            </>
          ) : (
            <>
              Already have an account?
              <button onClick={() => {
                setMode('login');
                setError('');
                setMessage('');
              }}>Sign in</button>
            </>
          )}
        </div>
      </section>

      <footer className="auth-footer">
        <Activity size={15}/>
        <span>FIBER PLANNER STUDIO V14.1</span>
        <span>•</span>
        <span>Secure Workspace</span>
      </footer>
    </main>
  );
}
