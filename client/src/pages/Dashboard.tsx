import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, Users, Clock, CheckCircle, TrendingUp, 
  AlertCircle, UserCheck
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Welcome back! Here's an overview of discipline incidents.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="stat-card p-3 md:p-4">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-primary-600" />
            </div>
            <div>
              <p className="stat-value text-xl md:text-2xl">{stats.total}</p>
              <p className="stat-label text-xs">Total Incidents</p>
            </div>
          </div>
        </div>

        <div className="stat-card p-3 md:p-4">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
            </div>
            <div>
              <p className="stat-value text-xl md:text-2xl">{stats.pending}</p>
              <p className="stat-label text-xs">Pending Cases</p>
            </div>
          </div>
        </div>

        <div className="stat-card p-3 md:p-4">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
            </div>
            <div>
              <p className="stat-value text-xl md:text-2xl">{stats.resolved}</p>
              <p className="stat-label text-xs">Resolved</p>
            </div>
          </div>
        </div>

        <div className="stat-card p-3 md:p-4">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
            </div>
            <div>
              <p className="stat-value text-xl md:text-2xl">{stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0}%</p>
              <p className="stat-label text-xs">Resolution Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="card overflow-hidden">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4">Incidents by Category</h2>
          {stats.byCategory.length > 0 ? (
            <div className="h-[250px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="category" fontSize={10} md={12} stroke="#6b7280" />
                  <YAxis fontSize={10} md={12} stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[250px] md:h-[300px] flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4">Distribution</h2>
          {stats.byCategory.length > 0 ? (
            <div className="h-[250px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.byCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
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
            <div className="h-[250px] md:h-[300px] flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Recent Incidents */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Incidents</h2>
          <button 
            onClick={() => navigate('/incidents')}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View All →
          </button>
        </div>

        {stats.recentIncidents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table min-w-[500px]">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Violation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentIncidents.slice(0, 5).map((incident) => (
                  <tr key={incident.id}>
                    <td className="font-mono text-sm">{incident.incident_id}</td>
                    <td>{incident.date}</td>
                    <td>{incident.last_name}, {incident.first_name}</td>
                    <td>{incident.violation_type}</td>
                    <td>
                      <span className={`badge ${getStatusColor(incident.status)}`}>
                        {incident.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-2" />
            <p>No incidents recorded yet</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/students')}
          className="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900">Manage Students</p>
            <p className="text-sm text-gray-500">View and edit student records</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/incidents')}
          className="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900">Record Incident</p>
            <p className="text-sm text-gray-500">Log a new discipline case</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/mtss')}
          className="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-green-600" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900">MTSS Interventions</p>
            <p className="text-sm text-gray-500">Track student support plans</p>
          </div>
        </button>
      </div>
    </div>
  );
}