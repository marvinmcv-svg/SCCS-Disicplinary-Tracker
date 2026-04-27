import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, X, HeartHandshake, ChevronDown, ChevronUp, Calendar, Target, FileText, Download, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  advisor?: string;
  intervention_goal?: string;
  progress_monitoring?: string;
  review_date?: string;
  exit_criteria?: string;
  incident_link?: number;
  tier_history?: Array<{ from_tier: number; to_tier: number; date: string; reason: string }>;
}

interface Incident {
  id: number;
  incident_id: string;
  date: string;
  student_id: number;
  violation_type: string;
  last_name: string;
  first_name: string;
}

const tierOptions = [
  { tier: 1, name: 'Tier 1 - Universal', description: 'School-wide prevention for all students', color: 'bg-green-50 border-green-200' },
  { tier: 2, name: 'Tier 2 - Targeted', description: 'Small group interventions for at-risk students', color: 'bg-yellow-50 border-yellow-200' },
  { tier: 3, name: 'Tier 3 - Intensive', description: 'Individual interventions for high-risk students', color: 'bg-red-50 border-red-200' },
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

const allAdvisors = ['Mr Adachi', 'Mr Cohello', 'MrDiPascuale', 'Mr Kane', 'Mr Ortiz', 'Ms Aguirre', 'Ms Camacho', 'Ms Fernandez', 'Ms Guaristi', 'Ms Hopp', 'Ms Meneses', 'Ms Molina', 'Ms Palacios', 'Ms Rios', 'Ms Robinson', 'Ms Skelly', 'Ms Tello', 'Ms Tomelic', 'Ms Zuazo', 'Mr Coronado', 'Mr Herbert', 'Mr Kreller', 'Mr Odekerken', 'Mr Soliz'];

export default function MTSS() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterAdvisor, setFilterAdvisor] = useState('');
  const [filterReviewSoon, setFilterReviewSoon] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<Record<number, boolean>>({ 1: true, 2: false, 3: false });
  const [formData, setFormData] = useState({
    student_id: '' as string | number,
    tier: 1,
    intervention: '',
    advisor: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    progress: 'Not Started',
    notes: '',
    intervention_goal: '',
    progress_monitoring: '',
    review_date: '',
    exit_criteria: '',
    incident_link: '' as string | number,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [studentsRes, interventionsRes, incidentsRes] = await Promise.all([
        api.get('/students'),
        api.get('/mtss'),
        api.get('/incidents'),
      ]);
      setStudents(studentsRes.data);
      setInterventions(interventionsRes.data);
      setIncidents(incidentsRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        student_id: Number(formData.student_id),
        tier: formData.tier,
        intervention: formData.intervention,
        advisor: formData.advisor || null,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        progress: formData.progress || 'In Progress',
        notes: formData.notes,
        intervention_goal: formData.intervention_goal || null,
        progress_monitoring: formData.progress_monitoring || null,
        review_date: formData.review_date || null,
        exit_criteria: formData.exit_criteria || null,
        incident_link: formData.incident_link ? Number(formData.incident_link) : null,
        tier_history: editingId ? undefined : [], // Don't send tier_history on create
      };

      if (editingId) {
        // Check if tier changed for tier history
        const existing = interventions.find(i => i.id === editingId);
        let tierHistory = existing?.tier_history || [];
        if (existing && existing.tier !== formData.tier) {
          tierHistory = [
            ...tierHistory,
            { from_tier: existing.tier, to_tier: formData.tier, date: new Date().toISOString().split('T')[0], reason: 'Tier change' }
          ];
        }
        await api.put(`/mtss/${editingId}`, { ...payload, tier_history: tierHistory });
      } else {
        await api.post('/mtss', payload);
      }
      loadData();
      closeModal();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error saving intervention');
    } finally {
      setSaving(false);
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
    setEditingId(null);
    setFormData({
      student_id: '',
      tier: 1,
      intervention: '',
      advisor: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      progress: 'Not Started',
      notes: '',
      intervention_goal: '',
      progress_monitoring: '',
      review_date: '',
      exit_criteria: '',
      incident_link: '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const openEditModal = (intervention: Intervention) => {
    setEditingId(intervention.id);
    setFormData({
      student_id: intervention.student_id,
      tier: intervention.tier,
      intervention: intervention.intervention,
      advisor: intervention.advisor || '',
      start_date: intervention.start_date,
      end_date: intervention.end_date || '',
      progress: intervention.progress,
      notes: intervention.notes || '',
      intervention_goal: intervention.intervention_goal || '',
      progress_monitoring: intervention.progress_monitoring || '',
      review_date: intervention.review_date || '',
      exit_criteria: intervention.exit_criteria || '',
      incident_link: intervention.incident_link || '',
    });
    setShowModal(true);
  };

  // Case-insensitive advisor matching
  const filteredInterventions = useMemo(() => {
    return interventions.filter(i => {
      const matchesSearch = !search ||
        i.last_name.toLowerCase().includes(search.toLowerCase()) ||
        i.first_name.toLowerCase().includes(search.toLowerCase());
      const matchesTier = !filterTier || i.tier === parseInt(filterTier);
      const matchesAdvisor = !filterAdvisor ||
        i.advisor?.toLowerCase() === filterAdvisor.toLowerCase();

      // 30-day review filter
      let matchesReviewSoon = true;
      if (filterReviewSoon) {
        if (!i.review_date) {
          matchesReviewSoon = false;
        } else {
          const reviewDate = new Date(i.review_date);
          const today = new Date();
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(today.getDate() + 30);
          matchesReviewSoon = reviewDate >= today && reviewDate <= thirtyDaysFromNow;
        }
      }

      return matchesSearch && matchesTier && matchesAdvisor && matchesReviewSoon;
    });
  }, [interventions, search, filterTier, filterAdvisor, filterReviewSoon]);

  // Tier student counts
  const tierCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    filteredInterventions.forEach(i => {
      if (counts[i.tier] !== undefined) counts[i.tier]++;
    });
    return counts;
  }, [filteredInterventions]);

  // Interventions by tier (for collapsible sections)
  const interventionsByTier = useMemo(() => {
    const byTier: Record<number, Intervention[]> = { 1: [], 2: [], 3: [] };
    filteredInterventions.forEach(i => {
      if (byTier[i.tier]) byTier[i.tier].push(i);
    });
    return byTier;
  }, [filteredInterventions]);

  // Tier distribution for chart
  const tierDistribution = useMemo(() => {
    const all = interventions.filter(i => i.progress !== 'Completed');
    const active: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    all.forEach(i => { if (active[i.tier] !== undefined) active[i.tier]++; });
    return active;
  }, [interventions]);

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

  const toggleTier = (tier: number) => {
    setExpandedTiers(prev => ({ ...prev, [tier]: !prev[tier] }));
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('MTSS Interventions Report', 14, 22);

    const activeInterventions = filteredInterventions.filter(i => i.progress !== 'Completed');

    autoTable(doc, {
      startY: 30,
      head: [['Student', 'Tier', 'Intervention', 'Advisor', 'Start Date', 'Review Date', 'Progress']],
      body: activeInterventions.map(i => [
        `${i.last_name}, ${i.first_name}`,
        `Tier ${i.tier}`,
        i.intervention,
        i.advisor || '-',
        i.start_date,
        i.review_date || '-',
        i.progress,
      ]),
    });

    doc.save('mtss-interventions-report.pdf');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MTSS Interventions</h1>
          <p className="text-gray-500">Multi-Tiered System of Supports tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportToPDF} className="btn btn-secondary">
            <Download className="w-5 h-5" />
            Export PDF
          </button>
          <button onClick={openModal} className="btn btn-success">
            <Plus className="w-5 h-5" />
            New Intervention
          </button>
        </div>
      </div>

      {/* Tier Distribution Chart */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Active Interventions by Tier</h3>
        <div className="flex items-end gap-4 h-32">
          {[1, 2, 3].map(tier => {
            const count = tierDistribution[tier] || 0;
            const maxCount = Math.max(...Object.values(tierDistribution), 1);
            const height = (count / maxCount) * 100;
            const color = tier === 1 ? 'bg-green-500' : tier === 2 ? 'bg-yellow-500' : 'bg-red-500';
            return (
              <div key={tier} className="flex-1 flex flex-col items-center">
                <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                  <div className={`${color} rounded-t w-16 transition-all`} style={{ height: `${Math.max(height, 4)}%` }} />
                </div>
                <span className="text-sm font-medium mt-2">Tier {tier}</span>
                <span className="text-xs text-gray-500">{count} students</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tier Explanation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tierOptions.map(tier => (
          <div key={tier.tier} className={`card border-l-4 ${tier.color}`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getTierColor(tier.tier)}`}>
                {tier.name}
              </div>
              <span className="text-sm font-medium text-gray-500">{tierCounts[tier.tier]} students</span>
            </div>
            <p className="text-sm text-gray-500">{tier.description}</p>
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
          <div className="relative">
            <select
              value={filterAdvisor}
              onChange={(e) => setFilterAdvisor(e.target.value)}
              className="select w-48"
            >
              <option value="">All Advisors</option>
              {allAdvisors.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
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
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={filterReviewSoon}
              onChange={(e) => setFilterReviewSoon(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <Calendar className="w-4 h-4" />
            30-Day Check-In Due
          </label>
          {(filterAdvisor || filterTier || filterReviewSoon) && (
            <button
              onClick={() => { setFilterAdvisor(''); setFilterTier(''); setFilterReviewSoon(false); }}
              className="btn btn-secondary"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Tier Lists */}
      <div className="space-y-4">
        {[1, 2, 3].map(tier => (
          <div key={tier} className="card">
            <button
              onClick={() => toggleTier(tier)}
              className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className={`badge ${getTierColor(tier)}`}>Tier {tier}</span>
                <span className="text-sm text-gray-500">
                  {interventionsByTier[tier].length} intervention{interventionsByTier[tier].length !== 1 ? 's' : ''}
                </span>
              </div>
              {expandedTiers[tier] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {expandedTiers[tier] && (
              <div className="mt-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : interventionsByTier[tier].length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Intervention</th>
                        <th>Advisor</th>
                        <th>Start Date</th>
                        <th>Review Date</th>
                        <th>Progress</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interventionsByTier[tier].map((intervention) => (
                        <tr key={intervention.id}>
                          <td>
                            <div>
                              <span className="font-medium">{intervention.last_name}, {intervention.first_name}</span>
                              {/* Tier movement indicator */}
                              {intervention.tier_history && intervention.tier_history.length > 0 && (
                                <span className="ml-2 text-xs text-amber-600" title={`Moved from Tier ${intervention.tier_history[intervention.tier_history.length - 1].from_tier}`}>
                                  ↱ Moved
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div>
                              <span>{intervention.intervention}</span>
                              {intervention.intervention_goal && (
                                <span className="ml-2 text-xs text-gray-400" title={`Goal: ${intervention.intervention_goal}`}>
                                  <Target className="w-3 h-3 inline" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td>{intervention.advisor || '-'}</td>
                          <td>{intervention.start_date}</td>
                          <td>
                            {intervention.review_date ? (
                              <span className={new Date(intervention.review_date) < new Date() ? 'text-red-600' : ''}>
                                {intervention.review_date}
                              </span>
                            ) : '-'}
                          </td>
                          <td>
                            <span className={`badge ${getProgressColor(intervention.progress)}`}>
                              {intervention.progress}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              {intervention.incident_link && (
                                <span className="text-xs text-blue-600 cursor-pointer" onClick={() => navigate(`/incidents/${intervention.incident_link}`)}>
                                  <Link2 className="w-4 h-4" />
                                </span>
                              )}
                              <button
                                onClick={() => handleDelete(intervention.id)}
                                className="text-sm text-red-600 hover:text-red-700"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => openEditModal(intervention)}
                                className="text-sm text-blue-600 hover:text-blue-700"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <HeartHandshake className="w-8 h-8 mx-auto mb-2" />
                    <p>No Tier {tier} interventions</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New/Edit Intervention Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingId ? 'Edit Intervention' : 'New MTSS Intervention'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

              <div>
                <label className="form-label">Advisor</label>
                <select
                  value={formData.advisor || ''}
                  onChange={(e) => setFormData({ ...formData, advisor: e.target.value })}
                  className="select"
                >
                  <option value="">Select Advisor</option>
                  {allAdvisors.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">
                  <Target className="w-4 h-4 inline mr-1" />
                  Intervention Goal
                </label>
                <textarea
                  value={formData.intervention_goal}
                  onChange={(e) => setFormData({ ...formData, intervention_goal: e.target.value })}
                  className="input min-h-[60px]"
                  placeholder="What is the goal of this intervention?"
                />
              </div>

              <div>
                <label className="form-label">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Progress Monitoring
                </label>
                <textarea
                  value={formData.progress_monitoring}
                  onChange={(e) => setFormData({ ...formData, progress_monitoring: e.target.value })}
                  className="input min-h-[60px]"
                  placeholder="How will progress be monitored?"
                />
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
                  <label className="form-label">Progress</label>
                  <select
                    value={formData.progress}
                    onChange={(e) => setFormData({ ...formData, progress: e.target.value })}
                    className="select"
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">End Date (Planned)</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Review Date
                  </label>
                  <input
                    type="date"
                    value={formData.review_date}
                    onChange={(e) => setFormData({ ...formData, review_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Exit Criteria</label>
                <textarea
                  value={formData.exit_criteria}
                  onChange={(e) => setFormData({ ...formData, exit_criteria: e.target.value })}
                  className="input min-h-[60px]"
                  placeholder="What criteria must be met to exit this intervention?"
                />
              </div>

              <div>
                <label className="form-label">
                  <Link2 className="w-4 h-4 inline mr-1" />
                  Linked Incident
                </label>
                <select
                  value={formData.incident_link}
                  onChange={(e) => setFormData({ ...formData, incident_link: e.target.value })}
                  className="select"
                >
                  <option value="">No linked incident</option>
                  {incidents.map(inc => (
                    <option key={inc.id} value={inc.id}>
                      {inc.incident_id} - {inc.last_name}, {inc.first_name} ({inc.violation_type})
                    </option>
                  ))}
                </select>
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
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving...' : (editingId ? 'Update Intervention' : 'Create Intervention')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}