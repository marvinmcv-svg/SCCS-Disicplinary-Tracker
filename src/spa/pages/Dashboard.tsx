import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Users, Clock, CheckCircle,
  AlertCircle, UserCheck, Plus, ChevronRight, BarChart3, PieChart as PieChartIcon,
  FileText, TrendingUp, TrendingDown, Minus, Filter, X, Award, Accessibility, Gauge
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import api from '../lib/api';
import { useI18n } from '../i18n';
import { useAuth } from '../App';
// Public asset (served from /public in both Vite and the sandbox) instead of a
// bundled import, so the logo works under either build system.
const sccsLogo = '/sccs.png';

// Apple system colours
const COLORS = ['#0071e3', '#ff3b30', '#ff9f0a', '#34c759', '#af52de', '#ff2d55', '#32ade6', '#30b0c7', '#ff9500', '#5856d6', '#a2845e', '#64d2ff'];
const STATUS_COLORS = { Open: '#ff3b30', Pending: '#ff9f0a', Resolved: '#34c759' };
// Chart chrome follows the light/dark tokens in spa.css.
const TOOLTIP_STYLE = { background: 'var(--surface-raised)', color: 'var(--label)', border: '1px solid var(--separator)', borderRadius: '12px', boxShadow: 'var(--shadow-raised)' };

interface Stats {
  total: number;
  pending: number;
  resolved: number;
  byCategory: { category: string; count: number }[];
  byGrade: { grade: string; count: number }[];
  byStatus: { status: string; count: number }[];
  recentIncidents: any[];
  weeklyTrend: { week: string; count: number }[];
}

type DateRange = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';
type ChartView = 'bar' | 'line';

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isStaff = ['admin', 'principal', 'counselor', 'teacher', 'staff'].includes(user?.role);
  const [glance, setGlance] = useState<{ high: number; mdr_alerts: number; positive_ratio: number | null } | null>(null);

  // State
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, resolved: 0, byCategory: [], byGrade: [], byStatus: [], recentIncidents: [], weeklyTrend: [] });
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [academicYear, setAcademicYear] = useState('AY 2026-2027 | Semester 1');

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [availableGrades, setAvailableGrades] = useState<string[]>([]);

  // Chart
  const [chartView, setChartView] = useState<ChartView>('bar');

  // Previous period stats for comparison
  const [prevStats, setPrevStats] = useState({ total: 0, pending: 0, resolved: 0 });

  // Load settings for academic year
  useEffect(() => {
    loadSettings();
  }, []);

  // Early-warning + PBIS summary for the "at a glance" row (staff only).
  useEffect(() => {
    if (!isStaff) return;
    api.get('/insights/early-warning?limit=1')
      .then(res => setGlance(res.data?.summary ?? null))
      .catch(() => setGlance(null));
  }, [isStaff]);

  // Load initial data
  useEffect(() => {
    loadGrades();
    loadStats();
    loadStudentCount();
  }, []);

  // Reload stats when filters change
  useEffect(() => {
    loadStats();
  }, [dateRange, customStartDate, customEndDate, selectedGrade, selectedCategory, selectedStatus]);

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data?.academic_year) {
        setAcademicYear(`AY ${res.data.academic_year}`);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadGrades = async () => {
    try {
      const res = await api.get('/dashboard/grades');
      setAvailableGrades(res.data || []);
    } catch (error) {
      console.error('Failed to load grades:', error);
    }
  };

  const loadStudentCount = async () => {
    try {
      const res = await api.get('/dashboard/student-count');
      setStudentCount(res.data?.count || 0);
    } catch (error) {
      console.error('Failed to load student count:', error);
    }
  };

  // Calculate date filters based on selected range
  const getDateFilters = useCallback(() => {
    const today = new Date();
    let startDate = '';
    let endDate = today.toISOString().split('T')[0];

    switch (dateRange) {
      case 'all':
        // No date filter - show everything
        startDate = '';
        endDate = '';
        break;
      case 'today':
        startDate = endDate;
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);
        startDate = monthAgo.toISOString().split('T')[0];
        break;
      case 'quarter':
        const quarterAgo = new Date(today);
        quarterAgo.setDate(quarterAgo.getDate() - 90);
        startDate = quarterAgo.toISOString().split('T')[0];
        break;
      case 'custom':
        startDate = customStartDate;
        endDate = customEndDate || endDate;
        break;
    }
    return { startDate, endDate };
  }, [dateRange, customStartDate, customEndDate]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateFilters();

      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedGrade !== 'all') params.append('grade', selectedGrade);
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);

      const res = await api.get(`/dashboard/stats/filtered?${params.toString()}`);
      setStats(res.data || { total: 0, pending: 0, resolved: 0, byCategory: [], byGrade: [], byStatus: [], recentIncidents: [], weeklyTrend: [] });

      // Calculate previous period for comparison
      const prevRes = await api.get(`/dashboard/stats/filtered?${params.toString()}&previous=true`);
      setPrevStats({
        total: prevRes.data?.total || 0,
        pending: prevRes.data?.pending || 0,
        resolved: prevRes.data?.resolved || 0
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate percentage change
  const getChangePercent = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const getChangeIcon = (current: number, previous: number) => {
    const change = current - previous;
    if (change > 0) return <TrendingUp className="w-3 h-3" />;
    if (change < 0) return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'badge-danger';
      case 'Pending': return 'badge-warning';
      case 'Resolved': return 'badge-success';
      default: return 'badge-info';
    }
  };

  const getRowBackground = (status: string) => {
    switch (status) {
      case 'Open': return 'bg-red-50 hover:bg-red-100';
      case 'Pending': return 'bg-yellow-50 hover:bg-yellow-100';
      case 'Resolved': return 'bg-green-50 hover:bg-green-100';
      default: return 'hover:bg-gray-50';
    }
  };

  // Navigate to incidents with filters
  const navigateToIncidents = (filterType?: string, filterValue?: string) => {
    const params = new URLSearchParams();
    if (dateRange !== 'all' && dateRange !== 'month') {
      const { startDate, endDate } = getDateFilters();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
    }
    if (dateRange === 'custom') {
      const { startDate, endDate } = getDateFilters();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
    }
    if (selectedGrade !== 'all') params.append('grade', selectedGrade);
    if (filterType === 'status' && filterValue) params.append('status', filterValue);
    if (filterType === 'category' && filterValue) params.append('category', filterValue);
    setSearchParams(params);
    navigate('/incidents');
  };

  // Handle chart bar click - filter by category
  const handleCategoryClick = (data: any) => {
    if (data && data.activeLabel) {
      setSelectedCategory(data.activeLabel);
    }
  };

  // Handle donut segment click - filter by status
  const handleStatusClick = (status: string) => {
    setSelectedStatus(status);
  };

  // Clear category filter
  const clearCategoryFilter = () => {
    setSelectedCategory('all');
  };

  // Clear status filter
  const clearStatusFilter = () => {
    setSelectedStatus('all');
  };

  // Stat card component (tinted metric tile; the first <p> holds the value)
  const StatCard = ({ title, value, icon: Icon, tone, onClick, clickLabel }: {
    title: string;
    value: number;
    icon: any;
    tone: 'blue' | 'orange' | 'green' | 'purple';
    onClick?: () => void;
    clickLabel?: string;
  }) => (
    <button onClick={onClick} className={`metric metric-${tone} text-left`}>
      <span className="metric-label"><Icon className="w-4 h-4" /><span>{title}</span></span>
      <p className="metric-value">{value.toLocaleString()}</p>
      {clickLabel && <span className="metric-foot">{clickLabel}</span>}
    </button>
  );

  // Loading skeleton (matches the final layout's shape)
  if (loading && stats.total === 0) {
    return (
      <div className="space-y-6 animate-fade-in pb-24">
        <div className="card space-y-4">
          <div className="skeleton h-9 w-56" />
          <div className="skeleton h-4 w-32" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-24" />)}
          </div>
        </div>
        <div className="skeleton h-72" />
      </div>
    );
  }

  const openCount = stats.total - stats.pending - stats.resolved;
  const statusData = [
    { name: 'Open', value: openCount, color: STATUS_COLORS.Open },
    { name: 'Pending', value: stats.pending, color: STATUS_COLORS.Pending },
    { name: 'Resolved', value: stats.resolved, color: STATUS_COLORS.Resolved }
  ].filter(d => d.value > 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('Good morning') : hour < 18 ? t('Good afternoon') : t('Good evening');
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || 'U';

  const quickActions = [
    { key: 'new', label: t('New Incident'), icon: Plus, tint: 'bg-red-50 text-red-600', onClick: () => navigate('/incidents', { state: { openNew: true } }) },
    ...(isStaff ? [
      { key: 'recognize', label: t('Recognize'), icon: Award, tint: 'bg-green-50 text-green-700', onClick: () => navigate('/recognition?new=1') },
      { key: 'support', label: t('Learning Support'), icon: Accessibility, tint: 'bg-blue-50 text-blue-600', onClick: () => navigate('/support') },
    ] : []),
    { key: 'pending', label: t('View Pending'), icon: Clock, tint: 'bg-yellow-50 text-yellow-700', onClick: () => navigateToIncidents('status', 'Open') },
    { key: 'report', label: t('Run Report'), icon: FileText, tint: 'bg-purple-100 text-purple-700', onClick: () => navigate('/reports') },
    ...(isStaff ? [
      { key: 'insights', label: t('Insights'), icon: Gauge, tint: 'bg-indigo-100 text-indigo-700', onClick: () => navigate('/insights') },
    ] : []),
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-24 md:pb-6 max-w-6xl mx-auto">
      {/* Greeting + headline numbers */}
      <section className="card !p-0 overflow-hidden">
        <div className="p-5 md:p-7 pb-4 md:pb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-gray-100 text-gray-700 text-lg font-semibold flex items-center justify-center shrink-0">{initials}</div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500">{greeting}{user?.firstName ? `, ${user.firstName}` : ''}</p>
              <h1 className="page-title">{t('Welcome Back!')}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{academicYear}</p>
            </div>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="px-5 md:px-7 pb-4 flex flex-wrap items-center gap-2">
          <div className="segmented grid grid-cols-3 w-full sm:inline-flex sm:w-auto" role="group" aria-label={t('Date range')}>
            {(['all', 'today', 'week', 'month', 'quarter', 'custom'] as DateRange[]).map(range => (
              <button
                key={range}
                type="button"
                aria-pressed={dateRange === range}
                onClick={() => setDateRange(range)}
                className={dateRange === range ? 'is-active' : ''}
              >
                {range === 'all' ? t('All Time') : range === 'today' ? t('Today') : range === 'week' ? t('Week') : range === 'month' ? t('Month') : range === 'quarter' ? t('Quarter') : t('Custom')}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="input !min-h-[36px] !py-1 text-sm w-auto" aria-label={t('Start Date')} />
              <span className="text-gray-400">-</span>
              <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="input !min-h-[36px] !py-1 text-sm w-auto" aria-label={t('End Date')} />
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 md:px-7 pb-5 md:pb-7">
          <StatCard title={t('Total')} value={stats.total} icon={AlertTriangle} tone="blue" onClick={() => navigateToIncidents()} clickLabel={t('View all')} />
          <StatCard title={t('Pending')} value={stats.pending} icon={Clock} tone="orange" onClick={() => navigateToIncidents('status', 'Open')} clickLabel={t('View pending')} />
          <StatCard title={t('Resolved')} value={stats.resolved} icon={CheckCircle} tone="green" onClick={() => navigateToIncidents('status', 'Resolved')} clickLabel={t('View resolved')} />
          <StatCard title={t('Students')} value={studentCount} icon={Users} tone="purple" onClick={() => navigate('/students')} clickLabel={t('View students')} />
        </div>
      </section>

      {/* Quick Actions */}
      <section aria-label={t('Quick actions')} className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {quickActions.map(a => (
          <button key={a.key} onClick={a.onClick} className="group flex flex-col items-center gap-2 rounded-[20px] bg-white border border-black/5 py-4 px-2 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:scale-[0.97]">
            <span className={`w-12 h-12 rounded-full flex items-center justify-center ${a.tint}`}><a.icon className="w-5 h-5" /></span>
            <span className="text-[13px] font-medium text-gray-900 text-center leading-tight">{a.label}</span>
          </button>
        ))}
      </section>

      {/* At a glance: early warning + PBIS (staff only) */}
      {isStaff && glance && (
        <section className="grid md:grid-cols-3 gap-3" aria-label={t('At a glance')}>
          <button onClick={() => navigate('/insights')} className="callout callout-danger text-left items-center">
            <Gauge className="w-5 h-5 shrink-0" />
            <span className="flex-1"><strong className="tabular-nums">{glance.high}</strong> {t('students at high risk')}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/insights')} className="callout callout-purple text-left items-center">
            <Accessibility className="w-5 h-5 shrink-0" />
            <span className="flex-1"><strong className="tabular-nums">{glance.mdr_alerts}</strong> {t('IEP/504 removal alerts')}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/recognition')} className="callout callout-info text-left items-center">
            <Award className="w-5 h-5 shrink-0" />
            <span className="flex-1"><strong className="tabular-nums">{glance.positive_ratio ?? '-'} : 1</strong> {t('positive to corrective, 30 days')}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </section>
      )}

      {/* Category Chart with Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">{t('Incidents by Category')}</h2>
            {selectedCategory !== 'all' && (
              <button
                onClick={clearCategoryFilter}
                className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
              >
                {t(selectedCategory)} <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Grade Filter */}
            <select
              value={selectedGrade}
              onChange={e => setSelectedGrade(e.target.value)}
              className="select text-xs py-1.5"
            >
              <option value="all">{t('All Grades')}</option>
              {availableGrades.map(g => (
                <option key={g} value={g}>{t('Grade {g}', { g })}</option>
              ))}
            </select>

            {/* Chart Type Toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setChartView('bar')}
                className={`p-2 rounded-md ${chartView === 'bar' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setChartView('line')}
                className={`p-2 rounded-md ${chartView === 'line' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
              >
                <TrendingUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filters Display */}
        {(selectedGrade !== 'all' || selectedCategory !== 'all') && (
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
            <Filter className="w-3 h-3" />
            <span>{t('Filters:')}</span>
            {selectedGrade !== 'all' && <span className="px-2 py-0.5 bg-gray-100 rounded">{t('Grade {g}', { g: selectedGrade })}</span>}
            {selectedCategory !== 'all' && <span className="px-2 py-0.5 bg-gray-100 rounded">{t(selectedCategory)}</span>}
          </div>
        )}

        {stats.byCategory.length > 0 || stats.weeklyTrend.length > 0 ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartView === 'bar' ? (
                <BarChart data={stats.byCategory} onClick={handleCategoryClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="category" fontSize={10} stroke="var(--chart-axis)" angle={-15} textAnchor="end" height={60} tickFormatter={(val: any) => t(String(val))} />
                  <YAxis fontSize={10} stroke="var(--chart-axis)" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(label: any) => t(String(label))} formatter={(value: any) => [value, t('Incidents')]} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} cursor="pointer">
                    {stats.byCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={selectedCategory === entry.category ? '#1d4ed8' : COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <LineChart data={stats.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="week" fontSize={10} stroke="var(--chart-axis)" tickFormatter={val => new Date(val).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' })} />
                  <YAxis fontSize={10} stroke="var(--chart-axis)" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(label: any) => new Date(label).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' })} formatter={(value: any) => [value, t('Incidents')]} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
            {t('No incident data available for selected filters')}
          </div>
        )}
      </div>

      {/* Status Donut Chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">{t('Incident Status')}</h2>
          {selectedStatus !== 'all' && (
            <button
              onClick={clearStatusFilter}
              className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
            >
              {t(selectedStatus)} <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {statusData.length > 0 ? (
          <div className="h-[220px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={(_, index) => handleStatusClick(statusData[index].name)}
                  cursor="pointer"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke={selectedStatus === entry.name ? '#1d4ed8' : 'transparent'} strokeWidth={3} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: any, name: any) => [value, t(String(name))]} />
                <Legend formatter={(value: any) => <span style={{ color: 'var(--label-2)' }}>{t(String(value))}</span>} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
                <p className="text-xs text-gray-500">{t('Total')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
            No incidents found
          </div>
        )}

        {/* Status percentages */}
        <div className="flex justify-center gap-4 mt-2">
          {statusData.map(entry => (
            <div key={entry.name} className="text-center">
              <span className="text-xs text-gray-500">{t(entry.name)}: </span>
              <span className="text-xs font-medium">{Math.round((entry.value / stats.total) * 100)}%</span>
              <span className="text-xs text-gray-400"> ({entry.value})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Incidents */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{t('Recent Incidents')}</h2>
          <button
            onClick={() => navigateToIncidents()}
            className="text-sm text-blue-600 font-medium flex items-center gap-1"
          >
            {t('View All')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {stats.recentIncidents.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {stats.recentIncidents.map((incident) => (
              <button
                key={incident.id}
                onClick={() => navigateToIncidents()}
                className={`w-full text-left p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors ${getRowBackground(incident.status)}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    incident.status === 'Resolved' ? 'bg-green-100' :
                    incident.status === 'Pending' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    {incident.status === 'Resolved' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : incident.status === 'Pending' ? (
                      <Clock className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {incident.last_name}, {incident.first_name}
                      <span className="text-xs text-gray-400 ml-2">{incident.date}</span>
                    </p>
                    <p className="text-xs text-gray-500">{t(incident.violation_type)}</p>
                    {incident.advisor && (
                      <p className="text-xs text-gray-400">{t('Advisor: {name}', { name: incident.advisor })}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${getStatusColor(incident.status)}`}>
                    {t(incident.status)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm">{t('No incidents recorded yet')}</p>
            <button
              onClick={() => navigate('/incidents')}
              className="mt-3 text-sm text-blue-600 font-medium"
            >
              {t('Record First Incident')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}