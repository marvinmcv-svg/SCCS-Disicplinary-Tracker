import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Upload, User, Mail, Phone, MapPin, Shield, Clock, Check, X, Lock } from 'lucide-react';
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
  const [successMessage, setSuccessMessage] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
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
  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const isOwnProfile = currentUser?.id === parseInt(id || '0');
  const canEdit = isOwnProfile || isAdmin;

  const roleOptions = [
    { value: 'user', label: 'User', description: 'Standard access' },
    { value: 'teacher', label: 'Teacher', description: 'Teacher access' },
    { value: 'teacher_assistant', label: 'Teacher Assistant', description: 'Assistant access' },
    { value: 'admin', label: 'Admin', description: 'Full administrative access' },
  ];

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

  // Track unsaved changes
  useEffect(() => {
    if (user) {
      const hasChanges =
        formData.username !== user.username ||
        formData.role !== user.role ||
        formData.first_name !== user.first_name ||
        formData.last_name !== user.last_name ||
        formData.email !== user.email ||
        formData.phone !== user.phone ||
        formData.classroom !== user.classroom ||
        profilePicture !== (user.profile_picture || '');
      setHasUnsavedChanges(hasChanges);
    }
  }, [formData, profilePicture, user]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData(prev => ({ ...prev, [field]: value }));
    setPasswordError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasUnsavedChanges && !passwordData.newPassword) {
      return; // Nothing to save
    }
    setSaving(true);
    setSuccessMessage('');
    setPasswordError('');

    try {
      const payload: any = {
        username: formData.username,
        role: formData.role,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        classroom: formData.classroom,
        profile_picture: profilePicture,
      };

      if (passwordData.newPassword) {
        if (passwordData.newPassword.length < 6) {
          setPasswordError('Password must be at least 6 characters');
          setSaving(false);
          return;
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
          setPasswordError('Passwords do not match');
          setSaving(false);
          return;
        }
        payload.newPassword = passwordData.newPassword;
      }

      const response = await api.put(`/users/${id}`, payload);
      setSuccessMessage('Profile updated successfully!');
      setPasswordData({ newPassword: '', confirmPassword: '' });
      setHasUnsavedChanges(false);
      loadUser();

      setTimeout(() => setSuccessMessage(''), 3000);
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
    setPasswordData({ newPassword: '', confirmPassword: '' });
    setPasswordError('');
    setHasUnsavedChanges(false);
  };

  const handlePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum size is 10MB.');
        return;
      }
      // Validate it's an image
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicture(reader.result as string);
        setHasUnsavedChanges(true);
      };
      reader.onerror = () => {
        alert('Failed to read file. Please try a different image.');
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

      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-fade-in">
          <Check className="w-5 h-5" />
          {successMessage}
        </div>
      )}

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
              {canEdit && (
                <label className="absolute bottom-0 right-0 bg-white text-blue-600 p-2 rounded-full cursor-pointer hover:bg-gray-100 shadow-lg">
                  <Upload className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp,image/tiff,image/heic,image/heif"
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
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Information
          </h2>
          {canEdit && hasUnsavedChanges && (
            <span className="text-xs text-orange-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Unsaved changes
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Username</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => {
                  handleChange('username', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="input"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <label className="form-label">Role</label>
              <select
                value={formData.role}
                onChange={(e) => {
                  handleChange('role', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="select"
                disabled={!isAdmin}
              >
                {roleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {!isAdmin && <p className="text-xs text-gray-500 mt-1">Only admins can change roles</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">First Name</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => {
                  handleChange('first_name', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="input"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="form-label">Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => {
                  handleChange('last_name', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="input"
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => {
                  handleChange('email', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="input"
                disabled={!canEdit}
                placeholder="email@school.edu"
              />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  handleChange('phone', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="input"
                disabled={!canEdit}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Classroom</label>
            <input
              type="text"
              value={formData.classroom}
              onChange={(e) => {
                handleChange('classroom', e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="input max-w-md"
              disabled={!canEdit}
              placeholder="Room 101, Building A"
            />
          </div>

          {/* Profile Picture Upload */}
          {canEdit && (
            <div className="pt-4 border-t">
              <label className="form-label">Profile Picture</label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt="Profile"
                      className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="btn btn-secondary cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    {profilePicture ? 'Change Photo' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp,image/tiff,image/heic,image/heif"
                      onChange={(e) => {
                        handlePictureUpload(e);
                      }}
                      className="hidden"
                    />
                  </label>
                  {profilePicture && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfilePicture('');
                        setHasUnsavedChanges(true);
                      }}
                      className="ml-2 text-sm text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                  <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP, SVG, BMP, HEIC. Max 10MB.</p>
                </div>
              </div>
            </div>
          )}

          {/* Password Change Section */}
          {canEdit && (
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Change Password
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                    className="input"
                    placeholder="Min 6 characters"
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                    className="input"
                    placeholder="Re-enter password"
                    minLength={6}
                  />
                </div>
              </div>
              {passwordError && (
                <p className="text-red-500 text-sm mt-2">{passwordError}</p>
              )}
              <p className="text-gray-500 text-xs mt-2">Leave password fields empty to keep current password</p>
            </div>
          )}

          {/* Save / Cancel Buttons - Always visible when can edit */}
          {canEdit && (
            <div className="flex items-center gap-3 pt-4 border-t">
              <button
                type="submit"
                disabled={saving || !hasUnsavedChanges}
                className={`btn flex items-center gap-2 ${hasUnsavedChanges ? 'btn-primary' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                {saving ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Changes
                  </>
                )}
              </button>
              {hasUnsavedChanges && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <X className="w-5 h-5" />
                  Cancel
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}