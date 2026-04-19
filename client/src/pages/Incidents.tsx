import { useState, useEffect } from 'react';
import { Plus, Search, X, AlertCircle, Phone, CheckCircle, Clock } from 'lucide-react';
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

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '',
    student_id: '' as string | number,
    violation_id: '' as string | number,
    location: '',
    description: '',
    witnesses: '',
    action_taken: '',
    consequence: '',
    notes: '',
  });

  const [contactData, setContactData] = useState({
    parent_contacted: 'No',
    contact_date: '',
  });

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
    try {
      await api.post('/incidents', {
        ...formData,
        student_id: Number(formData.student_id),
        violation_id: Number(formData.violation_id),
      });
      loadData();
      closeModal();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error creating incident');
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
    setFormData({
      date: new Date().toISOString().split('T')[0],
      time: '',
      student_id: '',
      violation_id: '',
      location: '',
      description: '',
      witnesses: '',
      action_taken: '',
      consequence: '',
      notes: '',
    });
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
          <p className="text-gray-500">Record and manage discipline incidents</p>
        </div>
        <button onClick={openModal} className="btn btn-primary">
          <Plus className="w-5 h-5" />
          New Incident
        </button>
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
      <div className="card">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : filteredIncidents.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Student</th>
                <th>Violation</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncidents.map((incident) => (
                <tr key={incident.id}>
                  <td className="font-mono text-sm">{incident.incident_id}</td>
                  <td>{incident.date}</td>
                  <td>{incident.last_name}, {incident.first_name}</td>
                  <td>
                    <span className="text-sm">{incident.violation_type}</span>
                    <span className="text-xs text-gray-400 ml-1">({incident.category})</span>
                  </td>
                  <td>{incident.location || '-'}</td>
                  <td>
                    <span className={`badge ${getStatusColor(incident.status)}`}>
                      {incident.status}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => { setViewIncident(incident); setShowViewModal(true); }}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                        {s.last_name}, {s.first_name} ({s.student_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Violation Type *</label>
                  <select
                    value={formData.violation_id}
                    onChange={(e) => setFormData({ ...formData, violation_id: e.target.value })}
                    className="select"
                    required
                  >
                    <option value="">Select Violation</option>
                    {categories.map(cat => (
                      <optgroup key={cat} label={cat}>
                        {violations.filter(v => v.category === cat).map(v => (
                          <option key={v.id} value={v.id}>
                            {v.violation_type}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {filteredViolations.length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg text-sm">
                  <p><strong>Default Consequence:</strong> {filteredViolations[0].default_consequence}</p>
                  <p><strong>Points Deduction:</strong> {filteredViolations[0].points_deduction}</p>
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
                <div>
                  <label className="form-label">Witness(es)</label>
                  <input
                    type="text"
                    value={formData.witnesses}
                    onChange={(e) => setFormData({ ...formData, witnesses: e.target.value })}
                    className="input"
                    placeholder="Names of witnesses"
                  />
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

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={closeModal} className="btn bg-gray-100 text-gray-700">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Record Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Incident Modal */}
      {showViewModal && viewIncident && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p>{viewIncident.location || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Witnesses</p>
                  <p>{viewIncident.witnesses || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Points Deducted</p>
                  <p className="text-red-600 font-medium">{viewIncident.points_deducted}</p>
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
                    onChange={(e) => setContactData({ ...contactData, parent_contacted: e.target.value })}
                    className="select w-32"
                  >
                    <option value="No">Not Contacted</option>
                    <option value="Yes">Contacted</option>
                  </select>
                  <input
                    type="date"
                    value={contactData.contact_date}
                    onChange={(e) => setContactData({ ...contactData, contact_date: e.target.value })}
                    className="input w-40"
                  />
                  <button
                    onClick={() => handleParentContact(viewIncident.id)}
                    className="btn btn-primary"
                  >
                    <Phone className="w-4 h-4" />
                    Save
                  </button>
                </div>
                <p className="text-sm">
                  Status: <span className={viewIncident.parent_contacted === 'Yes' ? 'text-green-600' : 'text-gray-400'}>
                    {viewIncident.parent_contacted === 'Yes' ? `Contacted on ${viewIncident.contact_date}` : 'Not contacted'}
                  </span>
                </p>
              </div>

              {/* Status Update */}
              <div className="flex items-center justify-between border-t pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Update Status:</span>
                  {viewIncident.status !== 'Resolved' && (
                    <>
                      <button
                        onClick={() => handleStatusUpdate(viewIncident.id, 'Pending')}
                        className="btn bg-yellow-100 text-yellow-700"
                      >
                        <Clock className="w-4 h-4" /> Pending
                      </button>
                      <button
                        onClick={() => handleStatusUpdate(viewIncident.id, 'Resolved')}
                        className="btn btn-success"
                      >
                        <CheckCircle className="w-4 h-4" /> Resolved
                      </button>
                    </>
                  )}
                  {viewIncident.status === 'Resolved' && (
                    <span className="text-green-600">Resolved on {viewIncident.resolved_date}</span>
                  )}
                </div>
                <button onClick={() => setShowViewModal(false)} className="btn bg-gray-100 text-gray-700">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}