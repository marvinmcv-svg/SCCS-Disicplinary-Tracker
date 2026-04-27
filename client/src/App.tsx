import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
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

function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await api.get('/version');
        const latestVersion = res.data.version;
        // Simple version comparison - treat as string for now
        if (latestVersion && latestVersion !== CURRENT_VERSION) {
          setUpdateAvailable(true);
        }
      } catch (e) {
        // Silently fail - don't block app if version check fails
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

function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

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
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <UpdateBanner />
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