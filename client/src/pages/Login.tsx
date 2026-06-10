import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, User, RefreshCw, X, Mail } from 'lucide-react';
import { useAuth } from '../App';
import api from '../lib/api';
import sccsLogo from '../sccs.png';

const FIX_ADMIN_PASSWORD = 'gmc190494';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixPassword, setFixPassword] = useState('');
  const [fixPasswordError, setFixPasswordError] = useState('');
  const [fixing, setFixing] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.user, res.data.token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const handleFixAdmin = async () => {
    setFixPasswordError('');
    if (fixPassword !== FIX_ADMIN_PASSWORD) {
      setFixPasswordError('Invalid password');
      return;
    }

    setFixing(true);
    setFixPasswordError('');
    try {
      const res = await api.post('/auth/fix-admin', { password: fixPassword });
      login(res.data.user, res.data.token);
      setShowFixModal(false);
      setFixPassword('');
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fix admin');
    } finally {
      setFixing(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);

    try {
      const res = await api.post('/auth/forgot-password', { username: resetUsername });
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
      <div className="w-full max-w-md p-6 md:p-8 bg-white rounded-2xl shadow-2xl">
        <div className="text-center mb-6">
          <div className="relative inline-block mb-4">
            <img src={sccsLogo} alt="Logo" className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-full shadow-lg border-4 border-blue-100" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <Lock className="w-4 h-4 text-white" />
            </div>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Discipline Tracker</h1>
          <p className="text-gray-500 mt-1 text-sm">Sign in to continue</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input pl-12"
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-12"
                placeholder="Enter password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full justify-center py-3"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              Forgot Password?
            </button>
          </div>
        </form>

        <div className="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 text-center">
          <p className="font-medium">Default Admin Credentials:</p>
          <p className="font-mono mt-1">admin / admin123</p>
        </div>

        <button
          onClick={() => setShowFixModal(true)}
          className="mt-4 w-full py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg text-sm text-white flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Fix Admin Access
        </button>
      </div>

      {/* Fix Admin Password Modal */}
      {showFixModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Fix Admin Access</h2>
              <button
                onClick={() => { setShowFixModal(false); setFixPassword(''); setFixPasswordError(''); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-500 text-sm mb-4">Enter the admin password to reset the admin account.</p>
            <div className="relative mb-4">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={fixPassword}
                onChange={(e) => { setFixPassword(e.target.value); setFixPasswordError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleFixAdmin()}
                className="input pl-12"
                placeholder="Enter password"
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
              {fixing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reset Admin'}
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
                {resetStep === 'request' ? 'Reset Password' : 'Enter New Password'}
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
                  Enter your username to receive password reset instructions.
                </p>
                <div className="relative mb-4">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    className="input pl-12"
                    placeholder="Enter username"
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="btn btn-primary w-full justify-center py-3"
                >
                  {resetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword}>
                <p className="text-gray-500 text-sm mb-4">
                  Enter the reset token from your email and your new password.
                </p>
                <div className="relative mb-3">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="input pl-12"
                    placeholder="Enter reset token"
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
                    placeholder="New password"
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
                    placeholder="Confirm new password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="btn btn-primary w-full justify-center py-3"
                >
                  {resetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reset Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setResetStep('request')}
                  className="mt-2 w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back to username entry
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}