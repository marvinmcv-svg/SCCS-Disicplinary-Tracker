import { useState, useEffect, useRef } from 'react';
import { Plus, Search, X, User, Check, Loader, Upload, FileSpreadsheet } from 'lucide-react';
import api from '../lib/api';
import * as XLSX from 'xlsx';

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
  grade: string;
  counselor: string;
  advisory: string;
  gpa: number;
  total_points: number;
  conduct_status: string;
  observations?: string;
}

export default function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{success: number; errors: string[]} | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [advisorSearch, setAdvisorSearch] = useState('');

  const allAdvisors = ['Mr Adachi', 'Mr Cohello', 'MrDiPascuale', 'Mr Kane', 'Mr Ortiz', 'Ms Aguirre', 'Ms Camacho', 'Ms Fernandez', 'Ms Guaristi', 'Ms Hopp', 'Ms Meneses', 'Ms Molina', 'Ms Palacios', 'Ms Rios', 'Ms Robinson', 'Ms Skelly', 'Ms Tello', 'Ms Tomelic', 'Ms Zuazo', 'Mr Coronado', 'Mr Herbert', 'Mr Kreller', 'Mr Odekerken', 'Mr Soliz'];

  const filteredAdvisors = allAdvisors.filter(a =>
    a.toLowerCase().includes(advisorSearch.toLowerCase())
  );

  const [formData, setFormData] = useState({
    student_id: '',
    last_name: '',
    first_name: '',
    grade: '9',
    counselor: '',
    advisory: '',
    observations: '',
  });

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      const res = await api.get('/students');
      setStudents(res.data);
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
        student_id: formData.student_id,
        last_name: formData.last_name,
        first_name: formData.first_name,
        grade: formData.grade,
        counselor: formData.counselor,
        advisory: formData.advisory,
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

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this student?')) return;
    try {
      await api.delete(`/students/${id}`);
      loadStudents();
    } catch (error) {
      console.error(error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadResults(null);
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
        const grade = parseGrade(getValue(rowData, 'grade'));
        const counselor = getValue(rowData, 'counselor');
        const advisory = getValue(rowData, 'advisory');

        if (!student_id || !last_name || !first_name) {
          if (student_id || last_name || first_name) {
            results.errors.push(`Row ${i + 1}: Missing required fields. student_id="${student_id}", last_name="${last_name}", first_name="${first_name}"`);
          }
          continue;
        }

        try {
          await api.post('/students/bulk', { student_id, last_name, first_name, grade, counselor, advisory });
          results.success++;
        } catch (error: any) {
          results.errors.push(`Failed to add ${first_name} ${last_name}: ${error.response?.data?.error || 'Unknown error'}`);
        }
      }

      setUploadResults(results);
      loadStudents();

      if (results.errors.length === 0 && results.success > 0) {
        setTimeout(() => {
          setShowUploadModal(false);
          setSelectedFile(null);
          setUploadResults(null);
        }, 2000);
      }
    } catch (error) {
      console.error('Excel parse error:', error);
      setUploadResults({ success: 0, errors: ['Failed to parse file. Please ensure it\'s a valid .xlsx, .xls, or .csv file.'] });
    } finally {
      setUploading(false);
    }
  };

  const openModal = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setFormData({
        student_id: student.student_id,
        last_name: student.last_name,
        first_name: student.first_name,
        grade: student.grade,
        counselor: student.counselor,
        advisory: student.advisory || '',
        observations: student.observations || '',
      });
      setAdvisorSearch(student.advisory || '');
    } else {
      setEditingStudent(null);
      setFormData({ student_id: '', last_name: '', first_name: '', grade: '9', counselor: '', advisory: '', observations: '' });
      setAdvisorSearch('');
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingStudent(null);
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = !search ||
      s.last_name.toLowerCase().includes(search.toLowerCase()) ||
      s.first_name.toLowerCase().includes(search.toLowerCase()) ||
      s.student_id.toLowerCase().includes(search.toLowerCase());
    const matchesGrade = filterGrade === 'all' || s.grade === filterGrade;
    return matchesSearch && matchesGrade;
  });

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
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search students by name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="select"
            >
              <option value="all">All Grades</option>
              {[6, 7, 8, 9, 10, 11, 12].map(g => (
                <>
                  <option key={`${g}A`} value={`${g}A`}>Grade {g}A</option>
                  <option key={`${g}B`} value={`${g}B`}>Grade {g}B</option>
                </>
              ))}
            </select>
            {filterGrade !== 'all' && (
              <button
                onClick={() => setFilterGrade('all')}
                className="btn btn-secondary"
              >
                Clear Filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : filteredStudents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Student</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">Grade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">Advisor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Observations</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <button
                          onClick={() => openModal(student)}
                          className="text-left hover:text-blue-600 cursor-pointer"
                        >
                          <p className="font-semibold">{student.last_name}, {student.first_name}</p>
                          <p className="text-xs text-gray-500 md:hidden">{student.student_id}</p>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm hide-mobile">{student.student_id}</td>
                    <td className="px-4 py-3 hide-mobile">{student.grade}</td>
                    <td className="px-4 py-3 hide-mobile">{student.advisory || '-'}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-sm text-gray-600 truncate" title={student.observations || ''}>
                        {student.observations || '-'}
                      </p>
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
                ))}
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingStudent ? 'Edit Student' : 'Add New Student'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Student ID</label>
                  <input
                    type="text"
                    value={formData.student_id}
                    onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Grade</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="select"
                  >
                    {[6, 7, 8, 9, 10, 11, 12].map(g => (
                      <>
                        <option key={`${g}A`} value={`${g}A`}>Grade {g}A</option>
                        <option key={`${g}B`} value={`${g}B`}>Grade {g}B</option>
                      </>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="form-label">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="input"
                  required
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

              <div className="relative">
                <label className="form-label">Advisory</label>
                <input
                  type="text"
                  value={formData.advisory || advisorSearch}
                  onChange={(e) => {
                    setAdvisorSearch(e.target.value);
                    setFormData({ ...formData, advisory: e.target.value });
                  }}
                  placeholder="Search or select..."
                  className="input pr-8"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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
        <div className="modal-overlay" onClick={() => { setShowUploadModal(false); setSelectedFile(null); setUploadResults(null); }}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                Import Students from Spreadsheet
              </h2>
              <button onClick={() => { setShowUploadModal(false); setSelectedFile(null); setUploadResults(null); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-green-50 rounded-xl p-4 text-sm">
                <p className="font-semibold text-green-800 mb-2">Supported Formats:</p>
                <p className="text-green-700">Upload any spreadsheet: <code className="bg-green-100 px-1 rounded">.xlsx</code>, <code className="bg-green-100 px-1 rounded">.xls</code>, or <code className="bg-green-100 px-1 rounded">.csv</code></p>
                <p className="text-green-700 mt-2">The system will automatically detect columns:</p>
                <ul className="text-green-700 mt-1 ml-4 list-disc">
                  <li><strong>Student ID</strong> - detected from: student_id, studentid, student, id, student id</li>
                  <li><strong>Last Name</strong> - detected from: last_name, lastname, surname, last name, last</li>
                  <li><strong>First Name</strong> - detected from: first_name, firstname, first name, first</li>
                  <li><strong>Grade</strong> - detected from: grade (e.g., 7A, 7B, 9)</li>
                  <li><strong>Counselor</strong> - automatically detected</li>
                  <li><strong>Advisory</strong> - automatically detected</li>
                </ul>
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

              {uploadResults && (
                <div className={`rounded-xl p-4 ${uploadResults.errors.length === 0 ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {uploadResults.errors.length === 0 ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Alert className="w-5 h-5 text-yellow-600" />
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
                  onClick={() => { setShowUploadModal(false); setSelectedFile(null); setUploadResults(null); }} 
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

function Alert({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );
}