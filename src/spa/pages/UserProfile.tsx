import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Upload, User, Mail, Phone, MapPin, Shield, Clock, Check, X, Lock, AlertTriangle, Power, Users as UsersIcon, FileText } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../App';
import { useI18n } from '../i18n';

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
  department: string | null;
  advisory: string | null;
  is_active: boolean;
  last_login: string | null;
  two_factor_enabled: boolean;
  assigned_students_count: number;
  incidents_logged_count: number;
}

interface ActivityLogEntry {
  id: number;
  action: string;
  details: string | null;
  created_at: string;
}

interface PasswordValidation {
  minLength: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

const departmentOptions = [
  'Administration',
  'English',
  'Mathematics',
  'Science',
  'Social Studies',
  'Physical Education',
  'Art',
  'Music',
  'Technology',
  'Special Education',
  'World Languages',
  'Career & Technical Education',
];

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [advisories, setAdvisories] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    username: '',
    role: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    classroom: '',
    department: '',
    advisory: '',
  });
  const [profilePicture, setProfilePicture] = useState('');
  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidation>({
    minLength: false,
    hasNumber: false,
    hasSpecial: false,
  });
  const [passwordError, setPasswordError] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const isOwnProfile = currentUser?.id === parseInt(id || '0');
  const canEdit = isOwnProfile || isAdmin;

  const roleOptions = [
    { value: 'user', label: 'User', description: 'Standard access' },
    { value: 'teacher', label: 'Teacher', description: 'Teacher access' },
    { value: 'counselor', label: 'Counselor', description: 'Counselor access' },
    { value: 'admin', label: 'Admin', description: 'Full administrative access' },
  ];

  const loadUser = useCallback(async () => {
    try {
      const res = await api.get(`/users/${id}`);
      if (!res.data) {
        console.error('No data received from server');
        setLoading(false);
        return;
      }
      setUser(res.data);
      setFormData({
        username: res.data.username || '',
        role: res.data.role || '',
        first_name: res.data.first_name || '',
        last_name: res.data.last_name || '',
        email: res.data.email || '',
        phone: res.data.phone || '',
        classroom: res.data.classroom || '',
        department: res.data.department || '',
        advisory: res.data.advisory || '',
      });
      setProfilePicture(res.data.profile_picture || '');
    } catch (error: any) {
      console.error('Failed to load user', error);
      if (error.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const loadAdvisories = async () => {
    try {
      const res = await api.get('/advisories');
      setAdvisories(res.data || []);
    } catch (error) {
      console.error('Failed to load advisories', error);
    }
  };

  const loadActivityLogs = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/users/activity', { params: { user_id: id, limit: '20' } });
      setActivityLogs(res.data || []);
    } catch (error) {
      console.error('Failed to load activity logs', error);
    }
  };

  useEffect(() => {
    loadUser();
    loadAdvisories();
  }, [loadUser]);

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
        formData.department !== (user.department || '') ||
        formData.advisory !== (user.advisory || '') ||
        profilePicture !== (user.profile_picture || '');
      setHasUnsavedChanges(hasChanges);
    }
  }, [formData, profilePicture, user]);

  const handlePasswordChange = (value: string) => {
    setPasswordData(prev => ({ ...prev, newPassword: value }));
    setPasswordError('');

    // Validate in real-time
    setPasswordValidation({
      minLength: value.length >= 8,
      hasNumber: /\d/.test(value),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(value),
    });
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasUnsavedChanges && !passwordData.newPassword) {
      return;
    }
    setSaving(true);
    setSuccessMessage('');
    setPasswordError('');

    try {
      // Validate password if being changed
      if (passwordData.newPassword) {
        if (passwordData.newPassword.length < 8) {
          setPasswordError(t('Password must be at least 8 characters'));
          setSaving(false);
          return;
        }
        if (!/\d/.test(passwordData.newPassword)) {
          setPasswordError(t('Password must contain at least one number'));
          setSaving(false);
          return;
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(passwordData.newPassword)) {
          setPasswordError(t('Password must contain at least one special character'));
          setSaving(false);
          return;
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
          setPasswordError(t('Passwords do not match'));
          setSaving(false);
          return;
        }
      }

      const payload: Record<string, unknown> = {
        username: formData.username,
        role: formData.role,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        classroom: formData.classroom,
        department: formData.department || null,
        advisory: formData.advisory || null,
        profile_picture: profilePicture,
      };

      if (passwordData.newPassword) {
        payload.newPassword = passwordData.newPassword;
      }

      await api.put(`/users/${id}`, payload);

      setSuccessMessage(t('Profile updated successfully!'));
      setPasswordData({ newPassword: '', confirmPassword: '' });
      setHasUnsavedChanges(false);
      setPasswordValidation({ minLength: false, hasNumber: false, hasSpecial: false });

      loadUser();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      const errorMsg = error.response?.data?.error || t('Failed to update profile');
      alert(errorMsg);
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
        department: user.department || '',
        advisory: user.advisory || '',
      });
      setProfilePicture(user.profile_picture || '');
    }
    setPasswordData({ newPassword: '', confirmPassword: '' });
    setPasswordError('');
    setHasUnsavedChanges(false);
    setPasswordValidation({ minLength: false, hasNumber: false, hasSpecial: false });
  };

  const handlePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert(t('File too large. Maximum size is 10MB.'));
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert(t('Please select an image file.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reader.result;
        if (typeof result === 'string') {
          setProfilePicture(result);
          setHasUnsavedChanges(true);
        } else {
          alert(t('Failed to read file. Please try a different image.'));
        }
      } catch (err) {
        console.error('Error setting profile picture:', err);
        alert(t('Failed to process image.'));
      }
    };
    reader.onerror = () => {
      alert(t('Failed to read file. Please try a different image.'));
    };
    reader.readAsDataURL(file);
  };

  const handleDeactivate = async () => {
    try {
      await api.delete(`/users/${id}`);
      setShowDeactivateConfirm(false);
      loadUser();
      setSuccessMessage(t('User deactivated successfully'));
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      alert(error.response?.data?.error || t('Failed to deactivate user'));
    }
  };

  const handleReactivate = async () => {
    try {
      await api.put(`/users/${id}/reactivate`);
      loadUser();
      setSuccessMessage(t('User reactivated successfully'));
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      alert(error.response?.data?.error || t('Failed to reactivate user'));
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-400">{t('Loading profile...')}</div>
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
        {t('Back to Users')}
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
              {profilePicture && typeof profilePicture === 'string' && profilePicture.trim() ? (
                <img
                  src={profilePicture}
                  alt={t('Profile')}
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
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
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
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                  user?.role === 'admin' ? 'bg-purple-200 text-purple-800' :
                  user?.role === 'counselor' ? 'bg-blue-200 text-blue-800' :
                  user?.role === 'teacher' ? 'bg-green-200 text-green-800' :
                  'bg-gray-200 text-gray-800'
                }`}>
                  <Shield className="w-4 h-4" />
                  {t(user?.role || '')}
                </span>
                {user?.classroom && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white">
                    <MapPin className="w-4 h-4" />
                    {user?.classroom}
                  </span>
                )}
                {!user?.is_active && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-red-200 text-red-800">
                    <AlertTriangle className="w-4 h-4" />
                    {t('Deactivated')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Info Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-100 bg-gray-50">
          {user?.email && (
            <a href={`mailto:${user.email}`} className="flex items-center gap-3 p-4 hover:bg-gray-100 transition-colors">
              <Mail className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">{t('Email')}</p>
                <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
              </div>
            </a>
          )}
          {user?.phone && (
            <a href={`tel:${user.phone}`} className="flex items-center gap-3 p-4 hover:bg-gray-100 transition-colors">
              <Phone className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">{t('Phone')}</p>
                <p className="text-sm font-medium text-gray-900">{user.phone}</p>
              </div>
            </a>
          )}
          <div className="flex items-center gap-3 p-4">
            <Clock className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">{t('Last Login')}</p>
              <p className="text-sm font-medium text-gray-900">
                {user?.last_login ? new Date(user.last_login).toLocaleString() : t('Never')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <UsersIcon className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">{t('Assigned Students')}</p>
              <p className="text-sm font-medium text-gray-900">{user?.assigned_students_count || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <User className="w-5 h-5" />
            {t('Profile Information')}
          </h2>
          {canEdit && hasUnsavedChanges && (
            <span className="text-xs text-orange-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {t('Unsaved changes')}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('Username')}</label>
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
              <label className="form-label">{t('Role')}</label>
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
                    {t(opt.label)}
                  </option>
                ))}
              </select>
              {!isAdmin && <p className="text-xs text-gray-500 mt-1">{t('Only admins can change roles')}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('First Name')}</label>
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
              <label className="form-label">{t('Last Name')}</label>
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
              <label className="form-label">{t('Email')}</label>
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
              <label className="form-label">{t('Phone')}</label>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('Classroom')}</label>
              <input
                type="text"
                value={formData.classroom}
                onChange={(e) => {
                  handleChange('classroom', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="input max-w-md"
                disabled={!canEdit}
                placeholder={t('Room 101, Building A')}
              />
            </div>
            <div>
              <label className="form-label">{t('Department / Subject')}</label>
              <select
                value={formData.department}
                onChange={(e) => {
                  handleChange('department', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="select"
                disabled={!canEdit}
              >
                <option value="">{t('Select Department')}</option>
                {departmentOptions.map(dept => (
                  <option key={dept} value={dept}>{t(dept)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('Advisory / Homeroom')}</label>
              <input
                type="text"
                value={formData.advisory}
                onChange={(e) => {
                  handleChange('advisory', e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="input"
                disabled={!canEdit}
                placeholder={t('e.g., Lions, Eagles')}
                list="advisories-list"
              />
              <datalist id="advisories-list">
                {advisories.map(adv => (
                  <option key={adv} value={adv} />
                ))}
              </datalist>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={user?.two_factor_enabled || false}
                    onChange={async (e) => {
                      try {
                        await api.put(`/users/${id}`, {
                          ...formData,
                          profile_picture: profilePicture,
                          two_factor_enabled: e.target.checked,
                        });
                        loadUser();
                        setSuccessMessage(t('2FA settings updated'));
                        setTimeout(() => setSuccessMessage(''), 3000);
                      } catch (error) {
                        alert(t('Failed to update 2FA settings'));
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm">{t('Two-Factor Authentication')}</span>
                </label>
              </div>
            )}
          </div>

          {/* Profile Picture Upload */}
          {canEdit && (
            <div className="pt-4 border-t">
              <label className="form-label">{t('Profile Picture')}</label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  {profilePicture && typeof profilePicture === 'string' && profilePicture.trim() ? (
                    <img
                      src={profilePicture}
                      alt={t('Profile')}
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
                    {profilePicture ? t('Change Photo') : t('Upload Photo')}
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={(e) => handlePictureUpload(e)}
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
                      {t('Remove')}
                    </button>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{t('JPG, PNG, GIF, WebP. Max 10MB.')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Password Change Section */}
          {canEdit && (
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                {t('Change Password')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">{t('New Password')}</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    className="input"
                    placeholder={t('Min 8 chars, 1 number, 1 special char')}
                  />
                  {passwordData.newPassword && (
                    <div className="mt-2 space-y-1">
                      <p className={`text-xs flex items-center gap-1 ${passwordValidation.minLength ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.minLength ? '✓' : '✗'} {t('At least 8 characters')}
                      </p>
                      <p className={`text-xs flex items-center gap-1 ${passwordValidation.hasNumber ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.hasNumber ? '✓' : '✗'} {t('At least one number')}
                      </p>
                      <p className={`text-xs flex items-center gap-1 ${passwordValidation.hasSpecial ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.hasSpecial ? '✓' : '✗'} {t('At least one special character')}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="form-label">{t('Confirm New Password')}</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => {
                      setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }));
                      setPasswordError('');
                    }}
                    className="input"
                    placeholder={t('Re-enter password')}
                  />
                </div>
              </div>
              {passwordError && (
                <p className="text-red-500 text-sm mt-2">{passwordError}</p>
              )}
              <p className="text-gray-500 text-xs mt-2">{t('Leave password fields empty to keep current password')}</p>
            </div>
          )}

          {/* Admin Actions */}
          {isAdmin && (
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                {t('Admin Actions')}
              </h3>
              <div className="flex items-center gap-4">
                {user?.is_active ? (
                  <button
                    type="button"
                    onClick={() => setShowDeactivateConfirm(true)}
                    className="btn btn-danger"
                  >
                    <Power className="w-4 h-4 mr-2" />
                    {t('Deactivate Account')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReactivate}
                    className="btn btn-primary"
                  >
                    <Power className="w-4 h-4 mr-2" />
                    {t('Reactivate Account')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => loadActivityLogs()}
                  className="btn btn-secondary"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {t('View Activity Log')}
                </button>
              </div>
            </div>
          )}

          {/* Save / Cancel Buttons - Always visible when canEdit */}
          {canEdit && (
            <div className="flex items-center gap-3 pt-4 border-t">
              <button
                type="submit"
                disabled={saving}
                className={`btn flex items-center gap-2 ${hasUnsavedChanges || passwordData.newPassword ? 'btn-primary' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                {saving ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    {hasUnsavedChanges || passwordData.newPassword ? t('Save Changes') : t('No Changes')}
                  </>
                )}
              </button>
              {(hasUnsavedChanges || passwordData.newPassword) && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <X className="w-5 h-5" />
                  {t('Cancel')}
                </button>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Activity Log Section */}
      {isAdmin && activityLogs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {t('Recent Activity')}
          </h3>
          <table className="table">
            <thead>
              <tr>
                <th>{t('Timestamp')}</th>
                <th>{t('Action')}</th>
                <th>{t('Details')}</th>
              </tr>
            </thead>
            <tbody>
              {activityLogs.map(log => (
                <tr key={log.id}>
                  <td className="text-sm">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      log.action === 'CREATE_USER' ? 'bg-green-100 text-green-700' :
                      log.action === 'UPDATE_USER' ? 'bg-blue-100 text-blue-700' :
                      log.action === 'DEACTIVATE_USER' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {t(log.action.replace('_', ' '))}
                    </span>
                  </td>
                  <td className="text-sm text-gray-500">{log.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {showDeactivateConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                {t('Deactivate User')}
              </h2>
              <button
                onClick={() => setShowDeactivateConfirm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-4">
              {t('Are you sure you want to deactivate {name}? They will not be able to log in until you reactivate them.', { name: `${user?.first_name} ${user?.last_name}` })}
            </p>
            <p className="text-gray-600 mb-4">
              {t('All their data and audit history will be preserved.')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeactivateConfirm(false)}
                className="btn btn-secondary flex-1"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleDeactivate}
                className="btn btn-danger flex-1"
              >
                {t('Deactivate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}