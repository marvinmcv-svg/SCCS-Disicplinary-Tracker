import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Upload, User } from 'lucide-react';
import api from '../lib/api';

interface UserProfile {
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

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    role: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    classroom: '',
  });
  const [profilePicture, setProfilePicture] = useState('');

  useEffect(() => {
    loadUser();
  }, [id]);

  const loadUser = async () => {
    try {
      const res = await api.get(`/users/${id}`);
      setUser(res.data);
      setFormData({
        username: res.data.username || '',
        role: res.data.role || '',
        first_name: res.data.first_name || '',
        last_name: res.data.last_name || '',
        email: res.data.email || '',
        phone: res.data.phone || '',
        classroom: res.data.classroom || '',
      });
      setProfilePicture(res.data.profile_picture || '');
    } catch (error) {
      console.error('Failed to load user', error);
      navigate('/users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.put(`/users/${id}`, {
        ...formData,
        profile_picture: profilePicture,
      });
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handlePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicture(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-24">
      <button
        onClick={() => navigate('/users')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Users
      </button>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-6 mb-6">
          <div className="relative">
            {profilePicture ? (
              <img
                src={profilePicture}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border-4 border-gray-100"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center border-4 border-gray-100">
                <User className="w-12 h-12 text-blue-600" />
              </div>
            )}
            <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 shadow-lg">
              <Upload className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                onChange={handlePictureUpload}
                className="hidden"
              />
            </label>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {formData.first_name} {formData.last_name}
            </h1>
            <p className="text-gray-500">@{formData.username}</p>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-2 ${
              formData.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {formData.role}
            </span>
          </div>
        </div>

        {message && (
          <div className={`p-3 rounded-lg mb-4 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Username</label>
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

          <div className="grid grid-cols-2 gap-4">
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

          <div>
            <label className="form-label">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input"
              placeholder="email@school.edu"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary w-full justify-center py-3"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}