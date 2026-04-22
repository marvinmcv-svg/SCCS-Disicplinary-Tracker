import { useState, useEffect } from 'react';
import { Plus, Search, X, HeartHandshake } from 'lucide-react';
import api from '../lib/api';

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
}

interface Intervention {
  id: number;
  student_id: number;
  last_name: string;
  first_name: string;
  tier: number;
  intervention: string;
  start_date: string;
  end_date: string;
  progress: string;
  notes: string;
}

const tierOptions = [
  { tier: 1, name: 'Tier 1 - Universal', description: 'School-wide prevention for all students' },
  { tier: 2, name: 'Tier 2 - Targeted', description: 'Small group interventions for at-risk students' },
  { tier: 3, name: 'Tier 3 - Intensive', description: 'Individual interventions for high-risk students' },
];

const interventionTypes = [
  'Check-In/Check-Out (CICO)',
  'Social Skills Group',
  'Counseling Sessions',
  'Behavior Contract',
  'Mentor Program',
  'Academic Support',
  'Speech/Language Therapy',
  'Occupational Therapy',
  'Counseling Referral',
  'Psychological Evaluation',
  'Alternative Placement',
];

export default function MTSS() {
  const [students, setStudents] = useState<Student[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [formData, setFormData] = useState({
    student_id: '' as string | number,
    tier: 1,
    intervention: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [studentsRes, interventionsRes] = await Promise.all([
        api.get('/students'),
        api.get('/mtss'),
      ]);
      setStudents(studentsRes.data);
      setInterventions(interventionsRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/mtss', {
        student_id: Number(formData.student_id),
        tier: formData.tier,
        intervention: formData.intervention,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        notes: formData.notes,
      });
      loadData();
      closeModal();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error creating intervention');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    try {
      await api.put(`/mtss/${id}`, { progress: 'Completed', end_date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch (error) {
      console.error(error);
    }
  };

  const openModal = () => {
    setFormData({
      student_id: '',
      tier: 1,
      intervention: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      notes: '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const filteredInterventions = interventions.filter(i => {
    const matchesSearch = !search ||
      i.last_name.toLowerCase().includes(search.toLowerCase()) ||
      i.first_name.toLowerCase().includes(search.toLowerCase());
    const matchesTier = !filterTier || i.tier === parseInt(filterTier);
    return matchesSearch && matchesTier;
  });

  const getTierColor = (tier: number) => {
    switch (tier) {
      case 1: return 'bg-green-100 text-green-700';
      case 2: return 'bg-yellow-100 text-yellow-700';
      case 3: return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getProgressColor = (progress: string) => {
    switch (progress) {
      case 'Not Started': return 'badge-warning';
      case 'In Progress': return 'badge-info';
      case 'Completed': return 'badge-success';
      default: return 'badge-info';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MTSS Interventions</h1>
          <p className="text-gray-500">Multi-Tiered System of Supports tracking</p>
        </div>
        <button onClick={openModal} className="btn btn-success">
          <Plus className="w-5 h-5" />
          New Intervention
        </button>
      </div>

      {/* Tier Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tierOptions.map(tier => (
          <div key={tier.tier} className="card">
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getTierColor(tier.tier)}`}>
              {tier.name}
            </div>
            <p className="text-sm text-gray-500 mt-2">{tier.description}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by student name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="select w-40"
          >
            <option value="">All Tiers</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
          </select>
        </div>
      </div>

      {/* Interventions Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : filteredInterventions.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Tier</th>
                <th>Intervention</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInterventions.map((intervention) => (
                <tr key={intervention.id}>
                  <td>{intervention.last_name}, {intervention.first_name}</td>
                  <td>
                    <span className={`badge ${getTierColor(intervention.tier)}`}>
                      Tier {intervention.tier}
                    </span>
                  </td>
                  <td>{intervention.intervention}</td>
                  <td>{intervention.start_date}</td>
                  <td>{intervention.end_date || '-'}</td>
                  <td>
                    <span className={`badge ${getProgressColor(intervention.progress)}`}>
                      {intervention.progress}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleDelete(intervention.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Complete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <HeartHandshake className="w-12 h-12 mx-auto mb-2" />
            <p>No interventions found</p>
            <button onClick={openModal} className="btn btn-success mt-4">
              <Plus className="w-5 h-5" />
              Create First Intervention
            </button>
          </div>
        )}
      </div>

      {/* New Intervention Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New MTSS Intervention</h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Student *</label>
                <select
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  className="select"
                  required
                >
                  <option value="">Select Student</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.last_name}, {s.first_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Tier *</label>
                <select
                  value={formData.tier}
                  onChange={(e) => setFormData({ ...formData, tier: parseInt(e.target.value) })}
                  className="select"
                >
                  {tierOptions.map(t => (
                    <option key={t.tier} value={t.tier}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Intervention Type *</label>
                <select
                  value={formData.intervention}
                  onChange={(e) => setFormData({ ...formData, intervention: e.target.value })}
                  className="select"
                  required
                >
                  <option value="">Select Intervention</option>
                  {interventionTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Start Date</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">End Date (Planned)</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input min-h-[80px]"
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={closeModal} className="btn btn-danger">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Intervention
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}