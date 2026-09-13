import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, User, RefreshCw, X, Mail, Fingerprint, Save, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../App';
import api from '../lib/api';
import { useI18n } from '../i18n';
import LanguageToggle from '../components/LanguageToggle';
import {
  getSavedAuth,
  saveCredentials,
  clearSavedAuth,
  setBiometric,
  getPrefs,
  setNeverAsk,
  isBiometricAvailable,
  createBiometricCredential,
  verifyBiometric,
  type SavedAuth,
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

  // Saved password + biometric sign-in state
  const [savedAuth, setSavedAuth] = useState<SavedAuth | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveStep, setSaveStep] = useState<'password' | 'biometric'>('password');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabling, setBioEnabling] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioSuccess, setBioSuccess] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [bioLoginLoading, setBioLoginLoading] = useState(false);
  // Authenticated user+token held here while the save-password dialog is open;
  // login() is only applied once the dialog resolves (the /login route
  // auto-redirects the moment the token is set).
  const pendingLoginRef = useRef<{ user: any; token: string; username: string; password: string; displayName: string } | null>(null);
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

  // Prefill the form from a saved sign-in (like a browser password manager)
  // and check whether this device supports biometric unlock.
  useEffect(() => {
    const saved = getSavedAuth();
    if (saved) {
      setSavedAuth(saved);
      setUsername(saved.username);
      setPassword(saved.password);
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
      const prefs = getPrefs();
      const saved = getSavedAuth();
      const alreadySaved = saved && saved.username === username;
      if (prefs.neverAsk || alreadySaved) {
        // No prompt — go straight in (saved credentials stay as they are).
        completeLogin(res.data.user, res.data.token);
      } else {
        // First login on this device (or a different account) — offer to save
        // the password before applying the session.
        pendingLoginRef.current = {
          user: res.data.user,
          token: res.data.token,
          username,
          password,
          displayName: `${res.data.user.firstName ?? ''} ${res.data.user.lastName ?? ''}`.trim() || username,
        };
        setSaveStep('password');
        setBioError('');
        setBioSuccess('');
        setShowSaveDialog(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || t('Invalid username or password'));
    } finally {
      setLoading(false);
    }
  };

  // ---- Save-password / biometric dialog handlers ----

  const finishPendingLogin = () => {
    const pending = pendingLoginRef.current;
    pendingLoginRef.current = null;
    setShowSaveDialog(false);
    if (pending) completeLogin(pending.user, pending.token);
  };

  const handleSavePassword = async () => {
    const pending = pendingLoginRef.current;
    if (!pending) return finishPendingLogin();
    saveCredentials(pending.username, pending.password, pending.displayName);
    setSavedAuth(getSavedAuth());
    const available = await isBiometricAvailable().catch(() => false);
    setBioAvailable(available);
    setBioError('');
    setBioSuccess('');
    setSaveStep('biometric');
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
      const credentialId = await createBiometricCredential(pending.username);
      setBiometric(pending.username, credentialId);
      setSavedAuth(getSavedAuth());
      setBioSuccess(t('Biometric sign-in enabled! You can use it next time.'));
      // Brief confirmation, then continue into the app.
      setTimeout(finishPendingLogin, 1200);
    } catch {
      setBioError(t('Biometric setup was cancelled or failed. You can try again or continue with your password.'));
    } finally {
      setBioEnabling(false);
    }
  };

  // ---- Quick sign-in (returning user with saved credentials) ----

  const handleQuickSignIn = async () => {
    const saved = getSavedAuth();
    if (!saved) return;
    setQuickLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { username: saved.username, password: saved.password });
      completeLogin(res.data.user, res.data.token);
    } catch {
      // Most likely the password changed server-side — drop the stale entry.
      clearSavedAuth();
      setSavedAuth(null);
      setPassword('');
      setError(t('Saved sign-in failed — your password may have changed. Please sign in manually.'));
    } finally {
      setQuickLoading(false);
    }
  };

  const handleBiometricSignIn = async () => {
    const saved = getSavedAuth();
    if (!saved?.credentialId) return;
    setBioLoginLoading(true);
    setError('');
    try {
      const verified = await verifyBiometric(saved.credentialId);
      if (verified) {
        const res = await api.post('/auth/login', { username: saved.username, password: saved.password });
        completeLogin(res.data.user, res.data.token);
      } else {
        setError(t('Biometric verification failed. Please sign in with your password.'));
      }
    } catch {
      setError(t('Biometric verification failed. Please sign in with your password.'));
    } finally {
      setBioLoginLoading(false);
    }
  };

  const handleSwitchAccount = () => {
    setUsername('');
    setPassword('');
    setError('');
    usernameInputRef.current?.focus();
  };

  const handleForgetSaved = () => {
    if (confirm(t('Forget the saved sign-in on this device?'))) {
      clearSavedAuth();
      setSavedAuth(null);
      setUsername('');
      setPassword('');
    }
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 p-4">
      <div className="absolute top-4 right-4 z-10">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md p-6 md:p-8 bg-white rounded-2xl shadow-2xl">
        <div className="text-center mb-6">
          <div className="relative inline-block mb-4">
            <img src={sccsLogo} alt={t('Logo')} className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-full shadow-lg border-4 border-blue-100" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <Lock className="w-4 h-4 text-white" />
            </div>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('Discipline Tracker')}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('Sign in to continue')}</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Quick sign-in for returning users with saved credentials */}
        {savedAuth && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl" data-testid="quick-signin">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                {savedAuth.displayName
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{t('Quick Sign-In')}</p>
                <p className="text-xs text-gray-500 truncate">
                  {savedAuth.displayName} · @{savedAuth.username}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleQuickSignIn}
              disabled={quickLoading}
              className="btn btn-primary w-full justify-center"
            >
              {quickLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {t('Continue as {name}', { name: savedAuth.displayName })}
            </button>
            {savedAuth.biometricEnabled && (
              <button
                type="button"
                onClick={handleBiometricSignIn}
                disabled={bioLoginLoading}
                className="btn btn-secondary w-full justify-center mt-2"
              >
                {bioLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                {t('Sign in with biometrics')}
              </button>
            )}
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={handleSwitchAccount}
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
              >
                {t('Use a different account')}
              </button>
              <button
                type="button"
                onClick={handleForgetSaved}
                className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
              >
                {t('Forget saved sign-in?')}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('Username')}</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('Password')}</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-12"
                placeholder={t('Enter password')}
                required
              />
            </div>
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

        <button
          onClick={() => setShowFixModal(true)}
          className="mt-4 w-full py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg text-sm text-white flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {t('Fix Admin Access')}
        </button>
      </div>

      {/* Save Password / Enable Biometrics Modal (after first login) */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" data-testid="save-password-dialog">
            {saveStep === 'password' ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold">{t('Save your password?')}</h2>
                  </div>
                  <button
                    onClick={finishPendingLogin}
                    aria-label={t('Not Now')}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-500 text-sm mb-4">
                  {t('Would you like to save your password on this device for faster sign-in next time?')}
                </p>
                <button
                  onClick={handleSavePassword}
                  className="btn btn-primary w-full justify-center py-3"
                >
                  <Save className="w-4 h-4" />
                  {t('Save Password')}
                </button>
                <button
                  onClick={finishPendingLogin}
                  className="btn btn-secondary w-full justify-center py-3 mt-2"
                >
                  {t('Not Now')}
                </button>
                <button
                  onClick={handleNeverAsk}
                  className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 hover:underline"
                >
                  {t('Never Ask Again on this device')}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold">{t('Enable biometric sign-in?')}</h2>
                  </div>
                  <button
                    onClick={finishPendingLogin}
                    aria-label={t('Skip for Now')}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-500 text-sm mb-4">
                  {t('Sign in next time with your fingerprint, face, or device passkey — no password needed.')}
                </p>
                {bioSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm mb-4">
                    {bioSuccess}
                  </div>
                )}
                {bioError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
                    {bioError}
                  </div>
                )}
                {!bioAvailable && !bioError && !bioSuccess && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 text-sm mb-4">
                    {t('Biometric sign-in is not available on this device.')}
                  </div>
                )}
                {bioAvailable ? (
                  <button
                    onClick={handleEnableBiometrics}
                    disabled={bioEnabling}
                    className="btn btn-primary w-full justify-center py-3"
                  >
                    {bioEnabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                    {t('Enable Biometrics')}
                  </button>
                ) : (
                  <button
                    onClick={finishPendingLogin}
                    className="btn btn-primary w-full justify-center py-3"
                  >
                    {t('Continue Without Biometrics')}
                  </button>
                )}
                <button
                  onClick={finishPendingLogin}
                  className="btn btn-secondary w-full justify-center py-3 mt-2"
                >
                  {t('Skip for Now')}
                </button>
              </>
            )}
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
            <div className="relative mb-4">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={fixPassword}
                onChange={(e) => { setFixPassword(e.target.value); setFixPasswordError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleFixAdmin()}
                className="input pl-12"
                placeholder={t('Enter password')}
                autoFocus
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
                <div className="relative mb-3">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input pl-12"
                    placeholder={t('New password')}
                    required
                  />
                </div>
                <div className="relative mb-4">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input pl-12"
                    placeholder={t('Confirm new password')}
                    required
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