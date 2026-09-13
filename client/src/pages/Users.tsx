import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../App';
import { useI18n } from '../i18n';
import { User as UserIcon, Shield, Trash2, Plus, X, Mail, Phone, MapPin, Loader, Search, Clock, Users as UsersIcon, FileText, UserCheck, Power, AlertTriangle } from 'lucide-react';

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
  department: string | null;
  advisory: string | null;
  is_active: boolean;
  last_login: string | null;
  two_factor_enabled: boolean;
  last_activity: string | null;
  assigned_students_count: number;
  incidents_logged_count: number;
}

interface ActivityLogEntry {
  id: number;
  user_id: number;
  action: string;
  details: string | null;
  created_at: string;
  username: string;
  first_name: string;
  last_name: string;
}

const roleOptions = [
  { value: '', label: 'All Roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'counselor', label: 'Counselor' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'user', label: 'User' },
];

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

export default function Users() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterRole, setFilterRole] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilterUser, setActivityFilterUser] = useState('');
  const [activityFilterAction, setActivityFilterAction] = useState('');
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
    department: '',
    advisory: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadUsers();
    // Set up heartbeat for online indicator
    const heartbeatInterval = setInterval(() => {
      if (currentUser) {
        api.put(`/users/${currentUser.id}/heartbeat`).catch(() => {});
      }
    }, 60000); // Every minute
    return () => clearInterval(heartbeatInterval);
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

  const loadActivityLogs = async () => {
    try {
      const params: Record<string, string> = {};
      if (activityFilterUser) params.user_id = activityFilterUser;
      if (activityFilterAction) params.action = activityFilterAction;
      params.limit = '100';
      const res = await api.get('/users/activity', { params });
      setActivityLogs(res.data || []);
    } catch (error) {
      console.error('Failed to load activity logs', error);
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
          department: formData.department || null,
          advisory: formData.advisory || null,
        });
        if (formData.password) {
          await api.put(`/users/${editingUser.id}/password`, { password: formData.password });
        }
        setMessage({ type: 'success', text: t('User updated successfully!') });
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
          department: formData.department || null,
          advisory: formData.advisory || null,
        });
        setMessage({ type: 'success', text: t('User created successfully!') });
      }
      setTimeout(() => {
        setShowModal(false);
        resetForm();
        loadUsers();
      }, 1000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('Failed to save user') });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (user: User) => {
    if (!confirm(t('Are you sure you want to deactivate {name}? They will not be able to log in until reactivated.', { name: `${user.first_name} ${user.last_name}` }))) return;
    try {
      await api.delete(`/users/${user.id}`);
      loadUsers();
      setMessage({ type: 'success', text: t('User deactivated successfully') });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('Failed to deactivate user') });
    }
  };

  const handleReactivate = async (user: User) => {
    try {
      await api.put(`/users/${user.id}/reactivate`);
      loadUsers();
      setMessage({ type: 'success', text: t('User reactivated successfully') });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('Failed to reactivate user') });
    }
  };

  const openDeleteModal = (user: User, e: React.MouseEvent) => {
    e.stopPropagation();
    setUserToDelete(user);
    setDeleteConfirmText('');
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    if (deleteConfirmText.toLowerCase() !== userToDelete.username.toLowerCase() &&
        deleteConfirmText.toLowerCase() !== userToDelete.email?.toLowerCase()) {
      setMessage({ type: 'error', text: t('Please type the username or email exactly as shown') });
      return;
    }
    try {
      await api.delete(`/users/${userToDelete.id}`);
      setShowDeleteModal(false);
      setUserToDelete(null);
      setDeleteConfirmText('');
      loadUsers();
      setMessage({ type: 'success', text: t('User deactivated successfully') });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || t('Failed to delete user') });
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
        department: user.department || '',
        advisory: user.advisory || '',
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
      department: '',
      advisory: '',
    });
  };

  const isUserOnline = (lastActivity: string | null) => {
    if (!lastActivity) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastActivity) > fiveMinutesAgo;
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700';
      case 'counselor': return 'bg-blue-100 text-blue-700';
      case 'teacher': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (!u.id) return false;
      if (filterRole && u.role !== filterRole) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!u.first_name?.toLowerCase().includes(query) &&
            !u.last_name?.toLowerCase().includes(query) &&
            !u.username?.toLowerCase().includes(query) &&
            !u.email?.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [users, filterRole, searchQuery]);

  const formatLastLogin = (lastLogin: string | null) => {
    if (!lastLogin) return t('Never');
    const date = new Date(lastLogin);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t('Just now');
    if (diffMins < 60) return t('{count}m ago', { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('{count}h ago', { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('{count}d ago', { count: diffDays });
    return date.toLocaleDateString();
  };

  const openActivityModal = () => {
    loadActivityLogs();
    setShowActivityModal(true);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl md:text-2xl font-bold">{t('User Management')}</h1>
        </div>
        <div className="flex items-center gap-3">
          {currentUser?.role === 'admin' && (
            <button onClick={openActivityModal} className="btn btn-secondary flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t('Activity Log')}
            </button>
          )}
          <button onClick={() => openModal()} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" /> {t('Add User')}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg mb-4 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="float-right"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('Search users...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="select w-48"
          >
            {roleOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">
            {filteredUsers.length === 1 ? t('1 user') : t('{count} users', { count: filteredUsers.length })}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">{t('Loading...')}</div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <UserIcon className="w-12 h-12 mx-auto mb-2" />
          <p>{t('No users found')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className={`bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer ${!user.is_active ? 'opacity-60' : ''}`}
              onClick={() => navigate(`/users/${user.id}`)}
            >
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {user.profile_picture && typeof user.profile_picture === 'string' && user.profile_picture.trim() ? (
                      <img src={user.profile_picture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-7 h-7 text-blue-600" />
                    )}
                  </div>
                  {/* Online indicator */}
                  {user.is_active && isUserOnline(user.last_activity) && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" title={t('Online')} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {user.first_name} {user.last_name}
                    </h3>
                    {!user.is_active && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">{t('Deactivated')}</span>
                    )}
                  </div>
                  <p className="text-sm text-blue-600 font-medium">@{user.username}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs ${getRoleBadgeColor(user.role)}`}>
                    {t(user.role)}
                  </span>
                </div>
              </div>

              {/* Stats Row */}
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                <div title={t('Last Login')}>
                  <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    {formatLastLogin(user.last_login)}
                  </div>
                </div>
                <div title={t('Assigned Students')}>
                  <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
                    <UsersIcon className="w-3 h-3" />
                    {user.assigned_students_count || 0}
                  </div>
                </div>
                <div title={t('Incidents Logged')}>
                  <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
                    <FileText className="w-3 h-3" />
                    {user.incidents_logged_count || 0}
                  </div>
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
                {user.department && (
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <UserCheck className="w-3 h-3" /> {t(user.department)}
                  </p>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); openModal(user); }}
                  className="btn btn-secondary text-xs py-1.5 px-3 flex-1"
                >
                  {t('Edit')}
                </button>
                {user.is_active ? (
                  <button
                    onClick={() => handleDeactivate(user)}
                    className="btn btn-secondary text-xs py-1.5 px-3"
                    title={t('Deactivate')}
                  >
                    <Power className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReactivate(user); }}
                    className="btn btn-primary text-xs py-1.5 px-3"
                    title={t('Reactivate')}
                  >
                    <Power className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => openDeleteModal(user, e)}
                  className="btn btn-danger text-xs py-1.5 px-3"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingUser && editingUser.id ? t('Edit User') : t('Add New User')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg" disabled={saving}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex justify-center mb-2">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                    {formData.profile_picture && typeof formData.profile_picture === 'string' && formData.profile_picture.trim() ? (
                      <img src={formData.profile_picture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-10 h-10 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{t('Username *')}</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">{t('Role')}</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="select"
                  >
                    <option value="user">{t('User')}</option>
                    <option value="teacher">{t('Teacher')}</option>
                    <option value="counselor">{t('Counselor')}</option>
                    <option value="admin">{t('Admin')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{t('First Name')}</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">{t('Last Name')}</label>
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
                  <label className="form-label">{t('Password *')}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input"
                    required
                    placeholder={t('Min 8 chars, 1 number, 1 special char')}
                  />
                </div>
              )}

              {editingUser && editingUser.id && (
                <div>
                  <label className="form-label">{t('New Password (leave blank to keep)')}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input"
                    placeholder={t('Min 8 chars, 1 number, 1 special char')}
                  />
                </div>
              )}

              <div>
                <label className="form-label">{t('Email')}</label>
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
                  <label className="form-label">{t('Phone')}</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="input"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="form-label">{t('Classroom')}</label>
                  <input
                    type="text"
                    value={formData.classroom}
                    onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
                    className="input"
                    placeholder={t('Room 101')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{t('Department')}</label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="select"
                  >
                    <option value="">{t('Select Department')}</option>
                    {departmentOptions.map(dept => (
                      <option key={dept} value={dept}>{t(dept)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">{t('Advisory/Homeroom')}</label>
                  <input
                    type="text"
                    value={formData.advisory}
                    onChange={(e) => setFormData({ ...formData, advisory: e.target.value })}
                    className="input"
                    placeholder={t('e.g., Lions, Eagles')}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">{t('Profile Picture URL')}</label>
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
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.username}
                  className="btn btn-primary flex-1"
                >
                  {saving ? <Loader className="w-5 h-5 animate-spin" /> : (editingUser && editingUser.id ? t('Update') : t('Create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                {t('Deactivate User')}
              </h2>
              <button onClick={() => setShowDeleteModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-gray-600">
                {t('This will deactivate {name} (@{username}). They will not be able to log in until you reactivate them.', { name: `${userToDelete.first_name} ${userToDelete.last_name}`, username: userToDelete.username })}
              </p>
              <p className="text-gray-600">
                {t('All their data and audit history will be preserved.')}
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-700">
                  {t("Type the user's username (@{username}) or email ({email}) to confirm:", { username: userToDelete.username, email: userToDelete.email })}
                </p>
              </div>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="input"
                placeholder={t('Type username or email to confirm')}
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-secondary flex-1"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirmText.toLowerCase() !== userToDelete.username.toLowerCase() &&
                         deleteConfirmText.toLowerCase() !== userToDelete.email?.toLowerCase()}
                className="btn btn-danger flex-1"
              >
                {t('Deactivate User')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log Modal */}
      {showActivityModal && (
        <div className="modal-overlay" onClick={() => setShowActivityModal(false)}>
          <div className="modal max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('User Activity Log')}</h2>
              <button onClick={() => setShowActivityModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-4">
              <select
                value={activityFilterUser}
                onChange={(e) => { setActivityFilterUser(e.target.value); loadActivityLogs(); }}
                className="select w-48"
              >
                <option value="">{t('All Users')}</option>
                {users.filter(u => u.is_active).map(u => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
              <select
                value={activityFilterAction}
                onChange={(e) => { setActivityFilterAction(e.target.value); loadActivityLogs(); }}
                className="select w-48"
              >
                <option value="">{t('All Actions')}</option>
                <option value="CREATE_USER">{t('Create User')}</option>
                <option value="UPDATE_USER">{t('Update User')}</option>
                <option value="DEACTIVATE_USER">{t('Deactivate User')}</option>
                <option value="REACTIVATE_USER">{t('Reactivate User')}</option>
                <option value="LOGIN">{t('Login')}</option>
              </select>
              <button onClick={loadActivityLogs} className="btn btn-secondary">
                {t('Refresh')}
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Timestamp')}</th>
                    <th>{t('User')}</th>
                    <th>{t('Action')}</th>
                    <th>{t('Details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-400">{t('No activity logs found')}</td>
                    </tr>
                  ) : (
                    activityLogs.map(log => (
                      <tr key={log.id}>
                        <td className="text-sm">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="text-sm">{log.first_name} {log.last_name}</td>
                        <td className="text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            log.action === 'CREATE_USER' ? 'bg-green-100 text-green-700' :
                            log.action === 'DEACTIVATE_USER' ? 'bg-red-100 text-red-700' :
                            log.action === 'REACTIVATE_USER' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {t(log.action.replace('_', ' '))}
                          </span>
                        </td>
                        <td className="text-sm text-gray-500">{log.details || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}