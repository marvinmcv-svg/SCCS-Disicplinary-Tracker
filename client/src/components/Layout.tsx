import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { 
  LayoutDashboard, Users, AlertTriangle, BookOpen, 
  Gift, HeartHandshake, Settings, LogOut, Menu, X
} from 'lucide-react';
import { useState } from 'react';
import sccsLogo from '../sccs.png';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/students', icon: Users, label: 'Students' },
  { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { to: '/violations', icon: BookOpen, label: 'Violations' },
  { to: '/rewards', icon: Gift, label: 'Rewards' },
  { to: '/mtss', icon: HeartHandshake, label: 'MTSS' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-30">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <Menu className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <img src={sccsLogo} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          <span className="font-bold text-blue-800">SCCS</span>
        </div>
        <div className="w-10" />
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col bg-gradient-to-b from-blue-800 to-blue-900 text-white min-h-screen fixed left-0 top-0 w-64 transition-all duration-300 z-20">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src={sccsLogo} alt="Logo" className="w-10 h-10 rounded-lg object-cover" />
            <div>
              <h1 className="font-bold text-lg">SCCS</h1>
              <p className="text-xs text-white/70">Home of the Jaguars</p>
            </div>
          </div>
        </div>

        <nav className="p-2 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                  isActive 
                    ? 'bg-white/20 text-white' 
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="mb-3 text-xs text-white/60">
            <p>Logged in as</p>
            <p className="font-medium text-white">{user?.lastName}, {user?.firstName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside className={`md:hidden fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-blue-800 to-blue-900 text-white z-50 transform transition-transform duration-300 ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={sccsLogo} alt="Logo" className="w-10 h-10 rounded-lg object-cover" />
            <div>
              <h1 className="font-bold text-lg">SCCS</h1>
              <p className="text-xs text-white/70">Home of the Jaguars</p>
            </div>
          </div>
          <button
            onClick={closeMobileMenu}
            className="p-2 hover:bg-white/10 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                  isActive 
                    ? 'bg-white/20 text-white' 
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <div className="mb-3 text-xs text-white/60">
            <p>Logged in as</p>
            <p className="font-medium text-white">{user?.lastName}, {user?.firstName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-16 md:pt-0 transition-all duration-300">
        <header className="hidden md:flex bg-white border-b border-gray-200 px-6 py-4 items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </header>

        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}