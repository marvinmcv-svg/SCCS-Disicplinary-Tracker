import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, User, RefreshCw, X, Mail, Fingerprint } from 'lucide-react';
import { useAuth } from '../App';
import api from '../lib/api';
import { useI18n } from '../i18n';
import LanguageToggle from '../components/LanguageToggle';
import { InstallAppButton, ThemeToggleButton } from '../components/AppPreferences';
import PasswordInput from '../components/PasswordInput';
import {
  getPasskeyHint,
  setPasskeyHint,
  clearLegacySavedPassword,
  getNeverAsk,
  setNeverAsk,
  isBiometricAvailable,
  registerPasskey,
  signInWithPasskey,
  passkeyErrorMessage,
  type PasskeyHint,
} from '../lib/savedAuth';
// Public asset (served from /public in both Vite and the sandbox) instead of a
// bundled import, so the logo works under either build system.
const sccsLogo = '/sccs.png';

// The "Fix Admin Access" recovery hatch (POST /auth/fix-admin) is gated
// server-side by the ADMIN_FIX_PASSWORD environment variable. The client
// deliberately does NOT know that password: no secret belongs in a JS bundle
// served to every visitor. The server is the single source of truth.

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixPassword, setFixPassword] = useState('');
  const [fixPasswordError, setFixPasswordError] = useState('');
  const [fixing, setFixing] = useState(false);
  const { t } = useI18n();

  // Fingerprint (passkey) sign-in state
  const [hint, setHint] = useState<PasskeyHint | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [showPasskeyOffer, setShowPasskeyOffer] = useState(false);
  const [bioEnabling, setBioEnabling] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioSuccess, setBioSuccess] = useState('');
  const [bioLoginLoading, setBioLoginLoading] = useState(false);
  // Authenticated user+token held here while the "use your fingerprint next
  // time?" offer is open; login() is applied once it closes (the /login route
  // redirects the moment the session is set).
  const pendingLoginRef = useRef<{ user: any; token: string; displayName: string } | null>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Password Reset States
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'reset'>('request');
  const [resetUsername, setResetUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  // Greet a returning fingerprint user, and check for a biometric sensor.
  useEffect(() => {
    clearLegacySavedPassword();
    const saved = getPasskeyHint();
    if (saved) {
      setHint(saved);
      setUsername(saved.username);
    }
    isBiometricAvailable().then(setBioAvailable).catch(() => setBioAvailable(false));
  }, []);

  const completeLogin = (user: any, token: string) => {
    login(user, token);
    navigate('/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      const displayName = `${res.data.user.firstName ?? ''} ${res.data.user.lastName ?? ''}`.trim() || username;
      const alreadySetUp = hint?.username === res.data.user.username;
      if (bioAvailable && !alreadySetUp && !getNeverAsk()) {
        // Offer fingerprint sign-in. The token is stored now so the setup
        // request is authenticated; the session itself starts when the offer closes.
        localStorage.setItem('token', res.data.token);
        pendingLoginRef.current = { user: res.data.user, token: res.data.token, displayName };
        setBioError('');
        setBioSuccess('');
        setShowPasskeyOffer(true);
      } else {
        completeLogin(res.data.user, res.data.token);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || t('Invalid username or password'));
    } finally {
      setLoading(false);
    }
  };

  // ---- "Use your fingerprint next time?" offer ----

  const finishPendingLogin = () => {
    const pending = pendingLoginRef.current;
    pendingLoginRef.current = null;
    setShowPasskeyOffer(false);
    if (pending) completeLogin(pending.user, pending.token);
  };

  const handleNeverAsk = () => {
    setNeverAsk(true);
    finishPendingLogin();
  };

  const handleEnableBiometrics = async () => {
    const pending = pendingLoginRef.current;
    if (!pending) return finishPendingLogin();
    setBioEnabling(true);
    setBioError('');
    try {
      await registerPasskey();
      const next = { username: pending.user.username, displayName: pending.displayName };
      setPasskeyHint(next);
      setHint(next);
      setBioSuccess(t('Fingerprint sign-in is ready. Use it next time.'));
      setTimeout(finishPendingLogin, 1200);
    } catch (err) {
      const message = passkeyErrorMessage(err);
      setBioError(message ? t(message) : t('Fingerprint setup was cancelled. You can try again or continue.'));
    } finally {
      setBioEnabling(false);
    }
  };

  // ---- Fingerprint sign-in ----

  const handleBiometricSignIn = async () => {
    setBioLoginLoading(true);
    setError('');
    try {
      const data = await signInWithPasskey();
      const displayName = `${data.user.firstName ?? ''} ${data.user.lastName ?? ''}`.trim() || data.user.username;
      setPasskeyHint({ username: data.user.username, displayName });
      completeLogin(data.user, data.token);
    } catch (err) {
      const message = passkeyErrorMessage(err);
      if (message) setError(t(message));
    } finally {
      setBioLoginLoading(false);
    }
  };

  const handleSwitchAccount = () => {
    setPasskeyHint(null);
    setHint(null);
    setUsername('');
    setPassword('');
    setError('');
    usernameInputRef.current?.focus();
  };

  const handleFixAdmin = async () => {
    setFixPasswordError('');
    setFixing(true);
    try {
      const res = await api.post('/auth/fix-admin', { password: fixPassword });
      login(res.data.user, res.data.token);
      setShowFixModal(false);
      setFixPassword('');
      navigate('/');
    } catch (err: any) {
      // Shown INSIDE the modal — the login form is behind the overlay and a
      // bare "Invalid password" there was invisible to the user.
      setFixPasswordError(err.response?.data?.error || 'Failed to fix admin');
    } finally {
      setFixing(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);

    try {
      await api.post('/auth/forgot-password', { username: resetUsername });
      setResetSuccess('Password reset instructions sent! Check the console for the reset token (development mode).');
      setResetStep('reset');
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Failed to request password reset');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters');
      return;
    }

    setResetLoading(true);
    try {
      await api.post('/auth/reset-password', { token: resetToken, newPassword });
      setResetSuccess('Password reset successfully! You can now login with your new password.');
      setTimeout(() => {
        setShowResetModal(false);
        setResetStep('request');
        setResetUsername('');
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
        setResetSuccess('');
      }, 2000);
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setResetLoading(false);
    }
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setResetStep('request');
    setResetUsername('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
    setResetSuccess('');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gray-50 dark:bg-black p-4">
      <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-10 flex items-center gap-1">
        <ThemeToggleButton />
        <LanguageToggle />
      </div>
      <div className="w-full max-w-[420px] p-6 md:p-9 bg-white rounded-[28px] border border-black/5 shadow-[0_2px_4px_rgba(0,0,0,0.03),0_30px_80px_-30px_rgba(0,0,0,0.25)] animate-fade-in">
        <div className="text-center mb-7">
          <div className="relative inline-block mb-4">
            <img src={sccsLogo} alt={t('Logo')} className="w-20 h-20 object-cover rounded-[22px] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]" />
            <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md">
              <Lock className="w-3.5 h-3.5 text-gray-700" />
            </div>
          </div>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-gray-900">{t('Discipline Tracker')}</h1>
          <p className="text-gray-500 mt-1">{t('Sign in to continue')}</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Returning fingerprint user */}
        {hint && bioAvailable && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl" data-testid="quick-signin">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                {hint.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{t('Welcome back')}</p>
                <p className="text-xs text-gray-500 break-words">{hint.displayName} · @{hint.username}</p>
              </div>
            </div>
            <button type="button" onClick={handleBiometricSignIn} disabled={bioLoginLoading} className="btn btn-primary w-full justify-center">
              {bioLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              {t('Sign in with fingerprint')}
            </button>
            <button type="button" onClick={handleSwitchAccount} className="mt-3 text-xs text-blue-600 hover:text-blue-700 hover:underline">
              {t('Use a different account')}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">{t('Username')}</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                ref={usernameInputRef}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input pl-12"
                placeholder={t('Enter username')}
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label">{t('Password')}</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('Enter password')}
              data-testid="login-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full justify-center py-3"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('Sign In')}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              {t('Forgot Password?')}
            </button>
          </div>
        </form>

        {bioAvailable && !hint && (
          <button type="button" onClick={handleBiometricSignIn} disabled={bioLoginLoading} className="btn btn-secondary w-full justify-center mt-3">
            {bioLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
            {t('Sign in with fingerprint')}
          </button>
        )}

        <button
          onClick={() => setShowFixModal(true)}
          className="mt-5 w-full py-2 px-4 rounded-full text-sm text-gray-500 hover:text-gray-900 hover:bg-[var(--fill-hover)] flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('Fix Admin Access')}
        </button>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 pb-[env(safe-area-inset-bottom)]">
        <a href="/welcome" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          {t('Discover what SCCS can do')} &rarr;
        </a>
        <InstallAppButton variant="link" />
      </div>

      {/* After a password sign-in: offer fingerprint sign-in on this device */}
      {showPasskeyOffer && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[24px] p-6 w-full max-w-sm shadow-2xl" role="dialog" aria-modal="true" aria-label={t('Use your fingerprint next time?')} data-testid="passkey-offer-dialog">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold">{t('Use your fingerprint next time?')}</h2>
              </div>
              <button onClick={finishPendingLogin} aria-label={t('Close')} className="icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              {t('Sign in with your fingerprint or face instead of typing your password. Your fingerprint never leaves this device.')}
            </p>
            {bioSuccess && <div className="callout callout-info mb-4">{bioSuccess}</div>}
            {bioError && <div className="callout callout-danger mb-4">{bioError}</div>}
            <button onClick={handleEnableBiometrics} disabled={bioEnabling || !!bioSuccess} className="btn btn-primary w-full justify-center py-3">
              {bioEnabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              {t('Use fingerprint')}
            </button>
            <button onClick={finishPendingLogin} className="btn btn-secondary w-full justify-center py-3 mt-2">
              {t('Not now')}
            </button>
            <button onClick={handleNeverAsk} className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700 hover:underline">
              {t('Never ask again on this device')}
            </button>
          </div>
        </div>
      )}

      {/* Fix Admin Password Modal */}
      {showFixModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('Fix Admin Access')}</h2>
              <button
                onClick={() => { setShowFixModal(false); setFixPassword(''); setFixPasswordError(''); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-500 text-sm mb-4">{t('Enter the admin password to reset the admin account.')}</p>
            <div className="mb-4">
              <PasswordInput
                value={fixPassword}
                onChange={(e) => { setFixPassword(e.target.value); setFixPasswordError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleFixAdmin()}
                placeholder={t('Enter password')}
                autoFocus
                data-testid="fix-admin-password"
              />
            </div>
            {fixPasswordError && (
              <p className="text-red-500 text-sm mb-4">{fixPasswordError}</p>
            )}
            <button
              onClick={handleFixAdmin}
              disabled={fixing || !fixPassword}
              className="btn btn-primary w-full justify-center py-3"
            >
              {fixing ? <Loader2 className="w-5 h-5 animate-spin" /> : t('Reset Admin')}
            </button>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {resetStep === 'request' ? t('Reset Password') : t('Enter New Password')}
              </h2>
              <button
                onClick={closeResetModal}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm mb-4">
                {resetSuccess}
              </div>
            )}

            {resetError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
                {resetError}
              </div>
            )}

            {resetStep === 'request' ? (
              <form onSubmit={handleRequestReset}>
                <p className="text-gray-500 text-sm mb-4">
                  {t('Enter your username to receive password reset instructions.')}
                </p>
                <div className="relative mb-4">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    className="input pl-12"
                    placeholder={t('Enter username')}
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="btn btn-primary w-full justify-center py-3"
                >
                  {resetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('Send Reset Link')}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword}>
                <p className="text-gray-500 text-sm mb-4">
                  {t('Enter the reset token from your email and your new password.')}
                </p>
                <div className="relative mb-3">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="input pl-12"
                    placeholder={t('Enter reset token')}
                    required
                    autoFocus
                  />
                </div>
                <div className="mb-3">
                  <PasswordInput
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('New password')}
                  />
                </div>
                <div className="mb-4">
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('Confirm new password')}
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="btn btn-primary w-full justify-center py-3"
                >
                  {resetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('Reset Password')}
                </button>
                <button
                  type="button"
                  onClick={() => setResetStep('request')}
                  className="mt-2 w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {t('Back to username entry')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}