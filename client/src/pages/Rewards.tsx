import { useState, useEffect } from 'react';
import { Plus, Search, Gift, Star, X } from 'lucide-react';
import api from '../lib/api';

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
  total_points: number;
}

const meritTypes = [
  { type: 'Good Citizenship', points: 2 },
  { type: 'Helping Others', points: 3 },
  { type: 'Perfect Attendance', points: 5 },
  { type: 'Homework Complete', points: 1 },
  { type: 'Leadership', points: 3 },
  { type: 'Improvement', points: 4 },
  { type: 'Kindness', points: 2 },
  { type: 'Academic Achievement', points: 5 },
];

export default function Rewards() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    student_id: '' as string | number,
    merit_type: '',
    points: 2,
    description: '',
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
      await api.post('/rewards', {
        student_id: Number(formData.student_id),
        merit_type: formData.merit_type,
        points: formData.points,
        description: formData.description,
      });
      loadStudents();
      closeModal();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error awarding merit');
    }
  };

  const openModal = (student?: Student) => {
    if (student) {
      setFormData({
        student_id: student.id,
        merit_type: '',
        points: 2,
        description: '',
      });
    } else {
      setFormData({
        student_id: '',
        merit_type: '',
        points: 2,
        description: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const handleMeritTypeChange = (type: string) => {
    const merit = meritTypes.find(m => m.type === type);
    setFormData({
      ...formData,
      merit_type: type,
      points: merit?.points || 2,
    });
  };

  const filteredStudents = students.filter(s =>
    s.last_name.toLowerCase().includes(search.toLowerCase()) ||
    s.first_name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_id.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => b.total_points - a.total_points);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rewards & Points</h1>
          <p className="text-gray-500">Award merit points for positive behavior</p>
        </div>
      </div>

      {/* Merit Types */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Merit Point Values</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {meritTypes.map((merit) => (
            <div key={merit.type} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">{merit.type}</span>
              <span className="font-bold text-green-600">+{merit.points}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Student Points */}
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
                <th>Total Points</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td className="font-mono">{student.student_id}</td>
                  <td>{student.last_name}, {student.first_name}</td>
                  <td>
                    <span className={`font-bold text-xl ${student.total_points < 60 ? 'text-red-600' : 'text-green-600'}`}>
                      {student.total_points}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${
                      student.total_points >= 80 ? 'badge-success' :
                      student.total_points >= 60 ? 'badge-warning' : 'badge-danger'
                    }`}>
                      {student.total_points >= 80 ? 'Excellent' :
                      student.total_points >= 60 ? 'Good' : 'At Risk'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => openModal(student)}
                      className="btn btn-primary text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Award
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Gift className="w-12 h-12 mx-auto mb-2" />
            <p>No students found</p>
          </div>
        )}
      </div>

      {/* Award Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Award Merit Points</h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!formData.student_id && (
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
                        {s.last_name}, {s.first_name} - Current: {s.total_points} pts
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="form-label">Merit Type *</label>
                <select
                  value={formData.merit_type}
                  onChange={(e) => handleMeritTypeChange(e.target.value)}
                  className="select"
                  required
                >
                  <option value="">Select Merit</option>
                  {meritTypes.map(m => (
                    <option key={m.type} value={m.type}>
                      {m.type} (+{m.points} pts)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Points</label>
                <input
                  type="number"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) })}
                  className="input"
                  min="1"
                />
              </div>

              <div>
                <label className="form-label">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  placeholder="Optional description"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={closeModal} className="btn bg-gray-100 text-gray-700">
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  <Star className="w-4 h-4" />
                  Award Points
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}