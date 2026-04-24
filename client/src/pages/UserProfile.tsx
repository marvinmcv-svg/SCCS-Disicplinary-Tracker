import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Upload, User, Mail, Phone, MapPin, Shield, Clock, Check, X, Edit3 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../App';

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
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
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
  const [hasChanges, setHasChanges] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const isOwnProfile = currentUser?.id === parseInt(id || '0');

  const loadUser = useCallback(async () => {
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
  }, [id, navigate]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (user) {
      const changed =
        formData.username !== user.username ||
        formData.role !== user.role ||
        formData.first_name !== user.first_name ||
        formData.last_name !== user.last_name ||
        formData.email !== user.email ||
        formData.phone !== user.phone ||
        formData.classroom !== user.classroom ||
        profilePicture !== user.profile_picture;
      setHasChanges(changed);
    }
  }, [formData, profilePicture, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/users/${id}`, {
        ...formData,
        profile_picture: profilePicture,
      });
      setSaved(true);
      setEditing(false);
      setHasChanges(false);
      loadUser();
      setTimeout(() => setSaved(false), 2000);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({
        username: user.username,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        classroom: user.classroom,
      });
      setProfilePicture(user.profile_picture || '');
    }
    setEditing(false);
    setHasChanges(false);
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
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-24">
      <button
        onClick={() => navigate('/users')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Users
      </button>

      {/* Profile Header Card */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt="Profile"
                  className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-white/30"
                />
              ) : (
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30">
                  <User className="w-12 h-12 md:w-16 md:h-16 text-white/80" />
                </div>
              )}
              {(isOwnProfile || isAdmin) && (
                <label className="absolute bottom-0 right-0 bg-white text-blue-600 p-2 rounded-full cursor-pointer hover:bg-gray-100 shadow-lg">
                  <Upload className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePictureUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <div className="text-white flex-1">
              <h1 className="text-2xl md:text-3xl font-bold">
                {user?.first_name} {user?.last_name}
              </h1>
              <p className="text-blue-100 text-lg">@{user?.username}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                  user?.role === 'admin' ? 'bg-purple-200 text-purple-800' : 'bg-blue-200 text-blue-800'
                }`}>
                  <Shield className="w-4 h-4" />
                  {user?.role}
                </span>
                {user?.classroom && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white">
                    <MapPin className="w-4 h-4" />
                    {user?.classroom}
                  </span>
                )}
              </div>
            </div>
            {(isOwnProfile || isAdmin) && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 bg-white text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-gray-100"
              >
                <Edit3 className="w-4 h-4" />
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Quick Info Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100 bg-gray-50">
          {user?.email && (
            <a href={`mailto:${user.email}`} className="flex items-center gap-3 p-4 hover:bg-gray-100 transition-colors">
              <Mail className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
              </div>
            </a>
          )}
          {user?.phone && (
            <a href={`tel:${user.phone}`} className="flex items-center gap-3 p-4 hover:bg-gray-100 transition-colors">
              <Phone className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm font-medium text-gray-900">{user.phone}</p>
              </div>
            </a>
          )}
          <div className="flex items-center gap-3 p-4">
            <Clock className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Member Since</p>
              <p className="text-sm font-medium text-gray-900">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      {(editing || (isOwnProfile || isAdmin)) && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            {editing ? 'Edit Profile' : 'Profile Information'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="input"
                  disabled={!editing}
                  required
                />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="select"
                  disabled={!isAdmin || !editing}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="input"
                  disabled={!editing}
                />
              </div>
              <div>
                <label className="form-label">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="input"
                  disabled={!editing}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input"
                  disabled={!editing}
                  placeholder="email@school.edu"
                />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input"
                  disabled={!editing}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="form-label">Classroom</label>
              <input
                type="text"
                value={formData.classroom}
                onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
                className="input max-w-md"
                disabled={!editing}
                placeholder="Room 101, Building A"
              />
            </div>

            {editing && (
              <div className="flex items-center gap-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={saving || !hasChanges}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {saving ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Save Changes
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <X className="w-5 h-5" />
                  Cancel
                </button>
                {saved && (
                  <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    Saved!
                  </span>
                )}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}