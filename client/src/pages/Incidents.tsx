import { useState, useEffect, useRef } from 'react';
import { Plus, Search, X, AlertCircle, Phone, CheckCircle, Clock, Loader, Check, Trash2 } from 'lucide-react';
import api from '../lib/api';

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
}

interface Violation {
  id: number;
  category: string;
  violation_type: string;
  description: string;
  points_deduction: number;
  default_consequence: string;
  max_oss_days: number;
}

interface Incident {
  id: number;
  incident_id: string;
  date: string;
  time: string;
  student_id: number;
  student_id_raw: string;
  last_name: string;
  first_name: string;
  violation_id: number;
  category: string;
  violation_type: string;
  location: string;
  description: string;
  witnesses: string;
  advisor: string;
  parent_contacted: string;
  contact_date: string;
  action_taken: string;
  consequence: string;
  points_deducted: number;
  days_iss: number;
  days_oss: number;
  detention_hours: number;
  notes: string;
  follow_up_needed: string;
  status: string;
  resolved_date: string;
}

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewIncident, setViewIncident] = useState<Incident | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '',
    student_id: '' as string | number,
    violation_id: '' as string | number,
    location: '',
    description: '',
    witnesses: '',
    advisor: '',
    action_taken: '',
    consequence: '',
    notes: '',
  });

  const [contactData, setContactData] = useState({
    parent_contacted: 'No',
    contact_date: '',
  });

  const [studentSearch, setStudentSearch] = useState('');
  const [violationSearch, setViolationSearch] = useState('');
  const [witnessSearch, setWitnessSearch] = useState('');
  const [advisorSearch, setAdvisorSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [showViolationDropdown, setShowViolationDropdown] = useState(false);
  const [showWitnessDropdown, setShowWitnessDropdown] = useState(false);
  const [showAdvisorDropdown, setShowAdvisorDropdown] = useState(false);
  const studentRef = useRef<HTMLDivElement>(null);
  const violationRef = useRef<HTMLDivElement>(null);
  const witnessRef = useRef<HTMLDivElement>(null);
  const advisorRef = useRef<HTMLDivElement>(null);

  const allStaff = ['Mr Adachi', 'Mr Cohello', 'MrDiPascuale', 'Mr Kane', 'Mr Ortiz', 'Ms Aguirre', 'Ms Camacho', 'Ms Fernandez', 'Ms Guaristi', 'Ms Hopp', 'Ms Meneses', 'Ms Molina', 'Ms Palacios', 'Ms Rios', 'Ms Robinson', 'Ms Skelly', 'Ms Tello', 'Ms Tomelic', 'Ms Zuazo', 'Mr Coronado', 'Mr Herbert', 'Mr Kreller', 'Mr Odekerken', 'Mr Soliz'];

  const allWitnesses = allStaff;
  const allAdvisors = allStaff;

  const filteredWitnesses = allWitnesses.filter(w =>
    !witnessSearch || w.toLowerCase().includes(witnessSearch.toLowerCase())
  );

  const filteredAdvisors = allAdvisors.filter(a =>
    !advisorSearch || a.toLowerCase().includes(advisorSearch.toLowerCase())
  );

  const selectedWitnesses = formData.witnesses ? formData.witnesses.split(',').map(w => w.trim()).filter(Boolean) : [];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (studentRef.current && !studentRef.current.contains(event.target as Node)) {
        setShowStudentDropdown(false);
      }
      if (violationRef.current && !violationRef.current.contains(event.target as Node)) {
        setShowViolationDropdown(false);
      }
      if (witnessRef.current && !witnessRef.current.contains(event.target as Node)) {
        setShowWitnessDropdown(false);
      }
      if (advisorRef.current && !advisorRef.current.contains(event.target as Node)) {
        setShowAdvisorDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredStudentsForSelect = students.filter(s =>
    !studentSearch ||
    s.last_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.first_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.student_id.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const filteredViolationsForSelect = violations.filter(v =>
    !violationSearch ||
    v.violation_type.toLowerCase().includes(violationSearch.toLowerCase()) ||
    v.category.toLowerCase().includes(violationSearch.toLowerCase())
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [incidentsRes, studentsRes, violationsRes, categoriesRes] = await Promise.all([
        api.get('/incidents'),
        api.get('/students'),
        api.get('/violations'),
        api.get('/violations/categories'),
      ]);
      setIncidents(incidentsRes.data);
      setStudents(studentsRes.data);
      setViolations(violationsRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredIncidents = incidents.filter(i => {
    const matchesSearch = !search || 
      i.incident_id.toLowerCase().includes(search.toLowerCase()) ||
      i.last_name.toLowerCase().includes(search.toLowerCase()) ||
      i.first_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filterStatus || i.status === filterStatus;
    const matchesCategory = !filterCategory || i.category === filterCategory;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/incidents', {
        ...formData,
        student_id: Number(formData.student_id),
        violation_id: Number(formData.violation_id),
      });
      loadData();
      closeModal();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error creating incident');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      const resolvedDate = status === 'Resolved' ? new Date().toISOString().split('T')[0] : null;
      await api.put(`/incidents/${id}`, {
        status,
        resolved_date: resolvedDate
      });

      const updatedIncidents = incidents.map(i =>
        i.id === id ? { ...i, status, resolved_date: resolvedDate } : i
      );
      setIncidents(updatedIncidents);

      if (viewIncident?.id === id) {
        setViewIncident({ ...viewIncident, status, resolved_date: resolvedDate });
      }
    } catch (error) {
      console.error(error);
      alert('Failed to update status');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/incidents/${id}`);
      loadData();
      setShowViewModal(false);
    } catch (error) {
      console.error(error);
      alert('Failed to delete incident');
    }
  };

  const handleParentContact = async (id: number) => {
    try {
      await api.put(`/incidents/${id}`, {
        parent_contacted: contactData.parent_contacted,
        contact_date: contactData.contact_date || new Date().toISOString().split('T')[0],
      });
      loadData();
      setContactData({ parent_contacted: 'No', contact_date: '' });
    } catch (error) {
      console.error(error);
    }
  };

  const openModal = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    setFormData({
      date: new Date().toISOString().split('T')[0],
      time: `${hours}:${minutes}`,
      student_id: '',
      violation_id: '',
      location: '',
      description: '',
      witnesses: '',
      advisor: '',
      action_taken: '',
      consequence: '',
      notes: '',
    });
    setStudentSearch('');
    setViolationSearch('');
    setWitnessSearch('');
    setAdvisorSearch('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const filteredViolations = formData.violation_id 
    ? violations.filter(v => v.id === Number(formData.violation_id))
    : [];

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
          <p className="text-gray-500">Record and manage discipline incidents</p>
        </div>
        <div className="flex gap-2">
          {saved && (
            <span className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-xl">
              <Check className="w-5 h-5" />
              <span className="font-medium">Saved!</span>
            </span>
          )}
          <button onClick={openModal} className="btn btn-primary">
            <Plus className="w-5 h-5" />
            New Incident
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search incidents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="select w-40"
          >
            <option value="">All Status</option>
            <option value="Open">Open</option>
            <option value="Pending">Pending</option>
            <option value="Resolved">Resolved</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="select w-48"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : filteredIncidents.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr className="hide-mobile">
                  <th>ID</th>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Violation</th>
                  <th className="hide-mobile">Location</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.map((incident) => (
                  <tr key={incident.id} className="md:table-row block md:table-row">
                    <td className="font-mono text-sm">{incident.incident_id}</td>
                    <td>{incident.date}</td>
                    <td>{incident.last_name}, {incident.first_name}</td>
                    <td>
                      <span className="text-sm">{incident.violation_type}</span>
                      <span className="text-xs text-gray-400 ml-1 hide-mobile">({incident.category})</span>
                    </td>
                    <td className="hide-mobile">{incident.location || '-'}</td>
                    <td>
                      <span className={`badge ${getStatusColor(incident.status)}`}>
                        {incident.status}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          setViewIncident(incident);
                          setContactData({
                            parent_contacted: incident.parent_contacted || 'No',
                            contact_date: incident.contact_date || '',
                          });
                          setShowViewModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-2" />
            <p>No incidents found</p>
            <button onClick={openModal} className="btn btn-primary mt-4">
              <Plus className="w-5 h-5" />
              Record First Incident
            </button>
          </div>
        )}
      </div>

      {/* New Incident Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Discipline Incident</h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Time</label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <select
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="select"
                  >
                    <option value="">Select</option>
                    <option value="Classroom">Classroom</option>
                    <option value="Hallway">Hallway</option>
                    <option value="Cafeteria">Cafeteria</option>
                    <option value="Gym">Gym</option>
                    <option value="Bathroom">Bathroom</option>
                    <option value="Parking Lot">Parking Lot</option>
                    <option value="Bus">Bus</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div ref={studentRef} className="relative">
                  <label className="form-label">Student *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => {
                        setStudentSearch(e.target.value);
                        setShowStudentDropdown(true);
                      }}
                      onFocus={() => setShowStudentDropdown(true)}
                      placeholder="Search student..."
                      className="input pr-8"
                      required
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {showStudentDropdown && filteredStudentsForSelect.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredStudentsForSelect.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, student_id: s.id });
                            setStudentSearch(`${s.last_name}, ${s.first_name}`);
                            setShowStudentDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                        >
                          {s.last_name}, {s.first_name} <span className="text-gray-400">({s.student_id})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showStudentDropdown && studentSearch && filteredStudentsForSelect.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500">
                      No students found
                    </div>
                  )}
                </div>
                <div ref={violationRef} className="relative">
                  <label className="form-label">Violation Type *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={violationSearch}
                      onChange={(e) => {
                        setViolationSearch(e.target.value);
                        setShowViolationDropdown(true);
                      }}
                      onFocus={() => setShowViolationDropdown(true)}
                      placeholder="Search violation..."
                      className="input pr-8"
                      required
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {showViolationDropdown && filteredViolationsForSelect.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {categories.map(cat => {
                        const catViolations = filteredViolationsForSelect.filter(v => v.category === cat);
                        if (catViolations.length === 0) return null;
                        return (
                          <div key={cat}>
                            <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">{cat}</div>
                            {catViolations.map(v => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, violation_id: v.id });
                                  setViolationSearch(v.violation_type);
                                  setShowViolationDropdown(false);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                              >
                                {v.violation_type}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {showViolationDropdown && violationSearch && filteredViolationsForSelect.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500">
                      No violations found
                    </div>
                  )}
                </div>
              </div>

              {filteredViolations.length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg text-sm">
                  <p><strong>Default Consequence:</strong> {filteredViolations[0].default_consequence}</p>
                  <p><strong>Max OSS:</strong> {filteredViolations[0].max_oss_days} days</p>
                </div>
              )}

              <div>
                <label className="form-label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input min-h-[80px]"
                  placeholder="Describe what happened..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div ref={witnessRef} className="relative">
                  <label className="form-label">Witness(es)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={witnessSearch}
                      onChange={(e) => {
                        setWitnessSearch(e.target.value);
                        setShowWitnessDropdown(true);
                      }}
                      onFocus={() => setShowWitnessDropdown(true)}
                      placeholder="Search witnesses..."
                      className="input pr-8"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {showWitnessDropdown && filteredWitnesses.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredWitnesses.map(w => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => {
                            const current = formData.witnesses ? formData.witnesses.split(',').map(x => x.trim()) : [];
                            if (current.includes(w)) {
                              setFormData({ ...formData, witnesses: current.filter(x => x !== w).join(', ') });
                            } else {
                              setFormData({ ...formData, witnesses: [...current, w].join(', ') });
                            }
                            setWitnessSearch('');
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center justify-between ${
                            (formData.witnesses || '').split(',').map(x => x.trim()).includes(w) ? 'bg-blue-50' : ''
                          }`}
                        >
                          {w}
                          {(formData.witnesses || '').split(',').map(x => x.trim()).includes(w) && (
                            <Check className="w-4 h-4 text-blue-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedWitnesses.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedWitnesses.map(w => (
                        <span key={w} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                          {w}
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, witnesses: selectedWitnesses.filter(x => x !== w).join(', ') });
                            }}
                            className="hover:text-blue-900"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div ref={advisorRef} className="relative">
                  <label className="form-label">Advisor</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={advisorSearch}
                      onChange={(e) => {
                        setAdvisorSearch(e.target.value);
                        setShowAdvisorDropdown(true);
                      }}
                      onFocus={() => setShowAdvisorDropdown(true)}
                      placeholder="Search advisor..."
                      className="input pr-8"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {showAdvisorDropdown && filteredAdvisors.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredAdvisors.map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, advisor: a });
                            setAdvisorSearch('');
                            setShowAdvisorDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center justify-between ${
                            formData.advisor === a ? 'bg-blue-50' : ''
                          }`}
                        >
                          {a}
                          {formData.advisor === a && (
                            <Check className="w-4 h-4 text-blue-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {formData.advisor && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                        {formData.advisor}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, advisor: '' })}
                          className="hover:text-purple-900"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="form-label">Action Taken</label>
                  <select
                    value={formData.action_taken}
                    onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })}
                    className="select"
                  >
                    <option value="">Select Action</option>
                    <option value="Warning">Warning</option>
                    <option value="Parent Call">Parent Call</option>
                    <option value="Detention">Detention</option>
                    <option value="Saturday School">Saturday School</option>
                    <option value="ISS">ISS</option>
                    <option value="OSS">OSS</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input min-h-[60px]"
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex justify-end gap-6 pt-4">
                <button type="button" onClick={closeModal} className="btn btn-danger">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <Loader className="w-5 h-5 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Record Incident'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Incident Modal */}
      {showViewModal && viewIncident && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Incident {viewIncident.incident_id}</h2>
                <p className="text-sm text-gray-500">{viewIncident.date} at {viewIncident.time || 'N/A'}</p>
              </div>
              <span className={`badge ${getStatusColor(viewIncident.status)}`}>
                {viewIncident.status}
              </span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Student</p>
                  <p className="font-medium">{viewIncident.last_name}, {viewIncident.first_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Violation</p>
                  <p className="font-medium">{viewIncident.violation_type}</p>
                  <p className="text-xs text-gray-400">{viewIncident.category}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="">{viewIncident.description || 'No description'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p>{viewIncident.location || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Witnesses</p>
                  <p>{viewIncident.witnesses || '-'}</p>
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Action Taken</p>
                    <p>{viewIncident.action_taken || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Consequence</p>
                    <p>{viewIncident.consequence || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Parent Contact Section */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Parent Contact</p>
                <div className="flex items-center gap-2 mb-2">
                  <select
                    value={contactData.parent_contacted}
                    onChange={async (e) => {
                      const newStatus = e.target.value;
                      const newDate = newStatus === 'Yes' ? new Date().toISOString().split('T')[0] : '';
                      setContactData({ parent_contacted: newStatus, contact_date: newDate });
                      try {
                        await api.put(`/incidents/${viewIncident.id}`, {
                          parent_contacted: newStatus,
                          contact_date: newDate || null,
                        });
                        loadData();
                      } catch (error) {
                        console.error(error);
                      }
                    }}
                    className="select w-40"
                  >
                    <option value="No">Not Contacted</option>
                    <option value="Yes">Contacted</option>
                  </select>
                  {contactData.parent_contacted === 'Yes' && (
                    <input
                      type="date"
                      value={contactData.contact_date}
                      onChange={async (e) => {
                        const newDate = e.target.value;
                        setContactData({ ...contactData, contact_date: newDate });
                        try {
                          await api.put(`/incidents/${viewIncident.id}`, {
                            contact_date: newDate,
                          });
                          loadData();
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      className="input w-40"
                    />
                  )}
                </div>
                <p className="text-sm">
                  Status: <span className={viewIncident.parent_contacted === 'Yes' ? 'text-green-600' : 'text-gray-400'}>
                    {viewIncident.parent_contacted === 'Yes' ? `Contacted on ${viewIncident.contact_date}` : 'Not contacted'}
                  </span>
                </p>
              </div>

              {/* Status Update */}
              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-sm font-medium mr-3">Update Status:</span>
                <div className="flex items-center gap-3">
                  {viewIncident.status !== 'Resolved' && (
                    <>
                      <button
                        onClick={() => handleStatusUpdate(viewIncident.id, 'Pending')}
                        className="btn bg-yellow-100 text-yellow-700 hover:bg-yellow-200 text-sm py-1.5 px-3"
                      >
                        <Clock className="w-3.5 h-3.5" /> Pending
                      </button>
                      <button
                        onClick={() => handleStatusUpdate(viewIncident.id, 'Resolved')}
                        className="btn btn-success text-sm py-1.5 px-3"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Resolved
                      </button>
                    </>
                  )}
                  {viewIncident.status === 'Resolved' && (
                    <>
                      <button
                        onClick={() => handleStatusUpdate(viewIncident.id, 'Open')}
                        className="btn btn-warning text-sm py-1.5 px-3"
                      >
                        <AlertCircle className="w-3.5 h-3.5" /> Reopen
                      </button>
                      <span className="text-green-600 text-xs ml-2">Resolved {viewIncident.resolved_date}</span>
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this incident?')) {
                        handleDelete(viewIncident.id);
                      }
                    }}
                    className="btn btn-danger text-sm py-1.5 px-3 ml-4"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                  <button onClick={() => setShowViewModal(false)} className="btn btn-secondary text-sm py-1.5 px-3">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}