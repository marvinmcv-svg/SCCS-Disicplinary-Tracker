import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, User, RefreshCw, X } from 'lucide-react';
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
    try {
      const res = await api.post('/auth/fix-admin');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 p-4">
      <div className="w-full max-w-md p-6 md:p-8 bg-white rounded-2xl shadow-2xl">
        <div className="text-center mb-6">
          <img src={sccsLogo} alt="Logo" className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-2xl mx-auto mb-4" />
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">SCCS Discipline Tracker</h1>
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
    </div>
  );
}