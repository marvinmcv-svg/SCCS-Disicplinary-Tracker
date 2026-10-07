import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, X, AlertCircle, CheckCircle, Clock, Loader, Check, Trash2, ChevronLeft, ChevronRight, Download, FileText, Calendar } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useI18n } from '../i18n';
import * as XLSX from 'xlsx';
import SupportAlert from '../components/SupportAlert';

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

// PlusPortals (SIS) discipline code — penalty / action / served / location sets.
interface PpCode {
  id: number;
  group: string;
  code: string;
  name: string;
  description: string | null;
  detention_hours: number;
  days_iss: number;
  days_oss: number;
  active: boolean;
  sort_order: number;
}

// Fallbacks used when /api/codes is unreachable (e.g. offline PWA): the
// seed's location set, expressed as plain values so old rows still resolve.
const FALLBACK_LOCATION_VALUES = [
  'CLS — Classroom', 'HALL — Hallway', 'CAFE — Cafeteria', 'PLAY — Playground',
  'GYM — Gymnasium', 'REST — Restroom', 'LIB — Library', 'BUS — School Bus',
  'GRDS — Campus Grounds', 'PARK — Parking Lot', 'OTHER — Other',
];

/** "DET — Detention" → "DET" (code) — null when the value has no code part. */
const codePart = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const idx = value.indexOf(' — ');
  return idx > 0 ? value.slice(0, idx) : null;
};

/** "DET — Detention" → "Detention" (name) — the whole value when no code part. */
const namePart = (value: string | null | undefined): string => {
  if (!value) return '';
  const idx = value.indexOf(' — ');
  return idx > 0 ? value.slice(idx + 3) : value;
};

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
  penalty: string | null;
  penalty_served: string | null;
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
  { label: 'This Quarter', getValue: () => { const d = new Date(); const quarter = Math.floor(d.getMonth() / 3); const startMonth = quarter * 3; const start = new Date(d.getFullYear(), startMonth, 1); return { start: start.toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] }; } },
  { label: 'All Time', getValue: () => { return { start: '', end: '' }; } },
];

export default function Incidents() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  // PlusPortals SIS code sets (penalty / action / served / location).
  const [ppCodes, setPpCodes] = useState<Record<string, PpCode[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [datePreset, setDatePreset] = useState('All Time');
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
    penalty: '',
    penalty_served: '',
    detention_hours: 0,
    days_iss: 0,
    days_oss: 0,
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

  const prefillData = location.state as { studentId?: number; violationCategory?: string; openNew?: boolean } | null;
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

  // The PlusPortals (SIS) discipline-code group is listed FIRST in the
  // new-incident picker — those are the codes staff enter when logging the
  // same referral in PlusPortals, so they lead the list.
  const violationCategoriesForSelect = useMemo(() => {
    const cats = [...categories];
    const pp = cats.indexOf('PlusPortals');
    if (pp > 0) {
      cats.splice(pp, 1);
      cats.unshift('PlusPortals');
    }
    return cats;
  }, [categories]);

  // SIS code options for the pickers (active codes first; API failure falls
  // back to the seeded location values so the form stays usable).
  const locationOptions = useMemo(() => {
    const list = (ppCodes.location ?? []).filter(c => c.active);
    if (list.length > 0) return list.map(c => `${c.code} — ${c.name}`);
    return FALLBACK_LOCATION_VALUES;
  }, [ppCodes]);

  const actionOptions = useMemo(() => {
    return (ppCodes.action ?? []).filter(c => c.active).map(c => `${c.code} — ${c.name}`);
  }, [ppCodes]);

  const penaltyOptions = useMemo(() => {
    return (ppCodes.penalty ?? []).filter(c => c.active);
  }, [ppCodes]);

  const servedOptions = useMemo(() => {
    return (ppCodes.served ?? []).filter(c => c.active).map(c => `${c.code} — ${c.name}`);
  }, [ppCodes]);

  // The selected penalty row (drives default quantities in the form).
  const selectedPenalty = useMemo(() => {
    if (!formData.penalty) return null;
    return penaltyOptions.find(c => `${c.code} — ${c.name}` === formData.penalty) ?? null;
  }, [formData.penalty, penaltyOptions]);

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
      // Resilient load: /users is admin-only, so for teacher/counselor/etc.
      // roles that call 403s. Promise.all would reject the WHOLE batch and
      // leave the violation picker empty — exactly what a teacher needs to
      // register an incident. Settle each call independently and fall back
      // to the logged-in user for the staff pickers when the list is
      // unavailable.
      const [incidentsRes, studentsRes, violationsRes, categoriesRes, usersRes, codesRes] = await Promise.allSettled([
        api.get('/incidents'),
        api.get('/students'),
        api.get('/violations'),
        api.get('/violations/categories'),
        api.get('/users'),
        api.get('/codes'),
      ]);
      if (incidentsRes.status === 'fulfilled') setIncidents(incidentsRes.value.data);
      if (studentsRes.status === 'fulfilled') setStudents(studentsRes.value.data);
      if (violationsRes.status === 'fulfilled') setViolations(violationsRes.value.data);
      if (categoriesRes.status === 'fulfilled') setCategories(categoriesRes.value.data);
      if (codesRes.status === 'fulfilled' && codesRes.value.data && typeof codesRes.value.data === 'object') {
        setPpCodes(codesRes.value.data);
      }
      if (usersRes.status === 'fulfilled') {
        setUsers(usersRes.value.data);
      } else {
        // /users is admin-only — fall back to the logged-in user so the
        // "Reported By" picker still works. Read fresh from localStorage:
        // App's auth-restore effect may not have run when loadData's closure
        // captured currentUser (null on first mount).
        try {
          const me = JSON.parse(localStorage.getItem('user') || 'null');
          if (me) {
            setUsers([{
              id: me.id,
              username: me.username,
              first_name: me.firstName ?? '',
              last_name: me.lastName ?? '',
              role: me.role,
            }]);
          }
        } catch { /* ignore malformed storage */ }
      }

      if (prefillData?.studentId && studentsRes.status === 'fulfilled') {
        const student = studentsRes.value.data.find((s: Student) => s.id === prefillData.studentId);
        if (student) {
          setFormData(prev => ({ ...prev, student_id: student.id }));
          setStudentSearch(`${student.last_name}, ${student.first_name}`);
        }
      }
      if (prefillData?.violationCategory && violationsRes.status === 'fulfilled') {
        const violation = violationsRes.value.data.find((v: Violation) => v.category === prefillData.violationCategory);
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

  useLiveRefresh(() => loadData());
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
        i.first_name.toLowerCase().includes(s) || (i.violation_type && i.violation_type.toLowerCase().includes(s)) ||
        (i.location || '').toLowerCase().includes(s) || (i.penalty || '').toLowerCase().includes(s)
      );
    }
    if (filterStatus) result = result.filter(i => i.status === filterStatus);
    if (filterCategory) result = result.filter(i => i.category === filterCategory);
    if (filterLocation) result = result.filter(i => (i.location || '') === filterLocation);
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
  }, [incidents, search, filterStatus, filterCategory, filterGrade, filterLocation, datePreset, customDateStart, customDateEnd, sortField, sortDirection, students]);

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
        penalty: formData.penalty || null,
        penalty_served: formData.penalty || formData.penalty_served ? (formData.penalty_served || 'PEND — Pending') : null,
        detention_hours: Number(formData.detention_hours) || 0,
        days_iss: Number(formData.days_iss) || 0,
        days_oss: Number(formData.days_oss) || 0,
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
      alert(error.response?.data?.error || t('Error creating incident'));
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
      penalty: '',
      penalty_served: '',
      detention_hours: 0,
      days_iss: 0,
      days_oss: 0,
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

  // Deep link: navigate('/incidents', { state: { openNew: true } }) opens the
  // new-incident form as soon as the pickers have loaded.
  const openedForKey = useRef<string | null>(null);
  useEffect(() => {
    if (!loading && prefillData?.openNew && openedForKey.current !== location.key) {
      openedForKey.current = location.key;
      openModal();
    }
  }, [loading, location.key]);

  // Selecting a PlusPortals penalty pre-fills the referral's quantities from
  // the code's defaults (still editable), mirrors the penalty name into the
  // consequence text and starts the served status at PENDING — exactly how
  // PlusPortals behaves when a penalty is added to a referral.
  const handlePenaltySelect = (value: string) => {
    if (!value) {
      setFormData(prev => ({ ...prev, penalty: '', penalty_served: '', detention_hours: 0, days_iss: 0, days_oss: 0 }));
      return;
    }
    const row = penaltyOptions.find(c => `${c.code} — ${c.name}` === value);
    setFormData(prev => ({
      ...prev,
      penalty: value,
      penalty_served: prev.penalty_served || 'PEND — Pending',
      detention_hours: row ? row.detention_hours : prev.detention_hours,
      days_iss: row ? row.days_iss : prev.days_iss,
      days_oss: row ? row.days_oss : prev.days_oss,
      consequence: prev.consequence || (row ? row.name : prev.consequence),
    }));
  };

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
      'Action': i.action_taken || '',
      'Penalty': i.penalty || '',
      'Served': i.penalty_served || '',
      'Detention Hours': i.detention_hours || 0,
      'ISS Days': i.days_iss || 0,
      'OSS Days': i.days_oss || 0,
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
            <h1 className="text-2xl font-bold text-gray-900">{t('Incidents')}</h1>
            {openIncidentsCount > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                <AlertCircle className="w-4 h-4" />
                {t('{count} Open', { count: openIncidentsCount })}
              </span>
            )}
          </div>
          <p className="text-gray-500">{t('Record and manage discipline incidents')}</p>
        </div>
        <div className="flex gap-2">
          {saved && (
            <span className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-xl">
              <Check className="w-5 h-5" /><span className="font-medium">{t('Saved!')}</span>
            </span>
          )}
          <button onClick={handleExportExcel} className="btn btn-secondary">
            <Download className="w-5 h-5" />{t('Export')}
          </button>
          <button onClick={openModal} className="btn btn-primary">
            <Plus className="w-5 h-5" />{t('New Incident')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" placeholder={t('Search incidents...')} value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="input pl-12" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {DATE_PRESETS.map(preset => (
                <button key={preset.label} onClick={() => { setDatePreset(preset.label); setCurrentPage(1); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${datePreset === preset.label ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {t(preset.label)}
                </button>
              ))}
              <button onClick={() => setDatePreset('Custom')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${datePreset === 'Custom' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t('Custom')}
              </button>
            </div>
          </div>
          {datePreset === 'Custom' && (
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input type="date" value={customDateStart} onChange={(e) => { setCustomDateStart(e.target.value); setCurrentPage(1); }} className="input w-40" />
              </div>
              <span className="text-gray-400">{t('to')}</span>
              <input type="date" value={customDateEnd} onChange={(e) => { setCustomDateEnd(e.target.value); setCurrentPage(1); }} className="input w-40" />
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="select w-40">
              <option value="">{t('All Status')}</option>
              <option value="Open">{t('Open')}</option>
              <option value="Pending">{t('Pending')}</option>
              <option value="Resolved">{t('Resolved')}</option>
            </select>
            <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }} className="select w-48">
              <option value="">{t('All Categories')}</option>
              {categories.map(cat => <option key={cat} value={cat}>{t(cat)}</option>)}
            </select>
            <select value={filterGrade} onChange={(e) => { setFilterGrade(e.target.value); setCurrentPage(1); }} className="select w-32">
              <option value="">{t('All Grades')}</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(g => <option key={g} value={`${g}`}>{g === 0 ? t('Pre-K/K') : t('Grade {grade}', { grade: g })}</option>)}
            </select>
            <select value={filterLocation} onChange={(e) => { setFilterLocation(e.target.value); setCurrentPage(1); }} className="select w-48">
              <option value="">{t('All Locations')}</option>
              {locationOptions.map(loc => <option key={loc} value={loc}>{t(loc)}</option>)}
            </select>
            {(search || filterStatus || filterCategory || filterGrade || filterLocation || datePreset !== 'All Time') && (
              <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterCategory(''); setFilterGrade(''); setFilterLocation(''); setDatePreset('All Time'); setCurrentPage(1); }} className="btn btn-secondary">
                {t('Clear Filters')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pagination Info */}
      <div className="flex items-center justify-between px-2">
        <p className="text-sm text-gray-500">
          {t('Showing {from}–{to} of {total} incidents', { from: (currentPage - 1) * pageSize + 1, to: Math.min(currentPage * pageSize, processedIncidents.length), total: processedIncidents.length })}
        </p>
      </div>

      {/* Incidents Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">{t('Loading...')}</div>
        ) : paginatedIncidents.length > 0 ? (
          <>
          {/* Phones: one card per incident, so student and violation are never hidden */}
          <ul className="md:hidden list-inset">
            {paginatedIncidents.map((incident) => (
              <li key={incident.id}>
                <button type="button" data-testid="incident-row" className="list-row !items-start !px-4" onClick={() => openIncidentDetail(incident)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-gray-900 leading-snug">{incident.last_name}, {incident.first_name}</p>
                      <span className={`badge shrink-0 ${getStatusColor(incident.status)}`}>{t(incident.status)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 leading-snug">
                      {t(incident.violation_type)} <span className="text-gray-500">· {t(incident.category)}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="tabular-nums">{incident.date}</span>
                      <span className="font-mono">{incident.incident_id}</span>
                      {incident.location && <span>{namePart(incident.location)}</span>}
                      {incident.advisor && <span>{incident.advisor}</span>}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('incident_id')}>{t('ID')} {getSortIcon('incident_id')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('date')}>{t('Date')} {getSortIcon('date')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile" onClick={() => handleSort('last_name')}>{t('Student')} {getSortIcon('last_name')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile" onClick={() => handleSort('category')}>{t('Category')} {getSortIcon('category')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">{t('Location')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>{t('Status')} {getSortIcon('status')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile" onClick={() => handleSort('advisor')}>{t('Assigned To')} {getSortIcon('advisor')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedIncidents.map((incident) => (
                  <tr key={incident.id} data-testid="incident-row" className="hover:bg-gray-50 cursor-pointer" onClick={() => openIncidentDetail(incident)}>
                    <td className="px-4 py-3 font-mono text-sm">{incident.incident_id}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{incident.date}</td>
                    <td className="px-4 py-3 hide-mobile">
                      <div><p className="font-medium">{incident.last_name}, {incident.first_name}</p></div>
                    </td>
                    <td className="px-4 py-3 hide-mobile">
                      <span className="text-sm">{t(incident.violation_type)}</span>
                      <span className="text-xs text-gray-400 ml-1">({t(incident.category)})</span>
                    </td>
                    <td className="px-4 py-3 hide-mobile text-sm">
                      {incident.location ? (
                        <span className="inline-flex items-center gap-1.5">
                          {codePart(incident.location) && (
                            <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">{codePart(incident.location)}</span>
                          )}
                          <span>{namePart(incident.location)}</span>
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3"><span className={`badge ${getStatusColor(incident.status)}`}>{t(incident.status)}</span></td>
                    <td className="px-4 py-3 hide-mobile text-sm">{incident.advisor || '-'}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openIncidentDetail(incident)} className="text-blue-600 hover:text-blue-700 text-sm font-medium">{t('View')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-2" />
            <p>{t('No incidents found')}</p>
            <button onClick={openModal} className="btn btn-primary mt-4"><Plus className="w-5 h-5" />{t('Record First Incident')}</button>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 pb-4">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="btn btn-secondary py-2 px-3 disabled:opacity-50 hidden sm:inline-flex">{t('First')}</button>
          <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="btn btn-secondary py-2 px-3 disabled:opacity-50"><ChevronLeft className="w-4 h-4 mr-1" />{t('Prev')}</button>
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
          <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} className="btn btn-secondary py-2 px-3 disabled:opacity-50">{t('Next')}<ChevronRight className="w-4 h-4 ml-1" /></button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages} className="btn btn-secondary py-2 px-3 disabled:opacity-50 hidden sm:inline-flex">{t('Last')}</button>
        </div>
      )}

      {/* New Incident Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('New Discipline Incident')}</h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">{t('Date *')}</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="input" required />
                </div>
                <div>
                  <label className="form-label">{t('Time')}</label>
                  <input type="time" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="form-label flex items-center gap-1.5">
                    {t('Location')}
                    <span className="text-[9px] font-bold tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">SIS</span>
                  </label>
                  <select value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="select">
                    <option value="">{t('Select')}</option>
                    {locationOptions.map(loc => <option key={loc} value={loc}>{t(loc)}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div ref={studentRef} className="relative">
                  <label className="form-label">{t('Student *')}</label>
                  <div className="relative">
                    <input type="text" value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setShowStudentDropdown(true); }} onFocus={() => setShowStudentDropdown(true)} placeholder={t('Search student...')} className="input pr-8" required />
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
                  <label className="form-label">{t('Violation Type *')}</label>
                  <div className="relative">
                    <input type="text" value={violationSearch} onChange={(e) => { setViolationSearch(e.target.value); setShowViolationDropdown(true); }} onFocus={() => setShowViolationDropdown(true)} placeholder={t('Search violation...')} className="input pr-10" required />
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                  {showViolationDropdown && filteredViolationsForSelect.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {violationCategoriesForSelect.map(cat => {
                        const catViolations = filteredViolationsForSelect.filter(v => v.category === cat);
                        if (catViolations.length === 0) return null;
                        const isPlusPortals = cat === 'PlusPortals';
                        return (
                          <div key={cat}>
                            <div className={isPlusPortals
                              ? 'px-3 py-1 text-xs font-semibold text-white bg-emerald-600 flex items-center justify-between sticky top-0'
                              : 'px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50'}>
                              <span>{t(cat)}</span>
                              {isPlusPortals && <span className="text-[10px] font-bold tracking-wide bg-white/25 rounded px-1.5 py-0.5">SIS CODES</span>}
                            </div>
                            {catViolations.map(v => {
                              const dashIdx = isPlusPortals ? v.violation_type.indexOf(' — ') : -1;
                              const ppCode = dashIdx > 0 ? v.violation_type.slice(0, dashIdx) : null;
                              return (
                                <button key={v.id} type="button" onClick={() => { setFormData({ ...formData, violation_id: v.id }); setViolationSearch(v.violation_type); setShowViolationDropdown(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                                  {ppCode && <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0">{ppCode}</span>}
                                  <span>{t(v.violation_type)}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <SupportAlert studentId={formData.student_id} />

              {filteredViolations.length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg text-sm">
                  <p><strong>{t('Default Consequence:')}</strong> {t(filteredViolations[0].default_consequence)}</p>
                  <p><strong>{t('Max OSS:')}</strong> {filteredViolations[0].max_oss_days} {t('days')}</p>
                </div>
              )}

              <div>
                <label className="form-label">{t('Description *')}</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input min-h-[80px]" placeholder={t('Describe what happened...')} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">{t('Reported By *')}</label>
                  <select value={formData.reported_by} onChange={(e) => setFormData({ ...formData, reported_by: e.target.value })} className="select" required>
                    <option value="">{t('Select staff...')}</option>
                    {users.map(u => <option key={u.id} value={`${u.first_name} ${u.last_name}`}>{u.first_name} {u.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">{t('Witness(es)')}</label>
                  <input type="text" value={formData.witnesses} onChange={(e) => setFormData({ ...formData, witnesses: e.target.value })} className="input" placeholder={t('Names of witnesses...')} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div ref={advisorRef} className="relative">
                  <label className="form-label">{t('Assigned To (Advisor)')}</label>
                  <div className="relative">
                    <input type="text" value={advisorSearch} onChange={(e) => { setAdvisorSearch(e.target.value); setShowAdvisorDropdown(true); }} onFocus={() => setShowAdvisorDropdown(true)} placeholder={t('Search advisor...')} className="input pr-8" />
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
                  <label className="form-label flex items-center gap-1.5">
                    {t('Action Taken')}
                    <span className="text-[9px] font-bold tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">SIS</span>
                  </label>
                  <select value={formData.action_taken} onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })} className="select">
                    <option value="">{t('Select Action')}</option>
                    {actionOptions.map(opt => <option key={opt} value={opt}>{t(opt)}</option>)}
                  </select>
                </div>
              </div>

              {/* PlusPortals penalty & served-status codes — the SIS referral fields */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-emerald-900 flex items-center gap-1.5">
                    {t('Penalty & Service')}
                  </h3>
                  <span className="text-[10px] font-bold tracking-wide text-emerald-700 bg-white border border-emerald-200 rounded px-1.5 py-0.5">PLUSPORTALS CODES</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">{t('Penalty')}</label>
                    <select value={formData.penalty} onChange={(e) => handlePenaltySelect(e.target.value)} className="select">
                      <option value="">{t('Select Penalty')}</option>
                      {penaltyOptions.map(c => (
                        <option key={c.code} value={`${c.code} — ${c.name}`}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">{t('Served Status')}</label>
                    <select value={formData.penalty_served} onChange={(e) => setFormData({ ...formData, penalty_served: e.target.value })} className="select" disabled={!formData.penalty}>
                      <option value="">{formData.penalty ? t('Select status...') : t('Select penalty first')}</option>
                      {servedOptions.map(opt => <option key={opt} value={opt}>{t(opt)}</option>)}
                    </select>
                  </div>
                </div>
                {formData.penalty && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="form-label">{t('Detention Hours')}</label>
                      <input type="number" step="0.5" min={0} value={formData.detention_hours} onChange={(e) => setFormData({ ...formData, detention_hours: Number(e.target.value) })} className="input" />
                    </div>
                    <div>
                      <label className="form-label">{t('Days ISS')}</label>
                      <input type="number" min={0} value={formData.days_iss} onChange={(e) => setFormData({ ...formData, days_iss: Number(e.target.value) })} className="input" />
                    </div>
                    <div>
                      <label className="form-label">{t('Days OSS')}</label>
                      <input type="number" min={0} value={formData.days_oss} onChange={(e) => setFormData({ ...formData, days_oss: Number(e.target.value) })} className="input" />
                    </div>
                  </div>
                )}
                {selectedPenalty?.description && (
                  <p className="text-xs text-emerald-800">{t(selectedPenalty.description)}</p>
                )}
              </div>

              <div className="p-3 bg-yellow-50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.follow_up_needed === 'Yes'} onChange={(e) => setFormData({ ...formData, follow_up_needed: e.target.checked ? 'Yes' : 'No' })} className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium">{t('Follow-up Required')}</span>
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
                  <span className="text-sm font-medium">{t('Parent Notified?')}</span>
                </label>
                {formData.parent_contacted === 'Yes' && (
                  <div className="mt-2">
                    <input type="date" value={formData.contact_date} onChange={(e) => setFormData({ ...formData, contact_date: e.target.value })} className="input" />
                  </div>
                )}
              </div>

              <div>
                <label className="form-label">{t('Notes')}</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input min-h-[60px]" placeholder={t('Additional notes...')} />
              </div>

              <div className="flex justify-end gap-6 pt-4">
                <button type="button" onClick={closeModal} className="btn btn-danger">{t('Cancel')}</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? <span className="flex items-center gap-2"><Loader className="w-5 h-5 animate-spin" />{t('Saving...')}</span> : t('Record Incident')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}