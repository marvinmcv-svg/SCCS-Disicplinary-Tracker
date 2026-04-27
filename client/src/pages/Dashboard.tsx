import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Users, Clock, CheckCircle,
  AlertCircle, UserCheck, Plus, ChevronRight, BarChart3, PieChart as PieChartIcon,
  Bell, FileText, TrendingUp, TrendingDown, Minus, Loader2, Calendar, Filter, X
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import api from '../lib/api';
import sccsLogo from '../sccs.png';

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
const STATUS_COLORS = { Open: '#ef4444', Pending: '#f59e0b', Resolved: '#22c55e' };

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

type DateRange = 'today' | 'week' | 'month' | 'custom';
type ChartView = 'bar' | 'line';

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, resolved: 0, byCategory: [], byGrade: [], byStatus: [], recentIncidents: [], weeklyTrend: [] });
  const [studentCount, setStudentCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [academicYear, setAcademicYear] = useState('AY 2025-2026 | Semester 2');

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('month');
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

  // Load notification count on mount
  useEffect(() => {
    loadNotificationCount();
  }, []);

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

  const loadNotificationCount = async () => {
    try {
      const res = await api.get('/notifications/count');
      setNotificationCount(res.data?.count || 0);
    } catch (error) {
      console.error('Failed to load notifications:', error);
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
    if (dateRange !== 'month') {
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

  // Stat card component
  const StatCard = ({ title, value, icon: Icon, color, onClick, change, clickLabel }: {
    title: string;
    value: number;
    icon: any;
    color: string;
    onClick?: () => void;
    change?: number;
    clickLabel?: string;
  }) => (
    <button
      onClick={onClick}
      className={`bg-white/20 backdrop-blur rounded-xl p-3 text-center ${onClick ? 'cursor-pointer hover:bg-white/30 active:scale-95 transition-all' : ''}`}
    >
      <div className="flex items-center justify-center gap-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-blue-100">{title}</span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {change !== undefined && change !== 0 && (
        <div className={`flex items-center justify-center gap-0.5 text-xs mt-1 ${change > 0 ? 'text-green-300' : 'text-red-300'}`}>
          {getChangeIcon(value, value - change)} <span>{Math.abs(change)}%</span>
        </div>
      )}
      {clickLabel && <span className="text-xs text-blue-200 mt-1 block">{clickLabel}</span>}
    </button>
  );

  // Loading skeleton
  if (loading && stats.total === 0) {
    return (
      <div className="space-y-4 md:space-y-6 animate-fade-in pb-24">
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-4 md:p-6">
          <div className="h-8 w-48 bg-white/20 rounded animate-pulse mb-2" />
          <div className="h-4 w-32 bg-white/20 rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-white/20 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </div>
    );
  }

  const openCount = stats.total - stats.pending - stats.resolved;
  const statusData = [
    { name: 'Open', value: openCount, color: STATUS_COLORS.Open },
    { name: 'Pending', value: stats.pending, color: STATUS_COLORS.Pending },
    { name: 'Resolved', value: stats.resolved, color: STATUS_COLORS.Resolved }
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-24 md:pb-6">
      {/* Welcome Section with Academic Year */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-4 md:p-6 text-white">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Welcome Back!</h1>
            <p className="text-blue-100 text-sm md:text-base">{academicYear}</p>
          </div>
          <button
            onClick={() => navigate('/notifications')}
            className="relative p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <Bell className="w-6 h-6" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard title="Total" value={stats.total} icon={AlertTriangle} color="text-white" onClick={() => navigateToIncidents()} clickLabel="View all" />
          <StatCard title="Pending" value={stats.pending} icon={Clock} color="text-yellow-300" onClick={() => navigateToIncidents('status', 'Open')} clickLabel="View pending" />
          <StatCard title="Resolved" value={stats.resolved} icon={CheckCircle} color="text-green-300" onClick={() => navigateToIncidents('status', 'Resolved')} clickLabel="View resolved" />
          <StatCard title="Students" value={studentCount} icon={Users} color="text-white" onClick={() => navigate('/students')} clickLabel="View students" />
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
          <Calendar className="w-4 h-4 text-blue-200 flex-shrink-0" />
          {['today', 'week', 'month', 'custom'].map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range as DateRange)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
                dateRange === range ? 'bg-white text-blue-700' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {range === 'today' ? 'Today' : range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="bg-white/20 border border-white/30 rounded px-2 py-1 text-xs text-white"
              />
              <span className="text-white/70">-</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="bg-white/20 border border-white/30 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:overflow-visible md:flex-wrap">
        <button
          onClick={() => navigate('/incidents')}
          className="flex-shrink-0 bg-red-500 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
        >
          <Plus className="w-5 h-5" />
          <span className="font-semibold">+ New Incident</span>
        </button>
        <button
          onClick={() => navigateToIncidents('status', 'Open')}
          className="flex-shrink-0 bg-yellow-500 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
        >
          <Clock className="w-5 h-5" />
          <span className="font-semibold">View Pending</span>
        </button>
        <button
          onClick={() => navigate('/reports')}
          className="flex-shrink-0 bg-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-md border border-gray-100 active:scale-95 transition-transform"
        >
          <FileText className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-700">Run Report</span>
        </button>
      </div>

      {/* Category Chart with Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">Incidents by Category</h2>
            {selectedCategory !== 'all' && (
              <button
                onClick={clearCategoryFilter}
                className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
              >
                {selectedCategory} <X className="w-3 h-3" />
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
              <option value="all">All Grades</option>
              {availableGrades.map(g => (
                <option key={g} value={g}>Grade {g}</option>
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
            <span>Filters:</span>
            {selectedGrade !== 'all' && <span className="px-2 py-0.5 bg-gray-100 rounded">Grade {selectedGrade}</span>}
            {selectedCategory !== 'all' && <span className="px-2 py-0.5 bg-gray-100 rounded">{selectedCategory}</span>}
          </div>
        )}

        {stats.byCategory.length > 0 || stats.weeklyTrend.length > 0 ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartView === 'bar' ? (
                <BarChart data={stats.byCategory} onClick={handleCategoryClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="category" fontSize={10} stroke="#9ca3af" angle={-15} textAnchor="end" height={60} />
                  <YAxis fontSize={10} stroke="#9ca3af" />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} cursor="pointer">
                    {stats.byCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={selectedCategory === entry.category ? '#1d4ed8' : COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <LineChart data={stats.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="week" fontSize={10} stroke="#9ca3af" tickFormatter={val => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                  <YAxis fontSize={10} stroke="#9ca3af" />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
            No incident data available for selected filters
          </div>
        )}
      </div>

      {/* Status Donut Chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Incident Status</h2>
          {selectedStatus !== 'all' && (
            <button
              onClick={clearStatusFilter}
              className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
            >
              {selectedStatus} <X className="w-3 h-3" />
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
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
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
              <span className="text-xs text-gray-500">{entry.name}: </span>
              <span className="text-xs font-medium">{Math.round((entry.value / stats.total) * 100)}%</span>
              <span className="text-xs text-gray-400"> ({entry.value})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Incidents */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Recent Incidents</h2>
          <button
            onClick={() => navigateToIncidents()}
            className="text-sm text-blue-600 font-medium flex items-center gap-1"
          >
            View All <ChevronRight className="w-4 h-4" />
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
                    <p className="text-xs text-gray-500">{incident.violation_type}</p>
                    {incident.advisor && (
                      <p className="text-xs text-gray-400">Advisor: {incident.advisor}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${getStatusColor(incident.status)}`}>
                    {incident.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm">No incidents recorded yet</p>
            <button
              onClick={() => navigate('/incidents')}
              className="mt-3 text-sm text-blue-600 font-medium"
            >
              Record First Incident
            </button>
          </div>
        )}
      </div>
    </div>
  );
}