import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, X, User, Check, Loader } from 'lucide-react';
import api from '../lib/api';

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
  grade: number;
  house_team: string;
  counselor: string;
  gpa: number;
  total_points: number;
  conduct_status: string;
}

export default function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState({
    student_id: '',
    last_name: '',
    first_name: '',
    grade: 9,
    house_team: '',
    counselor: '',
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
      if (editingStudent) {
        await api.put(`/students/${editingStudent.id}`, formData);
      } else {
        await api.post('/students', formData);
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

  const openModal = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setFormData(student);
    } else {
      setEditingStudent(null);
      setFormData({ student_id: '', last_name: '', first_name: '', grade: 9, house_team: '', counselor: '' });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingStudent(null);
  };

  const filteredStudents = students.filter(s =>
    !search ||
    s.last_name.toLowerCase().includes(search.toLowerCase()) ||
    s.first_name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500">Manage student records</p>
        </div>
        <div className="flex gap-2">
          {saved && (
            <span className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-xl">
              <Check className="w-5 h-5" />
              <span className="font-medium">Saved!</span>
            </span>
          )}
          <button onClick={() => openModal()} className="btn btn-primary">
            <Plus className="w-5 h-5" />
            Add Student
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card">
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">House/Team</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Points</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hide-mobile">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
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
                        <div>
                          <p className="font-semibold text-gray-900">{student.last_name}, {student.first_name}</p>
                          <p className="text-xs text-gray-500 md:hidden">{student.student_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm hide-mobile">{student.student_id}</td>
                    <td className="px-4 py-3 hide-mobile">{student.grade}</td>
                    <td className="px-4 py-3 hide-mobile">{student.house_team || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${student.total_points >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {student.total_points}
                      </span>
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openModal(student)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-blue-600"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(student.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    onChange={(e) => setFormData({ ...formData, grade: Number(e.target.value) })}
                    className="select"
                  >
                    {[6, 7, 8, 9, 10, 11, 12].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">House/Team</label>
                  <input
                    type="text"
                    value={formData.house_team}
                    onChange={(e) => setFormData({ ...formData, house_team: e.target.value })}
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

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeModal} className="btn btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <Loader className="w-5 h-5 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    editingStudent ? 'Update Student' : 'Save Student'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}