import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { User as UserIcon, Shield, Trash2, Plus, X, Mail, Phone, MapPin, Image, Loader } from 'lucide-react';

interface User {
  id: number;
  username: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  classroom: string;
  profile_picture: string;
  created_at: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    classroom: '',
    profile_picture: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data || []);
    } catch (error) {
      console.error('Failed to load users', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingUser && editingUser.id) {
        await api.put(`/users/${editingUser.id}`, {
          username: formData.username,
          role: formData.role,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone,
          classroom: formData.classroom,
          profile_picture: formData.profile_picture,
        });
        if (formData.password) {
          await api.put(`/users/${editingUser.id}/password`, { password: formData.password });
        }
        setMessage({ type: 'success', text: 'User updated successfully!' });
      } else {
        await api.post('/users', {
          username: formData.username,
          password: formData.password,
          role: formData.role,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone,
          classroom: formData.classroom,
        });
        setMessage({ type: 'success', text: 'User created successfully!' });
      }
      setTimeout(() => {
        setShowModal(false);
        resetForm();
        loadUsers();
      }, 1000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save user' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      loadUsers();
      setMessage({ type: 'success', text: 'User deleted successfully' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to delete user' });
    }
  };

  const openModal = (user?: User) => {
    if (user && user.id) {
      setEditingUser(user);
      setFormData({
        username: user.username || '',
        password: '',
        role: user.role || 'user',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        classroom: user.classroom || '',
        profile_picture: user.profile_picture || '',
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      role: 'user',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      classroom: '',
      profile_picture: '',
    });
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl md:text-2xl font-bold">User Management</h1>
        </div>
        <button onClick={() => openModal()} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" /> Add User
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg mb-4 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="float-right"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <UserIcon className="w-12 h-12 mx-auto mb-2" />
          <p>No users found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.filter(u => u && u.id).map((user) => (
            <div
              key={user.id}
              className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/users/${user.id}`)}
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {user.profile_picture ? (
                    <img src={user.profile_picture} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-7 h-7 text-blue-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {user.first_name} {user.last_name}
                  </h3>
                  <p className="text-sm text-blue-600 font-medium">@{user.username}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {user.role}
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                {user.email && (
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <Mail className="w-3 h-3" /> {user.email}
                  </p>
                )}
                {user.phone && (
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <Phone className="w-3 h-3" /> {user.phone}
                  </p>
                )}
                {user.classroom && (
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> {user.classroom}
                  </p>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); openModal(user); }}
                  className="btn btn-secondary text-xs py-1.5 px-3 flex-1"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(user.id); }}
                  className="btn btn-danger text-xs py-1.5 px-3"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingUser && editingUser.id ? 'Edit User' : 'Add New User'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg" disabled={saving}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex justify-center mb-2">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                    {formData.profile_picture ? (
                      <img src={formData.profile_picture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-10 h-10 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Username *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="select"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              {!editingUser && (
                <div>
                  <label className="form-label">Password *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input"
                    required
                    placeholder="Min 6 characters"
                  />
                </div>
              )}

              {editingUser && editingUser.id && (
                <div>
                  <label className="form-label">New Password (leave blank to keep)</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input"
                    placeholder="Leave blank to keep current"
                  />
                </div>
              )}

              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input"
                  placeholder="user@school.edu"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="form-label">Classroom</label>
                  <input
                    type="text"
                    value={formData.classroom}
                    onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
                    className="input"
                    placeholder="Room 101"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Profile Picture URL</label>
                <input
                  type="url"
                  value={formData.profile_picture}
                  onChange={(e) => setFormData({ ...formData, profile_picture: e.target.value })}
                  className="input"
                  placeholder="https://example.com/photo.jpg"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.username}
                  className="btn btn-primary flex-1"
                >
                  {saving ? <Loader className="w-5 h-5 animate-spin" /> : (editingUser && editingUser.id ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}