import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, X, User, Check, Loader, Upload, FileSpreadsheet, ChevronLeft, ChevronRight, Download, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
  grade: string;
  section?: string;
  counselor: string;
  advisory: string;
  gpa: number;
  total_points: number;
  conduct_status: string;
  observations?: string;
  date_of_birth?: string;
  parent_name?: string;
  parent_phone?: string;
  gender?: string;
  created_at: string;
}

interface Incident {
  id: number;
  student_id: number;
  date: string;
  status: string;
  [key: string]: any;
}

interface UserType {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  classroom?: string;
  role: string;
}

interface UploadPreviewRow {
  rowNum: number;
  data: Record<string, string | number>;
  errors: string[];
  isValid: boolean;
}

type SortField = 'last_name' | 'grade' | 'incident_count' | 'last_incident_date';
type SortDirection = 'asc' | 'desc';

const GRADE_COLORS: Record<string, string> = {
  '6': 'bg-blue-100 text-blue-700',
  '7': 'bg-green-100 text-green-700',
  '8': 'bg-orange-100 text-orange-700',
  '9': 'bg-purple-100 text-purple-700',
  '10': 'bg-pink-100 text-pink-700',
  '11': 'bg-indigo-100 text-indigo-700',
  '12': 'bg-red-100 text-red-700',
};

const getGradeColor = (grade: string): string => {
  const gradeNum = parseInt(grade);
  return GRADE_COLORS[gradeNum.toString()] || 'bg-gray-100 text-gray-700';
};

const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

export default function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ success: number; errors: string[] } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<UploadPreviewRow[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterCounselor, setFilterCounselor] = useState<string>('all');
  const [filterHasActiveIncidents, setFilterHasActiveIncidents] = useState<boolean>(false);
  const [advisorSearch, setAdvisorSearch] = useState('');
  const [studentIdError, setStudentIdError] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Sorting
  const [sortField, setSortField] = useState<SortField>('last_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Load saved filters from sessionStorage
  useEffect(() => {
    const savedFilters = sessionStorage.getItem('students_filters');
    if (savedFilters) {
      try {
        const filters = JSON.parse(savedFilters);
        setSearch(filters.search || '');
        setFilterGrade(filters.filterGrade || 'all');
        setFilterCounselor(filters.filterCounselor || 'all');
        setFilterHasActiveIncidents(filters.filterHasActiveIncidents || false);
        setCurrentPage(filters.currentPage || 1);
      } catch (e) {
        console.error('Failed to load saved filters:', e);
      }
    }
  }, []);

  // Save filters to sessionStorage
  useEffect(() => {
    const filters = {
      search,
      filterGrade,
      filterCounselor,
      filterHasActiveIncidents,
      currentPage
    };
    sessionStorage.setItem('students_filters', JSON.stringify(filters));
  }, [search, filterGrade, filterCounselor, filterHasActiveIncidents, currentPage]);

  // Available counselors (from users list)
  const allCounselors = useMemo(() => {
    const counselors = new Set<string>();
    students.forEach(s => {
      if (s.counselor) counselors.add(s.counselor);
    });
    return Array.from(counselors).sort();
  }, [students]);

  // Advisory teachers from users
  const advisoryTeachers = useMemo(() => {
    return users
      .filter(u => u.role === 'teacher' || u.role === 'admin')
      .map(u => u.classroom || `${u.first_name} ${u.last_name}`.trim())
      .filter(Boolean)
      .sort();
  }, [users]);

  const filteredAdvisors = advisoryTeachers.filter(a =>
    a.toLowerCase().includes(advisorSearch.toLowerCase())
  );

  const [formData, setFormData] = useState({
    student_id: '',
    last_name: '',
    first_name: '',
    grade: '9',
    section: '',
    counselor: '',
    advisory: '',
    observations: '',
    date_of_birth: '',
    parent_name: '',
    parent_phone: '',
    gender: '',
  });

  useEffect(() => {
    loadStudents();
    loadUsers();
  }, []);

  const loadStudents = async () => {
    try {
      const [studentsRes, incidentsRes] = await Promise.all([
        api.get('/students'),
        api.get('/incidents'),
      ]);
      setStudents(studentsRes.data);
      setIncidents(incidentsRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  // Get incident counts per student
  const getIncidentCount = (studentId: number): number => {
    return incidents.filter(i => i.student_id === studentId).length;
  };

  // Get last incident date for a student
  const getLastIncidentDate = (studentId: number): string | null => {
    const studentIncidents = incidents.filter(i => i.student_id === studentId);
    if (studentIncidents.length === 0) return null;
    return studentIncidents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date || null;
  };

  // Has active incidents (Open or Pending)
  const hasActiveIncidents = (studentId: number): boolean => {
    return incidents.some(i => i.student_id === studentId && (i.status === 'Open' || i.status === 'Pending'));
  };

  // Check if student ID exists
  const studentIdExists = async (studentId: string, excludeId?: number): Promise<boolean> => {
    const existing = students.find(s => s.student_id === studentId && s.id !== excludeId);
    return !!existing;
  };

  // Sorting and filtering
  const processedStudents = useMemo(() => {
    let result = [...students];

    // Filter by search (now includes advisory)
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(s =>
        s.last_name.toLowerCase().includes(searchLower) ||
        s.first_name.toLowerCase().includes(searchLower) ||
        s.student_id.toLowerCase().includes(searchLower) ||
        (s.advisory && s.advisory.toLowerCase().includes(searchLower))
      );
    }

    // Filter by grade
    if (filterGrade !== 'all') {
      result = result.filter(s => s.grade === filterGrade);
    }

    // Filter by counselor
    if (filterCounselor !== 'all') {
      result = result.filter(s => s.counselor === filterCounselor);
    }

    // Filter by active incidents
    if (filterHasActiveIncidents) {
      result = result.filter(s => hasActiveIncidents(s.id));
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'last_name':
          comparison = a.last_name.localeCompare(b.last_name);
          break;
        case 'grade':
          comparison = parseInt(a.grade) - parseInt(b.grade);
          break;
        case 'incident_count':
          comparison = getIncidentCount(a.id) - getIncidentCount(b.id);
          break;
        case 'last_incident_date':
          const dateA = getLastIncidentDate(a.id) || '';
          const dateB = getLastIncidentDate(b.id) || '';
          comparison = dateA.localeCompare(dateB);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [students, search, filterGrade, filterCounselor, filterHasActiveIncidents, sortField, sortDirection, incidents]);

  // Pagination
  const totalPages = Math.ceil(processedStudents.length / pageSize);
  const paginatedStudents = processedStudents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStudentIdError('');

    try {
      // Validate student ID uniqueness for new students
      if (!editingStudent) {
        const exists = await studentIdExists(formData.student_id);
        if (exists) {
          setStudentIdError('A student with this ID already exists. Please use a different student ID.');
          setSaving(false);
          return;
        }
      }

      const payload = {
        student_id: formData.student_id,
        last_name: formData.last_name,
        first_name: formData.first_name,
        grade: formData.grade,
        section: formData.section,
        counselor: formData.counselor,
        advisory: formData.advisory,
        observations: formData.observations,
        date_of_birth: formData.date_of_birth || null,
        parent_name: formData.parent_name || null,
        parent_phone: formData.parent_phone || null,
        gender: formData.gender || null,
      };

      if (editingStudent) {
        await api.put(`/students/${editingStudent.id}`, payload);
      } else {
        await api.post('/students', payload);
      }
      loadStudents();
      closeModal();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error saving student');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadResults(null);
      parseFileForPreview(file);
    }
  };

  const parseFileForPreview = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const previewRows: UploadPreviewRow[] = [];
      const normalizeHeader = (str: any): string => {
        if (typeof str !== 'string') return '';
        return str.toString().toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      };

      const getValue = (rowData: any, ...candidates: string[]): string => {
        for (const candidate of candidates) {
          const normalized = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const key of Object.keys(rowData)) {
            if (normalizeHeader(key) === normalized) {
              const val = rowData[key];
              if (val !== undefined && val !== null && val !== '') {
                return String(val).trim();
              }
            }
          }
        }
        return '';
      };

      const parseGrade = (gradeVal: any): string => {
        if (!gradeVal) return '9';
        const str = String(gradeVal).toUpperCase().trim();
        const match = str.match(/^(\d+)([AB])?$/);
        if (match) {
          return match[2] ? `${match[1]}${match[2]}` : match[1];
        }
        if (str.includes('9TH') || str.includes('FRESHM')) return '9';
        if (str.includes('10TH') || str.includes('SOPH')) return '10';
        if (str.includes('11TH') || str.includes('JUN')) return '11';
        if (str.includes('12TH') || str.includes('SEN')) return '12';
        const numMatch = str.match(/(\d+)/);
        return numMatch ? numMatch[1] : '9';
      };

      const parseSection = (gradeVal: any): string => {
        if (!gradeVal) return '';
        const str = String(gradeVal).toUpperCase().trim();
        const match = str.match(/^\d+([AB])?$/);
        if (match && match[1]) {
          return match[1];
        }
        return '';
      };

      for (let i = 0; i < Math.min(jsonData.length, 5); i++) {
        const rowData = jsonData[i] as any;
        if (!rowData || typeof rowData !== 'object' || Array.isArray(rowData)) continue;
        if (rowData['!ref'] || rowData['!merges']) continue;

        const keys = Object.keys(rowData).filter(k => !k.startsWith('!'));
        if (keys.length === 0) continue;

        const rowValues = keys.map(k => rowData[k]);
        const hasNumericOnlyKeys = keys.every(k => !isNaN(Number(k)));
        if (hasNumericOnlyKeys) continue;

        const isImageRow = rowValues.some(v =>
          typeof v === 'string' && /\.(png|jpg|jpeg|gif|bmp)/i.test(v)
        );
        if (isImageRow) continue;

        const student_id = getValue(rowData, 'student_id', 'studentid', 'student', 'id', 'student id', 'studentid');
        const last_name = getValue(rowData, 'last_name', 'lastname', 'surname', 'last name', 'last');
        const first_name = getValue(rowData, 'first_name', 'firstname', 'first', 'first name');
        const gradeVal = getValue(rowData, 'grade');
        const grade = parseGrade(gradeVal);
        const section = parseSection(gradeVal);
        const counselor = getValue(rowData, 'counselor');
        const advisory = getValue(rowData, 'advisory');

        const errors: string[] = [];
        if (!student_id) errors.push('Missing Student ID');
        if (!last_name) errors.push('Missing Last Name');
        if (!first_name) errors.push('Missing First Name');

        previewRows.push({
          rowNum: i + 1,
          data: { student_id, last_name, first_name, grade, section, counselor, advisory },
          errors,
          isValid: errors.length === 0 && !!student_id && !!last_name && !!first_name
        });
      }

      setPreviewData(previewRows);
    } catch (error) {
      console.error('Error parsing file:', error);
    }
  };

  const handleExcelUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadResults(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const results = { success: 0, errors: [] as string[] };

      const normalizeHeader = (str: any): string => {
        if (typeof str !== 'string') return '';
        return str.toString().toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      };

      const getValue = (rowData: any, ...candidates: string[]): string => {
        for (const candidate of candidates) {
          const normalized = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const key of Object.keys(rowData)) {
            if (normalizeHeader(key) === normalized) {
              const val = rowData[key];
              if (val !== undefined && val !== null && val !== '') {
                return String(val).trim();
              }
            }
          }
        }
        return '';
      };

      const parseGrade = (gradeVal: any): string => {
        if (!gradeVal) return '9';
        const str = String(gradeVal).toUpperCase().trim();
        const match = str.match(/^(\d+)([AB])?$/);
        if (match) {
          return match[2] ? `${match[1]}${match[2]}` : match[1];
        }
        if (str.includes('9TH') || str.includes('FRESHM')) return '9';
        if (str.includes('10TH') || str.includes('SOPH')) return '10';
        if (str.includes('11TH') || str.includes('JUN')) return '11';
        if (str.includes('12TH') || str.includes('SEN')) return '12';
        const numMatch = str.match(/(\d+)/);
        return numMatch ? numMatch[1] : '9';
      };

      const parseSection = (gradeVal: any): string => {
        if (!gradeVal) return '';
        const str = String(gradeVal).toUpperCase().trim();
        const match = str.match(/^\d+([AB])?$/);
        if (match && match[1]) {
          return match[1];
        }
        return '';
      };

      for (let i = 0; i < jsonData.length; i++) {
        const rowData = jsonData[i] as any;

        if (!rowData || typeof rowData !== 'object' || Array.isArray(rowData)) continue;
        if (rowData['!ref'] || rowData['!merges']) continue;

        const keys = Object.keys(rowData).filter(k => !k.startsWith('!'));
        if (keys.length === 0) continue;

        const rowValues = keys.map(k => rowData[k]);
        const hasNumericOnlyKeys = keys.every(k => !isNaN(Number(k)));
        if (hasNumericOnlyKeys) continue;

        const isImageRow = rowValues.some(v =>
          typeof v === 'string' && /\.(png|jpg|jpeg|gif|bmp)/i.test(v)
        );
        if (isImageRow) continue;

        const student_id = getValue(rowData, 'student_id', 'studentid', 'student', 'id', 'student id', 'studentid');
        const last_name = getValue(rowData, 'last_name', 'lastname', 'surname', 'last name', 'last');
        const first_name = getValue(rowData, 'first_name', 'firstname', 'first', 'first name');
        const gradeVal = getValue(rowData, 'grade');
        const grade = parseGrade(gradeVal);
        const section = parseSection(gradeVal);
        const counselor = getValue(rowData, 'counselor');
        const advisory = getValue(rowData, 'advisory');

        if (!student_id || !last_name || !first_name) {
          if (student_id || last_name || first_name) {
            results.errors.push(`Row ${i + 2}: Missing required fields. student_id="${student_id}", last_name="${last_name}", first_name="${first_name}"`);
          }
          continue;
        }

        // Check if student already exists and use upsert
        const existingStudent = students.find(s => s.student_id === student_id);
        try {
          if (existingStudent) {
            // Update existing student
            await api.put(`/students/${existingStudent.id}`, {
              student_id, last_name, first_name, grade, section, counselor, advisory
            });
          } else {
            // Insert new student
            await api.post('/students', {
              student_id, last_name, first_name, grade, section, counselor, advisory
            });
          }
          results.success++;
        } catch (error: any) {
          results.errors.push(`Failed to import ${first_name} ${last_name}: ${error.response?.data?.error || 'Unknown error'}`);
        }
      }

      setUploadResults(results);
      loadStudents();

      if (results.errors.length === 0 && results.success > 0) {
        setTimeout(() => {
          setShowUploadModal(false);
          setSelectedFile(null);
          setUploadResults(null);
          setPreviewData([]);
          setPendingImportData([]);
        }, 2000);
      }
    } catch (error) {
      console.error('Excel parse error:', error);
      setUploadResults({ success: 0, errors: ['Failed to parse file. Please ensure it\'s a valid .xlsx, .xls, or .csv file.'] });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const template = [
      {
        'Student ID': '',
        'Last Name': '',
        'First Name': '',
        'Grade': '',
        'Section': '',
        'Counselor': '',
        'Advisory': ''
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'student_import_template.xlsx');
  };

  const openModal = (student?: Student) => {
    setStudentIdError('');
    if (student) {
      setEditingStudent(student);
      setFormData({
        student_id: student.student_id,
        last_name: student.last_name,
        first_name: student.first_name,
        grade: student.grade,
        section: student.section || '',
        counselor: student.counselor || '',
        advisory: student.advisory || '',
        observations: student.observations || '',
        date_of_birth: student.date_of_birth || '',
        parent_name: student.parent_name || '',
        parent_phone: student.parent_phone || '',
        gender: student.gender || '',
      });
      setAdvisorSearch(student.advisory || '');
    } else {
      setEditingStudent(null);
      setFormData({
        student_id: '', last_name: '', first_name: '', grade: '9', section: '',
        counselor: '', advisory: '', observations: '',
        date_of_birth: '', parent_name: '', parent_phone: '', gender: ''
      });
      setAdvisorSearch('');
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingStudent(null);
    setStudentIdError('');
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'None';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <span className="text-gray-400 ml-1">↕</span>;
    }
    return sortDirection === 'asc' ? <span className="text-blue-600 ml-1">↑</span> : <span className="text-blue-600 ml-1">↓</span>;
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterGrade('all');
    setFilterCounselor('all');
    setFilterHasActiveIncidents(false);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500">Manage student records</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {saved && (
            <span className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-xl">
              <Check className="w-5 h-5" />
              <span className="font-medium">Saved!</span>
            </span>
          )}
          <button
            onClick={() => setShowUploadModal(true)}
            className="btn bg-green-600 text-white hover:bg-green-700"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Import Excel
          </button>
          <button onClick={() => openModal()} className="btn btn-primary">
            <Plus className="w-5 h-5" />
            Add Student
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex flex-col gap-4">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, ID, or advisory..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="input pl-12"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:overflow-visible md:flex-wrap">
            <select
              value={filterGrade}
              onChange={(e) => {
                setFilterGrade(e.target.value);
                setCurrentPage(1);
              }}
              className="select min-w-[140px]"
            >
              <option value="all">All Grades</option>
              {[6, 7, 8, 9, 10, 11, 12].map(g => (
                <>
                  <option key={`${g}A`} value={`${g}A`}>Grade {g}A</option>
                  <option key={`${g}B`} value={`${g}B`}>Grade {g}B</option>
                </>
              ))}
            </select>
            <select
              value={filterCounselor}
              onChange={(e) => {
                setFilterCounselor(e.target.value);
                setCurrentPage(1);
              }}
              className="select min-w-[160px]"
            >
              <option value="all">All Counselors</option>
              {allCounselors.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
              <input
                type="checkbox"
                checked={filterHasActiveIncidents}
                onChange={(e) => {
                  setFilterHasActiveIncidents(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-sm whitespace-nowrap">Has Active Incidents</span>
            </label>
            {(search || filterGrade !== 'all' || filterCounselor !== 'all' || filterHasActiveIncidents) && (
              <button
                onClick={clearFilters}
                className="btn btn-secondary whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pagination Info */}
      <div className="flex items-center justify-between px-2">
        <p className="text-sm text-gray-500">
          Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, processedStudents.length)} of {processedStudents.length} students
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="btn btn-secondary py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages || 1}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="btn btn-secondary py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : paginatedStudents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('last_name')}
                  >
                    Student {getSortIcon('last_name')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">ID</th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile"
                    onClick={() => handleSort('grade')}
                  >
                    Grade/Section {getSortIcon('grade')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">Advisor</th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile"
                    onClick={() => handleSort('incident_count')}
                  >
                    Incidents {getSortIcon('incident_count')}
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hide-mobile"
                    onClick={() => handleSort('last_incident_date')}
                  >
                    Last Incident {getSortIcon('last_incident_date')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedStudents.map((student) => {
                  const incidentCount = getIncidentCount(student.id);
                  const lastIncident = getLastIncidentDate(student.id);
                  return (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${getGradeColor(student.grade)}`}>
                            {getInitials(student.first_name, student.last_name)}
                          </div>
                          <button
                            onClick={() => navigate(`/students/${student.id}`)}
                            className="text-left hover:text-blue-600 cursor-pointer"
                          >
                            <p className="font-semibold">{student.last_name}, {student.first_name}</p>
                            <p className="text-xs text-gray-500 md:hidden">{student.student_id}</p>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm hide-mobile">{student.student_id}</td>
                      <td className="px-4 py-3 hide-mobile">Grade {student.grade}{student.section ? `-${student.section}` : ''}</td>
                      <td className="px-4 py-3 hide-mobile">{student.advisory || '-'}</td>
                      <td className="px-4 py-3 hide-mobile">
                        <span className={`font-medium ${incidentCount > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                          {incidentCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 hide-mobile text-sm text-gray-600">
                        {formatDate(lastIncident)}
                      </td>
                      <td className="px-4 py-3 hide-mobile">
                        <span className={`badge ${
                          student.conduct_status === 'Good Standing' ? 'badge-success' :
                          student.conduct_status === 'Warning' ? 'badge-warning' :
                          student.conduct_status === 'Probation' ? 'badge-danger' : 'badge-info'
                        }`}>
                          {student.conduct_status || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <User className="w-12 h-12 mx-auto mb-2" />
            <p>No students found</p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-center gap-2 pb-4">
        <button
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          className="btn btn-secondary py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          First
        </button>
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="btn btn-secondary py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                  currentPage === pageNum
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="btn btn-secondary py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>
        <button
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="btn btn-secondary py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Last
        </button>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingStudent ? 'Edit Student' : 'Add New Student'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Student ID *</label>
                  <input
                    type="text"
                    value={formData.student_id}
                    onChange={(e) => {
                      setFormData({ ...formData, student_id: e.target.value });
                      setStudentIdError('');
                    }}
                    className={`input ${studentIdError ? 'border-red-500' : ''}`}
                    required
                  />
                  {studentIdError && (
                    <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {studentIdError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label">Grade</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="select"
                  >
                    {[6, 7, 8, 9, 10, 11, 12].map(g => (
                      <option key={g} value={`${g}`}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Section/Homeroom</label>
                  <select
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    className="select"
                  >
                    <option value="">None</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="select"
                  >
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Last Name *</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">Counselor</label>
                  <input
                    type="text"
                    value={formData.counselor}
                    onChange={(e) => setFormData({ ...formData, counselor: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Parent/Guardian Name</label>
                  <input
                    type="text"
                    value={formData.parent_name}
                    onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">Parent Contact Number</label>
                  <input
                    type="tel"
                    value={formData.parent_phone}
                    onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div className="relative">
                <label className="form-label">Advisory (Homeroom Teacher)</label>
                <input
                  type="text"
                  value={formData.advisory || advisorSearch}
                  onChange={(e) => {
                    setAdvisorSearch(e.target.value);
                    setFormData({ ...formData, advisory: e.target.value });
                  }}
                  placeholder="Search or select..."
                  className="input pr-10"
                />
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
              {advisorSearch && (
                <div className="bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredAdvisors.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, advisory: a });
                        setAdvisorSearch(a);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    >
                      {a}
                    </button>
                  ))}
                  {filteredAdvisors.length === 0 && (
                    <div className="px-3 py-2 text-gray-500 text-sm">No matches</div>
                  )}
                </div>
              )}

              <div>
                <label className="form-label">Observations / Notes</label>
                <textarea
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  className="input min-h-[60px]"
                  placeholder="Add any observations..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn btn-danger flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Saving...' : editingStudent ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => { setShowUploadModal(false); setSelectedFile(null); setUploadResults(null); setPreviewData([]); }}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                Import Students from Spreadsheet
              </h2>
              <button onClick={() => { setShowUploadModal(false); setSelectedFile(null); setUploadResults(null); setPreviewData([]); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between bg-green-50 rounded-xl p-4">
                <div>
                  <p className="font-semibold text-green-800 mb-1">Template Available!</p>
                  <p className="text-sm text-green-700">Download the correct format before importing</p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="btn bg-green-600 text-white hover:bg-green-700"
                >
                  <Download className="w-5 h-5" />
                  Download Template
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-sm">
                <p className="font-semibold text-gray-800 mb-2">Supported Formats:</p>
                <p className="text-gray-600">Upload any spreadsheet: <code className="bg-gray-200 px-1 rounded">.xlsx</code>, <code className="bg-gray-200 px-1 rounded">.xls</code>, or <code className="bg-gray-200 px-1 rounded">.csv</code></p>
                <p className="text-gray-600 mt-2">The system will automatically detect columns:</p>
                <ul className="text-gray-600 mt-1 ml-4 list-disc">
                  <li><strong>Student ID</strong> - detected from: student_id, studentid, student, id</li>
                  <li><strong>Last Name</strong> - detected from: last_name, lastname, surname, last name</li>
                  <li><strong>First Name</strong> - detected from: first_name, firstname, first name</li>
                  <li><strong>Grade</strong> - detected from: grade (e.g., 7A, 7B, 9)</li>
                  <li><strong>Section</strong> - automatically parsed from grade (A or B)</li>
                  <li><strong>Counselor / Advisory</strong> - automatically detected</li>
                </ul>
                <p className="text-blue-600 mt-2 font-medium">Import uses upsert logic — existing students with the same ID will be updated.</p>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                {selectedFile ? (
                  <div>
                    <p className="font-semibold text-gray-800">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-blue-600 text-sm mt-2 hover:underline"
                    >
                      Choose different file
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600 mb-2">Click to select a spreadsheet file</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-primary"
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                      Browse Files
                    </button>
                  </div>
                )}
              </div>

              {/* Preview Section */}
              {previewData.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="font-semibold text-blue-800 mb-2">Preview (first 5 rows):</p>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-100">
                        <tr>
                          <th className="text-left px-2 py-1">Row</th>
                          <th className="text-left px-2 py-1">Student ID</th>
                          <th className="text-left px-2 py-1">Name</th>
                          <th className="text-left px-2 py-1">Grade</th>
                          <th className="text-left px-2 py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row) => (
                          <tr key={row.rowNum} className="border-b border-blue-100">
                            <td className="px-2 py-1">{row.rowNum}</td>
                            <td className="px-2 py-1">{row.data.student_id || '-'}</td>
                            <td className="px-2 py-1">{row.data.last_name || ''}, {row.data.first_name || ''}</td>
                            <td className="px-2 py-1">{row.data.grade || '-'}</td>
                            <td className="px-2 py-1">
                              {row.errors.length > 0 ? (
                                <span className="text-red-600 text-xs">
                                  <AlertCircle className="w-3 h-3 inline mr-1" />
                                  {row.errors[0]}
                                </span>
                              ) : (
                                <span className="text-green-600 text-xs">
                                  <Check className="w-3 h-3 inline mr-1" />
                                  OK
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {uploadResults && (
                <div className={`rounded-xl p-4 ${uploadResults.errors.length === 0 ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {uploadResults.errors.length === 0 ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-600" />
                    )}
                    <span className="font-semibold">
                      {uploadResults.errors.length === 0
                        ? `Successfully imported ${uploadResults.success} students!`
                        : `Imported ${uploadResults.success} students with ${uploadResults.errors.length} errors`}
                    </span>
                  </div>
                  {uploadResults.errors.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto text-sm text-yellow-800">
                      {uploadResults.errors.slice(0, 5).map((err, i) => (
                        <p key={i} className="mb-1">• {err}</p>
                      ))}
                      {uploadResults.errors.length > 5 && (
                        <p className="font-semibold mt-1">...and {uploadResults.errors.length - 5} more errors</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowUploadModal(false); setSelectedFile(null); setUploadResults(null); setPreviewData([]); }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExcelUpload}
                  disabled={!selectedFile || uploading}
                  className="btn bg-green-600 text-white hover:bg-green-700 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <span className="flex items-center gap-2">
                      <Loader className="w-5 h-5 animate-spin" />
                      Importing...
                    </span>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Import Students
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}