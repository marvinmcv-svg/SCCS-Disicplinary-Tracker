import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import {
  LayoutDashboard, Users, AlertTriangle, BookOpen, HeartHandshake, Settings, LogOut, Menu, X, Shield, Bell,
  Accessibility, Award, Gauge, FileBarChart, Search, Plus, ClipboardList,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { useI18n } from '../i18n';
import LanguageToggle from './LanguageToggle';
import CommandPalette, { PaletteCommand } from './CommandPalette';
import { AppearanceControl, InstallAppButton, ThemeToggleButton } from './AppPreferences';
import { FingerprintSetupRow } from './FingerprintSettings';

// Public asset (served from /public) so the logo works under any build system.
const sccsLogo = '/sccs.png';

type NavItem = { to: string; icon: typeof LayoutDashboard; label: string; end?: boolean; staffOnly?: boolean };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
      { to: '/insights', icon: Gauge, label: 'Insights', staffOnly: true },
    ],
  },
  {
    label: 'Students',
    items: [
      { to: '/students', icon: Users, label: 'Students' },
      { to: '/support', icon: Accessibility, label: 'Learning Support', staffOnly: true },
      { to: '/recognition', icon: Award, label: 'Recognition', staffOnly: true },
      { to: '/mtss', icon: HeartHandshake, label: 'MTSS' },
    ],
  },
  {
    label: 'Discipline',
    items: [
      { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
      { to: '/referrals', icon: ClipboardList, label: 'Referrals', staffOnly: true },
      { to: '/violations', icon: BookOpen, label: 'Violations' },
      { to: '/reports', icon: FileBarChart, label: 'Reports' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/users', icon: Shield, label: 'Users' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

const STAFF_ROLES = ['admin', 'coordinator', 'principal', 'counselor', 'teacher', 'staff'];

function Bubble({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-semibold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center ring-2 ring-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const isStaff = STAFF_ROLES.includes(user?.role);

  const groups = useMemo(
    () => NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.staffOnly || isStaff) })),
    [isStaff],
  );

  const tabItems: NavItem[] = isStaff
    ? [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: '/students', icon: Users, label: 'Students' },
        { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
        { to: '/support', icon: Accessibility, label: 'Support' },
        { to: '/insights', icon: Gauge, label: 'Insights' },
      ]
    : [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: '/students', icon: Users, label: 'Students' },
        { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
        { to: '/mtss', icon: HeartHandshake, label: 'MTSS' },
      ];

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/notifications/count');
        setNotificationCount(res.data?.count || 0);
      } catch (error) {
        console.error('Failed to load notifications:', error);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close the drawer on navigation.
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  // Cmd/Ctrl + K opens the command palette anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const commands: PaletteCommand[] = useMemo(() => {
    const go = groups.flatMap((g) => g.items).map((i) => ({
      id: `go-${i.to}`,
      label: t(i.label),
      icon: i.icon,
      run: () => navigate(i.to),
      keywords: i.label,
    }));
    const actions: PaletteCommand[] = [
      { id: 'new-incident', label: t('New incident'), icon: Plus, run: () => navigate('/incidents', { state: { openNew: true } }), keywords: 'create report referral' },
    ];
    if (isStaff) {
      actions.push({ id: 'recognize', label: t('Recognize a Student'), icon: Award, run: () => navigate('/recognition?new=1'), keywords: 'pbis praise positive' });
    }
    return [...actions, ...go];
  }, [groups, isStaff, navigate, t]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || 'U';

  const navLinkClass = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'is-active' : ''}`;
  const drawerLinkClass = ({ isActive }: { isActive: boolean }) => `drawer-link ${isActive ? 'is-active' : ''}`;

  return (
    <div className="flex min-h-[100dvh]">
      {/* Mobile header (first header in the DOM: its first button is the menu) */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 glass border-b border-black/5 px-3 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between h-14">
          <button onClick={() => setMobileMenuOpen(true)} className="icon-btn" aria-label={t('Menu')}>
            <Menu className="w-6 h-6 text-gray-900" />
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src={sccsLogo} alt="Logo" className="w-8 h-8 rounded-[10px] object-cover" />
            <span className="font-semibold text-[17px] tracking-tight text-gray-900">SCCS</span>
          </button>
          <div className="flex items-center gap-0.5">
            <button onClick={openPalette} className="icon-btn" aria-label={t('Search')}>
              <Search className="w-5 h-5" />
            </button>
            <button onClick={() => navigate('/incidents')} className="icon-btn relative" aria-label={t('Notifications')}>
              <Bell className="w-5 h-5" />
              <Bubble count={notificationCount} />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 min-w-0 md:ml-64 pt-[calc(env(safe-area-inset-top)+72px)] md:pt-0">
        <header className="hidden md:flex glass border-b border-black/5 px-8 h-14 items-center justify-between sticky top-0 z-10">
          <span className="text-sm text-gray-500">
            {new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/incidents', { state: { openNew: true } })} className="btn btn-primary !min-h-[34px] !py-1.5 !px-3.5 text-sm">
              <Plus className="w-4 h-4" /> {t('New incident')}
            </button>
            <button onClick={() => navigate('/incidents')} className="icon-btn relative" aria-label={t('Notifications')}>
              <Bell className="w-5 h-5" />
              <Bubble count={notificationCount} />
            </button>
          </div>
        </header>

        <div className="px-4 md:px-8 py-4 md:py-8 pb-32 md:pb-10">
          <Outlet />
        </div>
      </main>

      {/* Sidebars come after <main> in the DOM so page content is read first. */}
      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40" onClick={() => setMobileMenuOpen(false)} />
      )}
      <aside
        className={`md:hidden fixed left-0 top-0 h-full w-[84%] max-w-[320px] bg-gray-50 z-50 flex flex-col transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!mobileMenuOpen}
      >
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-3">
          <div className="flex items-center gap-3">
            <img src={sccsLogo} alt="Logo" className="w-10 h-10 rounded-xl object-cover" />
            <div>
              <h1 className="font-semibold text-gray-900 leading-tight">SCCS</h1>
              <p className="text-xs text-gray-500">{t('Home of the Jaguars')}</p>
            </div>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="icon-btn" aria-label={t('Close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="nav-group-label">{t(g.label)}</p>
              <div className="bg-white rounded-2xl p-1 border border-black/5">
                {g.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={drawerLinkClass} onClick={() => setMobileMenuOpen(false)}>
                    <item.icon />
                    <span>{t(item.label)}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] border-t border-black/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-700 text-sm font-semibold flex items-center justify-center shrink-0">{initials}</div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{t('Logged in as')}</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{user?.lastName}, {user?.firstName}</p>
              </div>
            </div>
            <LanguageToggle />
          </div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-sm text-gray-500">{t('Appearance')}</span>
            <AppearanceControl />
          </div>
          <div className="mb-2 -mx-3">
            <InstallAppButton />
            <FingerprintSetupRow />
          </div>
          <button onClick={handleLogout} className="btn btn-secondary w-full">
            <LogOut className="w-5 h-5" />
            <span>{t('Logout')}</span>
          </button>
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-[100dvh] w-64 glass sidebar z-20">
        <div className="px-4 pt-5 pb-3">
          <button onClick={() => navigate('/')} className="w-full flex items-center gap-3 rounded-xl p-1 -m-1 hover:bg-[var(--fill-hover)] transition-colors">
            <img src={sccsLogo} alt="Logo" className="w-9 h-9 rounded-[10px] object-cover" />
            <div className="text-left">
              <h1 className="font-semibold text-[15px] leading-tight text-gray-900">SCCS</h1>
              <p className="text-xs text-gray-500">{t('Home of the Jaguars')}</p>
            </div>
          </button>
        </div>
        <div className="px-3 pb-1">
          <button onClick={openPalette} className="search-field w-full text-left" aria-label={t('Search')}>
            <Search className="w-4 h-4" />
            <span className="flex-1 text-[15px] text-gray-500">{t('Search')}</span>
            <span className="kbd">Ctrl K</span>
          </button>
        </div>

        <nav className="px-3 flex-1 min-h-0 overflow-y-auto pb-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="nav-group-label">{t(g.label)}</p>
              {g.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                  <item.icon />
                  <span>{t(item.label)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-black/5">
          <div className="flex items-center gap-3 px-1 mb-2">
            <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-700 text-sm font-semibold flex items-center justify-center shrink-0">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-gray-500">{t('Logged in as')}</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.lastName}, {user?.firstName}</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-1 mb-1">
            <LanguageToggle />
            <ThemeToggleButton />
          </div>
          <InstallAppButton />
          <FingerprintSetupRow />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-[var(--fill-hover)] rounded-[9px] transition-colors text-sm font-medium"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span>{t('Logout')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile floating tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 tabbar" aria-label={t('Primary')}>
        <div className="tabbar-inner">
          {tabItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tab-link ${isActive ? 'is-active' : ''}`}>
              <item.icon />
              <span>{t(item.label)}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
