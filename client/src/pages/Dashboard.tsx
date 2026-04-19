import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, Users, Clock, CheckCircle, TrendingUp, 
  AlertCircle, UserCheck, Plus, ChevronRight
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '../lib/api';

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#8b5cf6', '#ec4899', '#06b6d4'];

interface Stats {
  total: number;
  pending: number;
  resolved: number;
  byCategory: { category: string; count: number }[];
  recentIncidents: any[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, resolved: 0, byCategory: [], recentIncidents: [] });
  const navigate = useNavigate();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await api.get('/dashboard/stats');
      setStats(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'badge-danger';
      case 'Pending': return 'badge-warning';
      case 'Resolved': return 'badge-success';
      default: return 'badge-info';
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20 md:pb-6">
      {/* Welcome Section - Mobile App Style */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-4 md:p-6 text-white">
        <h1 className="text-xl md:text-2xl font-bold">Welcome Back!</h1>
        <p className="text-blue-100 text-sm md:text-base mt-1">Here's your discipline overview</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-blue-100">Total</p>
          </div>
          <div className="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{stats.pending}</p>
            <p className="text-xs text-blue-100">Pending</p>
          </div>
          <div className="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{stats.resolved}</p>
            <p className="text-xs text-blue-100">Resolved</p>
          </div>
        </div>
      </div>

      {/* Quick Actions - Mobile App Style */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:overflow-visible md:flex-wrap">
        <button
          onClick={() => navigate('/incidents')}
          className="flex-shrink-0 bg-red-500 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
        >
          <Plus className="w-5 h-5" />
          <span className="font-semibold">New Incident</span>
        </button>
        <button
          onClick={() => navigate('/students')}
          className="flex-shrink-0 bg-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-md border border-gray-100 active:scale-95 transition-transform"
        >
          <Users className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-700">Students</span>
        </button>
        <button
          onClick={() => navigate('/mtss')}
          className="flex-shrink-0 bg-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-md border border-gray-100 active:scale-95 transition-transform"
        >
          <UserCheck className="w-5 h-5 text-green-600" />
          <span className="font-semibold text-gray-700">MTSS</span>
        </button>
      </div>

      {/* Charts - Mobile Card Style */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Incidents by Category</h2>
          {stats.byCategory.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="category" fontSize={10} stroke="#9ca3af" />
                  <YAxis fontSize={10} stroke="#9ca3af" />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
              No data available
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Distribution</h2>
          {stats.byCategory.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.byCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="count"
                  >
                    {stats.byCategory.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Recent Incidents - Mobile List Style */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Recent Incidents</h2>
          <button 
            onClick={() => navigate('/incidents')}
            className="text-sm text-blue-600 font-medium flex items-center gap-1"
          >
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {stats.recentIncidents.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {stats.recentIncidents.slice(0, 5).map((incident) => (
              <button
                key={incident.id}
                onClick={() => navigate('/incidents')}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors"
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
                    <p className="font-semibold text-gray-900 text-sm">{incident.last_name}, {incident.first_name}</p>
                    <p className="text-xs text-gray-500">{incident.violation_type}</p>
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