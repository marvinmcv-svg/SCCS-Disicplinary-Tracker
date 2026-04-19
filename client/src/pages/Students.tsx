import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, X, User } from 'lucide-react';
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
    try {
      if (editingStudent) {
        await api.put(`/students/${editingStudent.id}`, formData);
      } else {
        await api.post('/students', formData);
      }
      loadStudents();
      closeModal();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error saving student');
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
    s.last_name.toLowerCase().includes(search.toLowerCase()) ||
    s.first_name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_id.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Good': return 'badge-success';
      case 'Warning': return 'badge-warning';
      case 'Probation': return 'badge-danger';
      default: return 'badge-info';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500">Manage student records and information</p>
        </div>
        <button onClick={() => openModal()} className="btn btn-primary">
          <Plus className="w-5 h-5" />
          Add Student
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : filteredStudents.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Grade</th>
                <th>House/Team</th>
                <th>Points</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td className="font-mono">{student.student_id}</td>
                  <td>{student.last_name}, {student.first_name}</td>
                  <td>{student.grade}</td>
                  <td>{student.house_team || '-'}</td>
                  <td>
                    <span className={`font-semibold ${student.total_points < 60 ? 'text-red-600' : 'text-green-600'}`}>
                      {student.total_points}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${getStatusColor(student.conduct_status)}`}>
                      {student.conduct_status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openModal(student)}
                        className="p-1.5 hover:bg-gray-100 rounded"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDelete(student.id)}
                        className="p-1.5 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <User className="w-12 h-12 mx-auto mb-2" />
            <p>No students found</p>
            <button onClick={() => openModal()} className="btn btn-primary mt-4">
              <Plus className="w-5 h-5" />
              Add First Student
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingStudent ? 'Edit Student' : 'Add New Student'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
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
                    onChange={(e) => setFormData({ ...formData, grade: parseInt(e.target.value) })}
                    className="select"
                  >
                    {[6, 7, 8, 9, 10, 11, 12].map(g => (
                      <option key={g} value={g}>Grade {g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={closeModal} className="btn bg-gray-100 text-gray-700">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingStudent ? 'Update' : 'Add'} Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}