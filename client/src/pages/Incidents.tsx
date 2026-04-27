import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, X, AlertCircle, CheckCircle, Clock, Loader, Check, Trash2, ChevronLeft, ChevronRight, Download, FileText, Calendar } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../lib/api';
import * as XLSX from 'xlsx';

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
  grade: string;
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
  time: string | null;
  student_id: number;
  student_id_raw: string;
  last_name: string;
  first_name: string;
  grade?: string;
  violation_id: number;
  category: string;
  violation_type: string;
  location: string | null;
  description: string | null;
  witnesses: string | null;
  advisor: string | null;
  parent_contacted: string;
  contact_date: string | null;
  action_taken: string | null;
  consequence: string | null;
  points_deducted: number;
  days_iss: number;
  days_oss: number;
  detention_hours: number;
  notes: string | null;
  follow_up_needed: string;
  status: string;
  resolved_date: string | null;
  reported_by?: string;
}

interface UserType {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
}

type SortField = 'incident_id' | 'date' | 'last_name' | 'category' | 'status' | 'advisor';
type SortDirection = 'asc' | 'desc';

const DATE_PRESETS = [
  { label: 'Today', getValue: () => { const d = new Date(); return { start: d.toISOString().split('T')[0], end: d.toISOString().split('T')[0] }; } },
  { label: 'This Week', getValue: () => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); const start = new Date(d.setDate(diff)); return { start: start.toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] }; } },
  { label: 'This Month', getValue: () => { const d = new Date(); return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, end: new Date().toISOString().split('T')[0] }; } },
  { label: 'All Time', getValue: () => { return { start: '', end: '' }; } },
];

const LOCATION_OPTIONS = ['Classroom', 'Hallway', 'Cafeteria', 'Playground', 'Gym', 'Bathroom', 'Front Office', 'Parking Lot', 'Bus', 'Other'];
const CONSEQUENCE_OPTIONS = ['Warning', 'Parent Call', 'Detention', 'Saturday School', 'ISS', 'OSS', 'Expulsion'];

export default function Incidents() {
  const navigate = useNavigate();
  const location = useLocation();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [datePreset, setDatePreset] = useState('This Month');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '',
    student_id: '' as string | number,
    violation_id: '' as string | number,
    location: '',
    description: '',
    witnesses: '',
    reported_by: '',
    advisor: '',
    action_taken: '',
    consequence: '',
    notes: '',
    follow_up_needed: 'No',
    follow_up_date: '',
    parent_contacted: 'No',
    contact_date: '',
  });

  const [studentSearch, setStudentSearch] = useState('');
  const [violationSearch, setViolationSearch] = useState('');
  const [advisorSearch, setAdvisorSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [showViolationDropdown, setShowViolationDropdown] = useState(false);
  const [showAdvisorDropdown, setShowAdvisorDropdown] = useState(false);
  const studentRef = useRef<HTMLDivElement>(null);
  const violationRef = useRef<HTMLDivElement>(null);
  const advisorRef = useRef<HTMLDivElement>(null);

  const prefillData = location.state as { studentId?: number; violationCategory?: string } | null;
  const pageSize = 20;

  const filteredStudentsForSelect = students.filter(s =>
    !studentSearch || s.last_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.first_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.student_id.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const filteredViolationsForSelect = violations.filter(v =>
    !violationSearch || v.violation_type.toLowerCase().includes(violationSearch.toLowerCase()) ||
    v.category.toLowerCase().includes(violationSearch.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (studentRef.current && !studentRef.current.contains(event.target as Node)) setShowStudentDropdown(false);
      if (violationRef.current && !violationRef.current.contains(event.target as Node)) setShowViolationDropdown(false);
      if (advisorRef.current && !advisorRef.current.contains(event.target as Node)) setShowAdvisorDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      const [incidentsRes, studentsRes, violationsRes, categoriesRes, usersRes] = await Promise.all([
        api.get('/incidents'),
        api.get('/students'),
        api.get('/violations'),
        api.get('/violations/categories'),
        api.get('/users'),
      ]);
      setIncidents(incidentsRes.data);
      setStudents(studentsRes.data);
      setViolations(violationsRes.data);
      setCategories(categoriesRes.data);
      setUsers(usersRes.data);

      if (prefillData?.studentId) {
        const student = studentsRes.data.find((s: Student) => s.id === prefillData.studentId);
        if (student) {
          setFormData(prev => ({ ...prev, student_id: student.id }));
          setStudentSearch(`${student.last_name}, ${student.first_name}`);
        }
      }
      if (prefillData?.violationCategory) {
        const violation = violationsRes.data.find((v: Violation) => v.category === prefillData.violationCategory);
        if (violation) {
          setFormData(prev => ({ ...prev, violation_id: violation.id }));
          setViolationSearch(violation.violation_type);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const getDateRange = () => {
    if (datePreset === 'Custom') return { start: customDateStart, end: customDateEnd };
    const preset = DATE_PRESETS.find(p => p.label === datePreset);
    return preset ? preset.getValue() : { start: '', end: '' };
  };

  const openIncidentsCount = useMemo(() => incidents.filter(i => i.status === 'Open' || i.status === 'Pending').length, [incidents]);

  const processedIncidents = useMemo(() => {
    const dateRange = getDateRange();
    let result = [...incidents];

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(i =>
        i.incident_id.toLowerCase().includes(s) || i.last_name.toLowerCase().includes(s) ||
        i.first_name.toLowerCase().includes(s) || (i.violation_type && i.violation_type.toLowerCase().includes(s))
      );
    }
    if (filterStatus) result = result.filter(i => i.status === filterStatus);
    if (filterCategory) result = result.filter(i => i.category === filterCategory);
    if (filterGrade) {
      result = result.filter(i => {
        const student = students.find(s => s.id === i.student_id);
        return student?.grade === filterGrade;
      });
    }
    if (dateRange.start) result = result.filter(i => i.date >= dateRange.start);
    if (dateRange.end) result = result.filter(i => i.date <= dateRange.end);

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'incident_id': cmp = a.incident_id.localeCompare(b.incident_id); break;
        case 'date': cmp = a.date.localeCompare(b.date); break;
        case 'last_name': cmp = (a.last_name || '').localeCompare(b.last_name || ''); break;
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break;
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break;
        case 'advisor': cmp = (a.advisor || '').localeCompare(b.advisor || ''); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [incidents, search, filterStatus, filterCategory, filterGrade, datePreset, customDateStart, customDateEnd, sortField, sortDirection, students]);

  const totalPages = Math.ceil(processedIncidents.length / pageSize);
  const paginatedIncidents = processedIncidents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  };

  const filteredViolations = formData.violation_id ? violations.filter(v => v.id === Number(formData.violation_id)) : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'badge-danger';
      case 'Pending': return 'badge-warning';
      case 'Resolved': return 'badge-success';
      default: return 'badge-info';
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="text-gray-400 ml-1 text-xs">↕</span>;
    return sortDirection === 'asc' ? <span className="text-blue-600 ml-1 text-xs">↑</span> : <span className="text-blue-600 ml-1 text-xs">↓</span>;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/incidents', {
        ...formData,
        student_id: Number(formData.student_id),
        violation_id: Number(formData.violation_id),
        follow_up_needed: formData.follow_up_needed,
        follow_up_date: formData.follow_up_needed === 'Yes' ? formData.follow_up_date : null,
        parent_contacted: formData.parent_contacted,
        contact_date: formData.parent_contacted === 'Yes' ? formData.contact_date : null,
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

  const openModal = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    setFormData({
      date: new Date().toISOString().split('T')[0],
      time: `${hours}:${minutes}`,
      student_id: prefillData?.studentId || '',
      violation_id: '',
      location: '',
      description: '',
      witnesses: '',
      reported_by: '',
      advisor: '',
      action_taken: '',
      consequence: '',
      notes: '',
      follow_up_needed: 'No',
      follow_up_date: '',
      parent_contacted: 'No',
      contact_date: '',
    });
    if (prefillData?.studentId) {
      const student = students.find(s => s.id === prefillData.studentId);
      if (student) setStudentSearch(`${student.last_name}, ${student.first_name}`);
    }
    setViolationSearch('');
    setAdvisorSearch('');
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const openIncidentDetail = (incident: Incident) => navigate(`/incidents/${incident.id}`);

  const handleExportExcel = () => {
    const data = processedIncidents.map(i => ({
      'Incident ID': i.incident_id,
      'Date': i.date,
      'Time': i.time || '',
      'Student': `${i.last_name}, ${i.first_name}`,
      'Grade': students.find(s => s.id === i.student_id)?.grade || '',
      'Category': i.category,
      'Violation': i.violation_type,
      'Location': i.location || '',
      'Status': i.status,
      'Assigned To': i.advisor || '',
      'Reported By': i.reported_by || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Incidents');
    XLSX.writeFile(wb, `incidents_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
            {openIncidentsCount > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                <AlertCircle className="w-4 h-4" />
                {openIncidentsCount} Open
              </span>
            )}
          </div>
          <p className="text-gray-500">Record and manage discipline incidents</p>
        </div>
        <div className="flex gap-2">
          {saved && (
            <span className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-xl">
              <Check className="w-5 h-5" /><span className="font-medium">Saved!</span>
            </span>
          )}
          <button onClick={handleExportExcel} className="btn btn-secondary">
            <Download className="w-5 h-5" />Export
          </button>
          <button onClick={openModal} className="btn btn-primary">
            <Plus className="w-5 h-5" />New Incident
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" placeholder="Search incidents..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="input pl-12" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {DATE_PRESETS.map(preset => (
                <button key={preset.label} onClick={() => { setDatePreset(preset.label); setCurrentPage(1); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${datePreset === preset.label ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {preset.label}
                </button>
              ))}
              <button onClick={() => setDatePreset('Custom')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${datePreset === 'Custom' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Custom
              </button>
            </div>
          </div>
          {datePreset === 'Custom' && (
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input type="date" value={customDateStart} onChange={(e) => { setCustomDateStart(e.target.value); setCurrentPage(1); }} className="input w-40" />
              </div>
              <span className="text-gray-400">to</span>
              <input type="date" value={customDateEnd} onChange={(e) => { setCustomDateEnd(e.target.value); setCurrentPage(1); }} className="input w-40" />
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="select w-40">
              <option value="">All Status</option>
              <option value="Open">Open</option>
              <option value="Pending">Pending</option>
              <option value="Resolved">Resolved</option>
            </select>
            <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }} className="select w-48">
              <option value="">All Categories</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <select value={filterGrade} onChange={(e) => { setFilterGrade(e.target.value); setCurrentPage(1); }} className="select w-32">
              <option value="">All Grades</option>
              {[6, 7, 8, 9, 10, 11, 12].map(g => <option key={g} value={`${g}`}>Grade {g}</option>)}
            </select>
            {(search || filterStatus || filterCategory || filterGrade || datePreset !== 'This Month') && (
              <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterCategory(''); setFilterGrade(''); setDatePreset('This Month'); setCurrentPage(1); }} className="btn btn-secondary">
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pagination Info */}
      <div className="flex items-center justify-between px-2">
        <p className="text-sm text-gray-500">
          Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, processedIncidents.length)} of {processedIncidents.length} incidents
        </p>
      </div>

      {/* Incidents Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : paginatedIncidents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('incident_id')}>ID {getSortIcon('incident_id')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('date')}>Date {getSortIcon('date')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile" onClick={() => handleSort('last_name')}>Student {getSortIcon('last_name')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile" onClick={() => handleSort('category')}>Category {getSortIcon('category')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>Status {getSortIcon('status')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile" onClick={() => handleSort('advisor')}>Assigned To {getSortIcon('advisor')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedIncidents.map((incident) => (
                  <tr key={incident.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openIncidentDetail(incident)}>
                    <td className="px-4 py-3 font-mono text-sm">{incident.incident_id}</td>
                    <td className="px-4 py-3">{incident.date}</td>
                    <td className="px-4 py-3 hide-mobile">
                      <div><p className="font-medium">{incident.last_name}, {incident.first_name}</p></div>
                    </td>
                    <td className="px-4 py-3 hide-mobile">
                      <span className="text-sm">{incident.violation_type}</span>
                      <span className="text-xs text-gray-400 ml-1">({incident.category})</span>
                    </td>
                    <td className="px-4 py-3 hide-mobile text-sm">{incident.location || '-'}</td>
                    <td className="px-4 py-3"><span className={`badge ${getStatusColor(incident.status)}`}>{incident.status}</span></td>
                    <td className="px-4 py-3 hide-mobile text-sm">{incident.advisor || '-'}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openIncidentDetail(incident)} className="text-blue-600 hover:text-blue-700 text-sm font-medium">View</button>
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
            <button onClick={openModal} className="btn btn-primary mt-4"><Plus className="w-5 h-5" />Record First Incident</button>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pb-4">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="btn btn-secondary py-2 px-3 disabled:opacity-50">First</button>
          <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="btn btn-secondary py-2 px-3 disabled:opacity-50"><ChevronLeft className="w-4 h-4 mr-1" />Prev</button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i;
              return (
                <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                  className={`w-10 h-10 rounded-lg font-medium ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} className="btn btn-secondary py-2 px-3 disabled:opacity-50">Next<ChevronRight className="w-4 h-4 ml-1" /></button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages} className="btn btn-secondary py-2 px-3 disabled:opacity-50">Last</button>
        </div>
      )}

      {/* New Incident Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Discipline Incident</h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="input" required />
                </div>
                <div>
                  <label className="form-label">Time</label>
                  <input type="time" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <select value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="select">
                    <option value="">Select</option>
                    {LOCATION_OPTIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div ref={studentRef} className="relative">
                  <label className="form-label">Student *</label>
                  <div className="relative">
                    <input type="text" value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setShowStudentDropdown(true); }} onFocus={() => setShowStudentDropdown(true)} placeholder="Search student..." className="input pr-8" required />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {showStudentDropdown && filteredStudentsForSelect.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredStudentsForSelect.map(s => (
                        <button key={s.id} type="button" onClick={() => { setFormData({ ...formData, student_id: s.id }); setStudentSearch(`${s.last_name}, ${s.first_name}`); setShowStudentDropdown(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">
                          {s.last_name}, {s.first_name} <span className="text-gray-400">({s.student_id})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div ref={violationRef} className="relative">
                  <label className="form-label">Violation Type *</label>
                  <div className="relative">
                    <input type="text" value={violationSearch} onChange={(e) => { setViolationSearch(e.target.value); setShowViolationDropdown(true); }} onFocus={() => setShowViolationDropdown(true)} placeholder="Search violation..." className="input pr-10" required />
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
                              <button key={v.id} type="button" onClick={() => { setFormData({ ...formData, violation_id: v.id }); setViolationSearch(v.violation_type); setShowViolationDropdown(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">{v.violation_type}</button>
                            ))}
                          </div>
                        );
                      })}
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
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input min-h-[80px]" placeholder="Describe what happened..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Reported By</label>
                  <select value={formData.reported_by} onChange={(e) => setFormData({ ...formData, reported_by: e.target.value })} className="select">
                    <option value="">Select staff...</option>
                    {users.map(u => <option key={u.id} value={`${u.first_name} ${u.last_name}`}>{u.first_name} {u.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Witness(es)</label>
                  <input type="text" value={formData.witnesses} onChange={(e) => setFormData({ ...formData, witnesses: e.target.value })} className="input" placeholder="Names of witnesses..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div ref={advisorRef} className="relative">
                  <label className="form-label">Assigned To (Advisor)</label>
                  <div className="relative">
                    <input type="text" value={advisorSearch} onChange={(e) => { setAdvisorSearch(e.target.value); setShowAdvisorDropdown(true); }} onFocus={() => setShowAdvisorDropdown(true)} placeholder="Search advisor..." className="input pr-8" />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {showAdvisorDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {users.map(u => (
                        <button key={u.id} type="button" onClick={() => { setFormData({ ...formData, advisor: `${u.first_name} ${u.last_name}` }); setAdvisorSearch(`${u.first_name} ${u.last_name}`); setShowAdvisorDropdown(false); }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center justify-between">
                          <span>{u.first_name} {u.last_name}</span>
                          {formData.advisor === `${u.first_name} ${u.last_name}` && <Check className="w-4 h-4 text-blue-500" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="form-label">Action Taken</label>
                  <select value={formData.action_taken} onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })} className="select">
                    <option value="">Select Action</option>
                    {CONSEQUENCE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-yellow-50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.follow_up_needed === 'Yes'} onChange={(e) => setFormData({ ...formData, follow_up_needed: e.target.checked ? 'Yes' : 'No' })} className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium">Follow-up Required</span>
                </label>
                {formData.follow_up_needed === 'Yes' && (
                  <div className="mt-2">
                    <input type="date" value={formData.follow_up_date} onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })} className="input" />
                  </div>
                )}
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.parent_contacted === 'Yes'} onChange={(e) => setFormData({ ...formData, parent_contacted: e.target.checked ? 'Yes' : 'No' })} className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium">Parent Notified?</span>
                </label>
                {formData.parent_contacted === 'Yes' && (
                  <div className="mt-2">
                    <input type="date" value={formData.contact_date} onChange={(e) => setFormData({ ...formData, contact_date: e.target.value })} className="input" />
                  </div>
                )}
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input min-h-[60px]" placeholder="Additional notes..." />
              </div>

              <div className="flex justify-end gap-6 pt-4">
                <button type="button" onClick={closeModal} className="btn btn-danger">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? <span className="flex items-center gap-2"><Loader className="w-5 h-5 animate-spin" />Saving...</span> : 'Record Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}