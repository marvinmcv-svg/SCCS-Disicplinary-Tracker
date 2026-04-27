import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { Clock, LogOut } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentProfile from './pages/StudentProfile';
import Incidents from './pages/Incidents';
import IncidentDetail from './pages/IncidentDetail';
import Violations from './pages/Violations';
import MTSS from './pages/MTSS';
import Settings from './pages/Settings';
import Users from './pages/Users';
import UserProfile from './pages/UserProfile';
import Reports from './pages/Reports';
import Layout from './components/Layout';
import api from './lib/api';

interface AuthContextType {
  user: any;
  token: string | null;
  login: (user: any, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// App version - update this whenever you release new features
const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

// Session timeout constants (in milliseconds)
const WARNING_TIME = 25 * 60 * 1000; // 25 minutes (show warning)
const WARNING_DURATION = 5 * 60 * 1000; // 5 minutes to respond before logout

function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await api.get('/version');
        const latestVersion = res.data.version;
        if (latestVersion && latestVersion !== CURRENT_VERSION) {
          setUpdateAvailable(true);
        }
      } catch (e) {
        // Silently fail
      }
    };
    checkVersion();
  }, []);

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-black px-4 py-2 text-center text-sm z-50 flex items-center justify-center gap-2">
      <span>A new version ({CURRENT_VERSION}) is available!</span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 px-2 py-1 bg-yellow-600 text-white rounded text-xs"
      >
        Dismiss
      </button>
    </div>
  );
}

function SessionTimeoutWarning({
  remainingTime,
  onStayLoggedIn,
  onLogout
}: {
  remainingTime: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}) {
  const minutes = Math.floor(remainingTime / 60000);
  const seconds = Math.floor((remainingTime % 60000) / 1000);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Session Expiring Soon</h2>
          </div>
        </div>
        <p className="text-gray-600 mb-4">
          Your session will expire in <strong>{minutes}:{seconds.toString().padStart(2, '0')}</strong> due to inactivity.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          Click "Stay Logged In" to continue your session, or "Log Out" to end it now.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
          <button
            onClick={onStayLoggedIn}
            className="btn btn-primary flex-1"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState(WARNING_DURATION);

  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoutCallbackRef = useRef<(() => void) | null>(null);

  // Set up logout callback
  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setShowSessionWarning(false);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
  }, []);

  // Store logout in ref for timer callbacks
  logoutCallbackRef.current = handleLogout;

  // Reset activity timer
  const resetActivityTimer = useCallback(() => {
    // Clear existing timers
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }

    setShowSessionWarning(false);

    // Set new warning timer (30 min timeout, warning at 25 min)
    warningTimerRef.current = setTimeout(() => {
      setShowSessionWarning(true);
      setWarningCountdown(WARNING_DURATION);

      // Start countdown
      countdownRef.current = setInterval(() => {
        setWarningCountdown(prev => {
          const newTime = prev - 1000;
          if (newTime <= 0 && countdownRef.current) {
            clearInterval(countdownRef.current);
          }
          return Math.max(0, newTime);
        });
      }, 1000);

      // Set logout timer (5 minutes after warning starts)
      logoutTimerRef.current = setTimeout(() => {
        setShowSessionWarning(false);
        logoutCallbackRef.current?.();
      }, WARNING_DURATION);
    }, WARNING_TIME);
  }, []);

  // Activity event listeners
  useEffect(() => {
    if (!token) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

    // Throttle activity events
    let lastThrottle = 0;
    const throttledHandler = () => {
      const now = Date.now();
      if (now - lastThrottle > 10000) { // Max once per 10 seconds
        lastThrottle = now;
        if (!showSessionWarning) {
          resetActivityTimer();
        }
      }
    };

    events.forEach(event => {
      window.addEventListener(event, throttledHandler, { passive: true });
    });

    // Initialize timer on mount
    resetActivityTimer();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledHandler);
      });
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [token, showSessionWarning, resetActivityTimer]);

  // Extend session on API calls
  useEffect(() => {
    if (!token) return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      if (!showSessionWarning) {
        resetActivityTimer();
      }
      return originalFetch(...args);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [token, showSessionWarning, resetActivityTimer]);

  const handleStayLoggedIn = () => {
    resetActivityTimer();
  };

  useEffect(() => {
    if (token) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) setUser(JSON.parse(savedUser));
    }
  }, [token]);

  const login = (user: any, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(token);
    setUser(user);
    resetActivityTimer();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout: handleLogout }}>
      <UpdateBanner />
      {showSessionWarning && (
        <SessionTimeoutWarning
          remainingTime={warningCountdown}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={handleLogout}
        />
      )}
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
          <Route path="/" element={token ? <Layout /> : <Navigate to="/login" />}>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="students/:id" element={<StudentProfile />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="violations" element={<Violations />} />
            <Route path="reports" element={<Reports />} />
            <Route path="mtss" element={<MTSS />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserProfile />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;